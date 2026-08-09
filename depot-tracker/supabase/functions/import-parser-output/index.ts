// =====================================================================
// supabase/functions/import-parser-output/index.ts
// Bulk-Upsert der 4 Parser-JSON-Dateien (§7). Optional - der ImportScreen
// nutzt fuer Single-User den einfacheren Client-Upsert; diese Function ist
// die "atomarere" Alternative mit Service-Role.
// Body: { transactions: [], portfolio: {}, securities: [], warningsFile: {} }
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { makeLogger } from "../_shared/logger.ts";

const log = makeLogger("import-parser-output");

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Nutzer via Anon-Client identifizieren...
    const authHeader = req.headers.get("Authorization") ?? "";
    const authClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) return json({ error: "unauthorized" }, 401);

    // ...Schreiben mit Service-Role (Zwei-Client-Muster)
    const db = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });

    const body = await req.json();
    const { transactions, portfolio, securities, warningsFile } = body ?? {};
    if (!Array.isArray(transactions) || !portfolio?.positions || !Array.isArray(securities)) {
      return json({ error: "unvollstaendiger Payload" }, 400);
    }

    const uid = user.id;

    const { data: run, error: runErr } = await db
      .from("import_runs")
      .insert({
        user_id: uid,
        generated_at: portfolio.generated_at ?? null,
        summary: warningsFile?.summary ?? null,
        counts: {
          transactions: transactions.length,
          securities: securities.length,
          warnings: warningsFile?.issues?.length ?? 0,
        },
      })
      .select()
      .single();
    if (runErr) throw runErr;

    for (const part of chunk(securities.map((s: Record<string, unknown>) => ({
      user_id: uid, isin: s.isin, wkn: s.wkn ?? null, name: s.name ?? null,
      verwahrart: s.verwahrart ?? null, currency: s.currency ?? "EUR",
    })), 500)) {
      const { error } = await db.from("securities").upsert(part, { onConflict: "user_id,isin" });
      if (error) throw new Error(`securities: ${error.message}`);
    }

    for (const part of chunk(transactions.map((t: Record<string, unknown>) => ({ user_id: uid, ...t })), 500)) {
      const { error } = await db.from("transactions").upsert(part, { onConflict: "user_id,id" });
      if (error) throw new Error(`transactions: ${error.message}`);
    }

    for (const part of chunk(portfolio.positions.map((p: Record<string, unknown>) => ({
      user_id: uid, isin: p.isin, data: p, generated_at: portfolio.generated_at ?? null,
    })), 500)) {
      const { error } = await db.from("portfolio_seed").upsert(part, { onConflict: "user_id,isin" });
      if (error) throw new Error(`portfolio_seed: ${error.message}`);
    }

    const warnRows = (warningsFile?.issues ?? []).map((w: Record<string, unknown>) => ({
      user_id: uid, code: w.code, level: w.level ?? "warn", isin: w.isin ?? null,
      ref: w.ref ?? null, message: w.message ?? null, import_run_id: run.id,
    }));
    for (const part of chunk(warnRows, 500)) {
      // Status bestehender Warnungen bleibt erhalten (ignoreDuplicates)
      const { error } = await db
        .from("warnings")
        .upsert(part, { onConflict: "user_id,code,isin,ref", ignoreDuplicates: true });
      if (error) throw new Error(`warnings: ${error.message}`);
    }

    log.info("import ok", { uid, transactions: transactions.length });
    return json({
      inserted: { transactions: transactions.length, securities: securities.length, warnings: warnRows.length },
      run_id: run.id,
    }, 200);
  } catch (e) {
    log.error("import failed", { error: String(e instanceof Error ? e.message : e) });
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}
