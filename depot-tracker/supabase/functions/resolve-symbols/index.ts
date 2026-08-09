// =====================================================================
// supabase/functions/resolve-symbols/index.ts
// Depot-Tracker – ISIN/WKN -> marketstack-Ticker (§9.2)
//
// Gegen die offizielle marketstack v2 OpenAPI-Spec verifiziert:
//   - /v2/tickers/{symbol}            -> TickerResponse (flach): { isin, symbol,
//                                        name, stock_exchange:{ mic, country_code } }
//   - /v2/eod/latest?symbols=&exchange -> { data: [ EODBar ] }
//                     EODBar: { close, adj_close, price_currency, symbol,
//                               exchange_code, name, date }
//   - `exchange`-Query-Param (MIC) erlaubt gezielten Zugriff aufs dt. Listing.
//   - tickerslist kann NICHT per ISIN suchen -> OpenFIGI liefert die Ticker.
//
// Kaskade pro Wertpapier:
//   1) OpenFIGI-Mapping (ISIN gefiltert auf dt. MIC; WKN als 2. Schluessel)
//        -> Kandidaten-Ticker (+ FIGI, bevorzugter MIC)
//   2) EUR-Kurs auf dt. Handelsplatz pruefen:
//        /v2/eod/latest?symbols={ticker}&exchange={MIC}
//        -> EODBar mit price_currency === 'EUR' und close > 0  =>  starkes Signal
//   3) Instrument-Identitaet bestaetigen (best effort):
//        /v2/tickers/{ticker} -> isin === unsere ISIN
//   4) Ergebnis + Confidence in securities.* speichern.
//
// Confidence/Status:
//   EUR-EOD & ISIN-Match      -> verified,     conf 5
//   EUR-EOD, aber kein Match  -> verified,     conf 4  (ISIN via blankem Ticker
//                                                       nicht kreuzpruefbar)
//   kein EUR-EOD, ISIN-Match  -> needs_review, conf 2  (nur Heimatboerse -> FX)
//   sonst                     -> unresolved
//
// Secrets: MARKETSTACK_API_KEY (Pflicht), OPENFIGI_API_KEY (optional).
// Body (optional): { "isins": ["..."], "force": false }
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Konstanten -------------------------------------------------------

// Deutsche Handelsplaetze in Praeferenzreihenfolge (Xetra = EUR-Referenzmarkt).
// Tradegate ("XGAT"/"TGAT") ist bei Bedarf ergaenzbar.
const GERMAN_MICS = ["XETR", "XFRA", "XSTU", "XMUN", "XDUS", "XBER", "XHAM", "XHAN"];

const OPENFIGI_URL = "https://api.openfigi.com/v3/mapping";
const MARKETSTACK_BASE = "https://api.marketstack.com/v2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// --- Typen ------------------------------------------------------------

interface Security { isin: string; wkn: string | null; name: string | null; }
interface FigiHit { ticker: string; figi: string; micCode?: string; exchCode?: string; }

interface Resolution {
  isin: string;
  price_symbol: string | null;
  price_mic: string | null;
  price_currency: string | null;
  figi: string | null;
  mapping_source: "openfigi" | "marketstack" | "manual" | null;
  mapping_status: "verified" | "needs_review" | "manual" | "unresolved";
  mapping_confidence: number | null;
}

// --- Helfer -----------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---- OpenFIGI --------------------------------------------------------

async function openFigiMap(
  jobs: Array<Record<string, string>>,
  apiKey: string | undefined,
): Promise<Array<{ data?: FigiHit[]; warning?: string }>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-OPENFIGI-APIKEY"] = apiKey;

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(OPENFIGI_URL, {
      method: "POST", headers, body: JSON.stringify(jobs),
    });
    if (res.status === 429) { await sleep(2000 * (attempt + 1)); continue; } // Rate-Limit
    if (!res.ok) throw new Error(`OpenFIGI ${res.status}: ${await res.text()}`);
    return await res.json();
  }
  throw new Error("OpenFIGI: wiederholt rate-limited");
}

// Kandidaten-Ticker (dt. Listing bevorzugt) fuer EIN Wertpapier.
async function resolveCandidates(sec: Security, figiKey: string | undefined): Promise<FigiHit[]> {
  const isinJobs = GERMAN_MICS.map((mic) => ({
    idType: "ID_ISIN", idValue: sec.isin, micCode: mic,
  }));
  const wknJobs = sec.wkn ? [{ idType: "ID_WERTPAPIER", idValue: sec.wkn }] : [];
  const jobs = [...isinJobs, ...wknJobs];

  const batchSize = figiKey ? 100 : 10; // ohne Key: <=10 Jobs/Request
  const hits: FigiHit[] = [];

  for (const part of chunk(jobs, batchSize)) {
    const results = await openFigiMap(part, figiKey);
    results.forEach((r, i) => {
      const jobMic = (part[i] as Record<string, string>).micCode;
      (r.data ?? []).forEach((d) =>
        hits.push({ ticker: d.ticker, figi: d.figi, micCode: d.micCode ?? jobMic, exchCode: d.exchCode }));
    });
    if (!figiKey) await sleep(2600); // ohne Key ~25 Req/min
  }

  const seen = new Set<string>();
  return hits
    .filter((h) => h.ticker && !seen.has(h.ticker) && (seen.add(h.ticker), true))
    .sort((a, b) => micRank(a.micCode) - micRank(b.micCode));
}

function micRank(mic?: string): number {
  const i = mic ? GERMAN_MICS.indexOf(mic) : -1;
  return i === -1 ? 999 : i;
}

// ---- marketstack -----------------------------------------------------

// Ticker-Info (flach): isin + stock_exchange.mic – Instrument-Anker.
async function marketstackTicker(symbol: string, key: string):
  Promise<{ symbol: string; isin?: string; mic?: string } | null> {
  const url = `${MARKETSTACK_BASE}/tickers/${encodeURIComponent(symbol)}?access_key=${key}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`marketstack tickers ${res.status}`);
  const t = await res.json(); // TickerResponse ist flach (kein data-Wrapper)
  if (!t || !t.symbol) return null;
  return { symbol: t.symbol, isin: t.isin ?? undefined, mic: t.stock_exchange?.mic ?? undefined };
}

// Juengster EOD-Schluss; optional auf eine Boerse (MIC) gefiltert.
// Waehrung steht im EODBar-Feld price_currency.
async function marketstackEodLatest(symbol: string, key: string, mic?: string):
  Promise<{ price: number; currency?: string; symbol?: string } | null> {
  const params = new URLSearchParams({ access_key: key, symbols: symbol });
  if (mic) params.set("exchange", mic);
  const res = await fetch(`${MARKETSTACK_BASE}/eod/latest?${params}`);
  if (!res.ok) return null;
  const json = await res.json();                    // { data: [ EODBar ] }
  const row = Array.isArray(json?.data) ? json.data[0] : undefined;
  if (!row) return null;
  const price = Number(row.close ?? row.adj_close);
  if (!isFinite(price) || price <= 0) return null;
  return { price, currency: row.price_currency ?? undefined, symbol: row.symbol ?? symbol };
}

// ---- Ein Wertpapier aufloesen ----------------------------------------

async function resolveOne(
  sec: Security, msKey: string, figiKey: string | undefined,
): Promise<Resolution> {
  const base: Resolution = {
    isin: sec.isin, price_symbol: null, price_mic: null, price_currency: null,
    figi: null, mapping_source: null, mapping_status: "unresolved", mapping_confidence: null,
  };

  let candidates: FigiHit[] = [];
  try { candidates = await resolveCandidates(sec, figiKey); }
  catch (_e) { /* OpenFIGI-Fehler -> unresolved */ }
  if (candidates.length === 0) return base;

  let fallback: Resolution | null = null;

  for (const cand of candidates) {
    // ISIN-Kreuzpruefung (best effort; blanker Ticker kann kollidieren)
    let isinMatch = false;
    try {
      const info = await marketstackTicker(cand.ticker, msKey);
      await sleep(300);
      isinMatch = !!(info?.isin && info.isin.toUpperCase() === sec.isin.toUpperCase());
    } catch (_e) { /* ignorieren */ }

    // EUR-Kurs auf bevorzugtem dt. Handelsplatz suchen
    const micsToTry = cand.micCode && GERMAN_MICS.includes(cand.micCode)
      ? [cand.micCode, ...GERMAN_MICS.filter((m) => m !== cand.micCode)]
      : GERMAN_MICS;

    for (const mic of micsToTry) {
      const eod = await marketstackEodLatest(cand.ticker, msKey, mic);
      await sleep(300);
      if (eod && (eod.currency ?? "EUR").toUpperCase() === "EUR") {
        return {
          isin: sec.isin, price_symbol: eod.symbol ?? cand.ticker, price_mic: mic,
          price_currency: "EUR", figi: cand.figi ?? null, mapping_source: "openfigi",
          mapping_status: "verified", mapping_confidence: isinMatch ? 5 : 4,
        };
      }
    }

    // Kein EUR-Listing gefunden, aber ISIN passt -> Heimatboerse (FX noetig) merken
    if (isinMatch && !fallback) {
      const eod = await marketstackEodLatest(cand.ticker, msKey);
      await sleep(300);
      if (eod) {
        fallback = {
          isin: sec.isin, price_symbol: eod.symbol ?? cand.ticker, price_mic: null,
          price_currency: eod.currency ?? null, figi: cand.figi ?? null,
          mapping_source: "openfigi", mapping_status: "needs_review", mapping_confidence: 2,
        };
      }
    }
  }

  if (fallback) return fallback;
  return { ...base, figi: candidates[0]?.figi ?? null };
}

// --- HTTP-Handler -----------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const msKey = Deno.env.get("MARKETSTACK_API_KEY");
    const figiKey = Deno.env.get("OPENFIGI_API_KEY") || undefined;
    if (!msKey) throw new Error("MARKETSTACK_API_KEY fehlt");

    // Nutzer-gebundener Client: RLS greift, wir schreiben nur eigene Zeilen.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const forceAll: boolean = body?.force === true;
    const onlyIsins: string[] | undefined = Array.isArray(body?.isins) ? body.isins : undefined;

    let q = supabase.from("securities").select("isin, wkn, name");
    if (onlyIsins?.length) q = q.in("isin", onlyIsins);
    else if (!forceAll) q = q.in("mapping_status", ["unresolved", "needs_review"]);
    const { data: secs, error: secErr } = await q;
    if (secErr) throw secErr;

    const summary = { total: secs?.length ?? 0, verified: 0, needs_review: 0, unresolved: 0 };
    const details: Resolution[] = [];

    for (const sec of (secs ?? []) as Security[]) {
      const r = await resolveOne(sec, msKey, figiKey);
      details.push(r);
      summary[r.mapping_status === "verified" ? "verified"
        : r.mapping_status === "needs_review" ? "needs_review" : "unresolved"]++;

      const { error: upErr } = await supabase.from("securities").update({
        price_symbol: r.price_symbol, price_mic: r.price_mic, price_currency: r.price_currency,
        figi: r.figi, mapping_source: r.mapping_source, mapping_status: r.mapping_status,
        mapping_confidence: r.mapping_confidence, mapping_checked_at: new Date().toISOString(),
      }).eq("user_id", user.id).eq("isin", sec.isin);
      if (upErr) console.error("update securities", sec.isin, upErr.message);
    }

    return json({ summary, details }, 200);
  } catch (e) {
    console.error("resolve-symbols", e instanceof Error ? e.message : e);
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
