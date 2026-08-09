// =====================================================================
// supabase/functions/fetch-prices/index.ts
// Taeglicher EOD-Abruf marketstack (Batch je MIC) + FX-Fallback (§9.3).
//
// Ablauf:
//   1. verified-Securities nach price_mic gruppieren -> je MIC EIN Call:
//        GET /v2/eod/latest?symbols=A,B,C&exchange={MIC}
//      Kurs = close (bzw. adj_close), Waehrung = price_currency.
//   2. needs_review-Securities (nur Heimatboerse): Einzelabruf ohne exchange,
//      raw_price * fx_rate -> EUR. FX via exchangerate.host, gecacht in fx_rates
//      (1 Call je Fremdwaehrung und Tag).
//   3. UPSERT price_quotes (price in EUR, raw_price, raw_currency, fx_rate,
//      as_of, source). Response: aktualisierte ISINs + Liste ohne Kurs.
//
// Secrets: MARKETSTACK_API_KEY. Aufruf: POST (Button oder Cron).
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeLogger } from "../_shared/logger.ts";

const MARKETSTACK_BASE = "https://api.marketstack.com/v2";
const log = makeLogger("fetch-prices");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface EodBar {
  symbol?: string;
  close?: number;
  adj_close?: number;
  price_currency?: string;
  date?: string;
}

async function eodLatestBatch(symbols: string[], key: string, mic?: string): Promise<EodBar[]> {
  const rows: EodBar[] = [];
  for (const part of chunk(symbols, 100)) {
    const params = new URLSearchParams({ access_key: key, symbols: part.join(",") });
    if (mic) params.set("exchange", mic);
    const res = await fetch(`${MARKETSTACK_BASE}/eod/latest?${params}`);
    if (!res.ok) {
      log.warn("eod/latest fehlgeschlagen", { status: res.status, mic });
      continue;
    }
    const json = await res.json();
    if (Array.isArray(json?.data)) rows.push(...json.data);
  }
  return rows;
}

async function getFxRate(
  currency: string,
  cache: Map<string, number>,
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<number | null> {
  if (currency === "EUR") return 1;
  const pair = `${currency}/EUR`;
  if (cache.has(pair)) return cache.get(pair)!;

  const today = new Date().toISOString().slice(0, 10);
  const { data: cached } = await supabase
    .from("fx_rates")
    .select("rate, as_of")
    .eq("pair", pair)
    .maybeSingle();
  if (cached && cached.as_of === today) {
    cache.set(pair, Number(cached.rate));
    return Number(cached.rate);
  }

  try {
    const res = await fetch(
      `https://api.exchangerate.host/latest?base=${currency}&symbols=EUR`,
    );
    if (!res.ok) throw new Error(String(res.status));
    const json = await res.json();
    const rate = Number(json?.rates?.EUR);
    if (!isFinite(rate) || rate <= 0) throw new Error("kein Kurs");
    cache.set(pair, rate);
    await supabase.from("fx_rates").upsert(
      { user_id: userId, pair, rate, as_of: today, source: "exchangerate.host" },
      { onConflict: "user_id,pair" },
    );
    return rate;
  } catch (e) {
    log.warn("FX-Abruf fehlgeschlagen", { pair, error: String(e) });
    return cached ? Number(cached.rate) : null; // veralteter Cache besser als nichts
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const msKey = Deno.env.get("MARKETSTACK_API_KEY");
    if (!msKey) throw new Error("MARKETSTACK_API_KEY fehlt");

    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    const { data: secs, error: secErr } = await supabase
      .from("securities")
      .select("isin, price_symbol, price_mic, price_currency, mapping_status")
      .in("mapping_status", ["verified", "needs_review", "manual"])
      .not("price_symbol", "is", null);
    if (secErr) throw secErr;

    const now = new Date().toISOString();
    const fxCache = new Map<string, number>();
    let updated = 0;
    const missing: string[] = [];

    // 1) verified: nach MIC gruppieren, Batch-Call je MIC
    const byMic = new Map<string, Array<{ isin: string; symbol: string }>>();
    const homeListing: Array<{ isin: string; symbol: string; currency: string | null }> = [];
    for (const s of secs ?? []) {
      if (s.price_mic) {
        (byMic.get(s.price_mic) ?? byMic.set(s.price_mic, []).get(s.price_mic)!).push({
          isin: s.isin,
          symbol: s.price_symbol,
        });
      } else {
        homeListing.push({ isin: s.isin, symbol: s.price_symbol, currency: s.price_currency });
      }
    }

    for (const [mic, entries] of byMic) {
      const bars = await eodLatestBatch(entries.map((e) => e.symbol), msKey, mic);
      const barBySymbol = new Map(bars.map((b) => [b.symbol, b]));
      for (const e of entries) {
        const bar = barBySymbol.get(e.symbol);
        const price = Number(bar?.close ?? bar?.adj_close);
        if (!bar || !isFinite(price) || price <= 0) {
          missing.push(e.isin);
          continue;
        }
        const currency = (bar.price_currency ?? "EUR").toUpperCase();
        let eur = price;
        let fx: number | null = null;
        if (currency !== "EUR") {
          fx = await getFxRate(currency, fxCache, supabase, user.id);
          if (fx == null) {
            missing.push(e.isin);
            continue;
          }
          eur = price * fx;
        }
        const { error } = await supabase.from("price_quotes").upsert(
          {
            user_id: user.id, isin: e.isin, price: eur,
            raw_price: price, raw_currency: currency === "EUR" ? null : currency,
            fx_rate: fx, as_of: bar.date ?? now,
            source: currency === "EUR" ? "marketstack" : "marketstack+fx",
            updated_at: now,
          },
          { onConflict: "user_id,isin" },
        );
        if (error) log.error("upsert price_quotes", { isin: e.isin, error: error.message });
        else updated++;
      }
    }

    // 2) needs_review (Heimatboerse, FX noetig): Einzelabruf ohne exchange
    for (const e of homeListing) {
      const bars = await eodLatestBatch([e.symbol], msKey);
      const bar = bars[0];
      const price = Number(bar?.close ?? bar?.adj_close);
      if (!bar || !isFinite(price) || price <= 0) {
        missing.push(e.isin);
        continue;
      }
      const currency = (bar.price_currency ?? e.currency ?? "EUR").toUpperCase();
      const fx = await getFxRate(currency, fxCache, supabase, user.id);
      if (fx == null) {
        missing.push(e.isin);
        continue;
      }
      const { error } = await supabase.from("price_quotes").upsert(
        {
          user_id: user.id, isin: e.isin, price: price * fx,
          raw_price: price, raw_currency: currency === "EUR" ? null : currency,
          fx_rate: currency === "EUR" ? null : fx, as_of: bar.date ?? now,
          source: currency === "EUR" ? "marketstack" : "marketstack+fx",
          updated_at: now,
        },
        { onConflict: "user_id,isin" },
      );
      if (error) log.error("upsert price_quotes", { isin: e.isin, error: error.message });
      else updated++;
    }

    log.info("fertig", { updated, missing: missing.length });
    return json({ updated, missing }, 200);
  } catch (e) {
    log.error("fetch-prices", { error: String(e instanceof Error ? e.message : e) });
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
