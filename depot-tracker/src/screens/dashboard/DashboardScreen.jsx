import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../../hooks/useData";
import { supabase } from "../../lib/supabase";
import { Stat } from "../../components/ui/Stat";
import { Card } from "../../components/ui/Card";
import { Money } from "../../components/ui/Money";
import { PctChange } from "../../components/ui/PctChange";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { AllocationDonut } from "../../components/charts/AllocationDonut";
import { WinnersLosersBar } from "../../components/charts/WinnersLosersBar";
import { InvestedOverTimeArea } from "../../components/charts/InvestedOverTimeArea";
import { fmtPct } from "../../lib/format";
import { logger } from "../../lib/logger";

export function DashboardScreen() {
  const { portfolio, warnings } = useData();
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);
  const result = portfolio.result;

  const allocation = useMemo(() => {
    if (!result) return [];
    const priced = result.positions
      .filter((p) => p.marketValue != null && p.marketValue > 0)
      .sort((a, b) => b.marketValue - a.marketValue);
    const top = priced.slice(0, 9);
    const rest = priced.slice(9).reduce((s, p) => s + p.marketValue, 0);
    const data = top.map((p) => ({ name: p.name ?? p.isin, value: Math.round(p.marketValue * 100) / 100 }));
    if (rest > 0) data.push({ name: "Übrige", value: Math.round(rest * 100) / 100 });
    return data;
  }, [result]);

  const winnersLosers = useMemo(() => {
    if (!result) return [];
    const scored = result.positions
      .map((p) => ({ name: p.name ?? p.isin, value: p.realizedPl + (p.unrealizedPl ?? 0) }))
      .filter((d) => Math.abs(d.value) > 0.5)
      .sort((a, b) => b.value - a.value);
    return [...scored.slice(0, 8), ...scored.slice(-8)].filter(
      (d, i, arr) => arr.findIndex((x) => x.name === d.name) === i,
    );
  }, [result]);

  const invested = useMemo(() => {
    if (!portfolio.raw) return [];
    const byMonth = {};
    for (const t of portfolio.raw.transactions) {
      if (t.type !== "BUY") continue;
      const m = String(t.date).slice(0, 7);
      byMonth[m] = (byMonth[m] ?? 0) + Math.abs(Number(t.net));
    }
    let cum = 0;
    return Object.entries(byMonth)
      .sort()
      .map(([date, v]) => ({ date, invested: Math.round((cum += v) * 100) / 100 }));
  }, [portfolio.raw]);

  if (portfolio.loading) return <div className="text-ink-3">Lade Portfolio…</div>;
  if (!result || result.positions.length === 0) {
    return (
      <EmptyState
        title="Noch keine Daten importiert"
        action={<Link to="/import" className="text-accent text-sm">→ Zum Import</Link>}
      >
        Zuerst die vier Parser-Dateien importieren.
      </EmptyState>
    );
  }

  const t = result.totals;

  // F3: optionaler ISIN-Filter - ohne `isins` globaler Abruf wie bisher.
  const updatePrices = async (isins) => {
    setFetching(true);
    setFetchMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-prices", {
        body: isins?.length ? { isins } : {},
      });
      if (error) throw error;
      setFetchMsg(`Aktualisiert: ${data?.updated ?? 0} Kurse${data?.missing?.length ? ` · ohne Kurs: ${data.missing.length}` : ""}`);
      portfolio.refresh();
    } catch (e) {
      setFetchMsg(`Fehler: ${e.message ?? e}`);
      logger.error("fetch-prices failed", { message: String(e.message ?? e) });
    } finally {
      setFetching(false);
    }
  };

  const updateHeldPrices = () =>
    updatePrices(result.positions.filter((p) => p.sharesHeld > 1e-9).map((p) => p.isin));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Dashboard</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {fetchMsg && <span className="text-xs text-ink-2">{fetchMsg}</span>}
          <Button variant="secondary" onClick={updateHeldPrices} disabled={fetching}>
            {fetching ? "Aktualisiere…" : "Nur Bestand aktualisieren"}
          </Button>
          <Button variant="secondary" onClick={() => updatePrices()} disabled={fetching}>
            Kurse aktualisieren (alle)
          </Button>
        </div>
      </div>

      {warnings.openCount > 0 && (
        <Link
          to="/warnungen"
          className="block rounded-lg bg-[#f8ecd9] text-warn px-4 py-2 text-sm hover:opacity-90"
        >
          ⚠ {warnings.openCount} offene Warnung{warnings.openCount === 1 ? "" : "en"} – bitte prüfen
        </Link>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Marktwert" sub={`Kursabdeckung ${fmtPct(t.priceCoverage).replace("+", "")}`}>
          <Money value={t.pricedCount ? t.marketValue : null} />
        </Stat>
        <Stat label="Unrealisiert" sub={<PctChange value={t.marketValue > 0 && t.costBasis > 0 ? t.unrealizedPl / t.costBasis : null} />}>
          <Money value={t.pricedCount ? t.unrealizedPl : null} signed colored />
        </Stat>
        <Stat label="Realisiert (all-time)">
          <Money value={t.realizedPl} signed colored />
        </Stat>
        <Stat label="Gebühren (all-time)">
          <Money value={t.feesAllTime} />
        </Stat>
        <Stat label="Erträge (Div./Zins)">
          <Money value={result.income} signed colored />
        </Stat>
        <Stat label="Positionen" sub={`${t.pricedCount} mit Kurs`}>
          <span className="tnum">{t.heldCount}</span>
        </Stat>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Depot-Allokation (nach Marktwert)">
          <AllocationDonut data={allocation} />
        </Card>
        <Card title="Gewinner / Verlierer (realisiert + unrealisiert)">
          <WinnersLosersBar data={winnersLosers} />
        </Card>
      </div>

      <Card title="Investiertes Kapital über Zeit (kumulierte Käufe – kein Marktwert-Verlauf)">
        <InvestedOverTimeArea data={invested} />
      </Card>
    </div>
  );
}
