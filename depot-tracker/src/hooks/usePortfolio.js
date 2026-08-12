import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { computePortfolio } from "../lib/portfolio";
import { logger } from "../lib/logger";

async function fetchAll(table, { select = "*", ownerId } = {}) {
  // Supabase paginiert bei 1000 - fuer 907 Transaktionen reicht eine Seite,
  // aber wir blaettern sicherheitshalber.
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    let q = supabase.from(table).select(select);
    if (ownerId) q = q.eq("owner_id", ownerId); // E9: rechnungsrelevante Tabellen je Inhaber
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

const EMPTY_RAW = {
  transactions: [], overrides: [], manualCostLots: [], transferLinks: [],
  securities: [], quotes: [], priceOverrides: [], manualTransactions: [],
};

/**
 * Laedt transactions + overrides + manual lots + transfer links + Kurse (global)
 * fuer den AKTIVEN Depotinhaber (E9 - harter Partitionsschluessel, nicht nur ein
 * Anzeige-Filter), ruft die Engine auf und memoized das Ergebnis. `refresh()`
 * nach jeder Korrektur aufrufen (Recompute-Fluss, DESIGN §12).
 *
 * `ownerId`/`ownersReady` kommen aus useOwners(): solange ownersReady=false ist
 * noch unklar, ob/welcher Inhaber aktiv ist (Ladephase). Ist ownersReady=true
 * und ownerId=null, existiert (noch) kein Inhaber - dann wird sofort ein leeres,
 * nicht ladendes Ergebnis geliefert (fuehrt zur "Noch keine Daten"-Ansicht statt
 * endlosem Laden).
 */
export function usePortfolio(ownerId, ownersReady) {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!ownersReady) return; // Inhaber-Auswahl noch nicht bekannt
    if (!ownerId) {
      setRaw(EMPTY_RAW);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [transactions, overrides, manualCostLots, transferLinks, securities, quotes, priceOverrides, manualTransactions] =
          await Promise.all([
            fetchAll("transactions", { ownerId }),
            fetchAll("transaction_overrides", { ownerId }),
            fetchAll("manual_cost_lots", { ownerId }),
            fetchAll("transfer_links", { ownerId }),
            fetchAll("securities"),      // global (E9): kein owner_id-Filter
            fetchAll("price_quotes"),    // global
            fetchAll("price_overrides"), // global
            fetchAll("manual_transactions", { ownerId }),
          ]);
        if (!cancelled) setRaw({ transactions, overrides, manualCostLots, transferLinks, securities, quotes, priceOverrides, manualTransactions });
      } catch (e) {
        logger.error("usePortfolio load failed", { message: e.message });
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version, ownerId, ownersReady]);

  const result = useMemo(() => {
    if (!raw) return null;
    const prices = {};
    for (const q of raw.quotes) {
      if (q.price != null) prices[q.isin] = { price: Number(q.price), as_of: q.as_of, source: q.source };
    }
    for (const o of raw.priceOverrides) {
      prices[o.isin] = { price: Number(o.price), as_of: o.as_of, isOverride: true };
    }
    const securityMeta = {};
    for (const s of raw.securities) securityMeta[s.isin] = s;

    const toNum = (t) => ({
      ...t,
      shares: Number(t.shares), price: Number(t.price), gross: Number(t.gross),
      fees: Number(t.fees), tax: Number(t.tax), net: Number(t.net),
      reported_realized_pl: t.reported_realized_pl == null ? null : Number(t.reported_realized_pl),
      cost_lots: t.cost_lots ?? [],
      flags: t.flags ?? [],
      date: typeof t.date === "string" ? t.date.slice(0, 10) : t.date,
    });

    // Manuell nachgetragene Transaktionen (F2): vor dem Engine-Aufruf ins
    // kanonische Schema mappen und einmischen - die Engine bleibt unveraendert.
    const manualTxCanonical = (raw.manualTransactions ?? []).map((m) => ({
      id: `manual:${m.id}`,
      source: "manual",
      date: String(m.date).slice(0, 10),
      type: m.type,
      isin: m.isin,
      wkn: securityMeta[m.isin]?.wkn ?? null,
      name: securityMeta[m.isin]?.name ?? null,
      shares: Number(m.shares),
      price: m.price == null ? 0 : Number(m.price),
      gross: m.gross == null ? 0 : Number(m.gross),
      fees: Number(m.fees ?? 0),
      tax: Number(m.tax ?? 0),
      net: Number(m.net),
      currency: m.currency ?? "EUR",
      raw_ref: m.note ?? "manuell nachgetragen",
      reported_realized_pl: m.reported_realized_pl == null ? null : Number(m.reported_realized_pl),
      cost_lots: [],
      flags: ["MANUAL"],
    }));

    return computePortfolio({
      transactions: [...raw.transactions.map(toNum), ...manualTxCanonical],
      overrides: raw.overrides,
      manualCostLots: raw.manualCostLots.map((m) => ({ ...m, shares: Number(m.shares), cost: Number(m.cost), date: String(m.date).slice(0, 10) })),
      transferLinks: raw.transferLinks.map((l) => ({ ...l, carried_cost_basis: l.carried_cost_basis == null ? null : Number(l.carried_cost_basis) })),
      prices,
      securityMeta,
    });
  }, [raw]);

  return { result, raw, loading, error, refresh };
}
