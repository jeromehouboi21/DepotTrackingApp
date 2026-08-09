import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { computePortfolio } from "../lib/portfolio";
import { logger } from "../lib/logger";

async function fetchAll(table, select = "*") {
  // Supabase paginiert bei 1000 - fuer 907 Transaktionen reicht eine Seite,
  // aber wir blaettern sicherheitshalber.
  const pageSize = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

/**
 * Laedt transactions + overrides + manual lots + transfer links + securities +
 * Kurse, ruft die Engine auf und memoized das Ergebnis. `refresh()` nach jeder
 * Korrektur aufrufen (Recompute-Fluss, DESIGN §12).
 */
export function usePortfolio() {
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [transactions, overrides, manualCostLots, transferLinks, securities, quotes, priceOverrides] =
          await Promise.all([
            fetchAll("transactions"),
            fetchAll("transaction_overrides"),
            fetchAll("manual_cost_lots"),
            fetchAll("transfer_links"),
            fetchAll("securities"),
            fetchAll("price_quotes"),
            fetchAll("price_overrides"),
          ]);
        if (!cancelled) setRaw({ transactions, overrides, manualCostLots, transferLinks, securities, quotes, priceOverrides });
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
  }, [version]);

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

    return computePortfolio({
      transactions: raw.transactions.map(toNum),
      overrides: raw.overrides,
      manualCostLots: raw.manualCostLots.map((m) => ({ ...m, shares: Number(m.shares), cost: Number(m.cost), date: String(m.date).slice(0, 10) })),
      transferLinks: raw.transferLinks.map((l) => ({ ...l, carried_cost_basis: l.carried_cost_basis == null ? null : Number(l.carried_cost_basis) })),
      prices,
      securityMeta,
    });
  }, [raw]);

  return { result, raw, loading, error, refresh };
}
