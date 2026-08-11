import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../../hooks/useData";
import { supabase } from "../../lib/supabase";
import { Stat } from "../../components/ui/Stat";
import { Card } from "../../components/ui/Card";
import { Money } from "../../components/ui/Money";
import { PctChange } from "../../components/ui/PctChange";
import { Button } from "../../components/ui/Button";
import { Tabs } from "../../components/ui/Tabs";
import { EmptyState } from "../../components/ui/EmptyState";
import { YearToggleBar } from "../../components/ui/YearToggleBar";
import { AllocationDonut } from "../../components/charts/AllocationDonut";
import { WinnersLosersBar } from "../../components/charts/WinnersLosersBar";
import { InvestedOverTimeArea } from "../../components/charts/InvestedOverTimeArea";
import { CumulativeRealizedLine } from "../../components/charts/CumulativeRealizedLine";
import { RealizedUnrealizedSplit } from "../../components/charts/RealizedUnrealizedSplit";
import { XirrByYearBar } from "../../components/charts/XirrByYearBar";
import { aggregateYears, cumulativeRealized, realizedXirrByYear, overallXirrFlows } from "../../lib/portfolio";
import { xirr } from "../../lib/xirr";
import { OBJECT_TYPE_LABEL, OBJECT_TYPE_ORDER } from "../../lib/classify";
import { fmtPct } from "../../lib/format";
import { logger } from "../../lib/logger";

const YEARS_KEY = "depot-tracker:dashboard:years";

function loadStoredYears() {
  try {
    const raw = localStorage.getItem(YEARS_KEY);
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function DashboardScreen() {
  const { portfolio, warnings } = useData();
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);
  const [donutDim, setDonutDim] = useState("security"); // security | objectType
  const [wlMetric, setWlMetric] = useState("total"); // total | unrealized | realized
  const [wlUnit, setWlUnit] = useState("eur"); // eur | pct
  const result = portfolio.result;

  // --- Jahres-Auswahl (Flussgroessen-Widgets 2-5, §0.3) - persistiert in localStorage,
  // eigener Schluessel (unabhaengig von /realisiert). Vor Beruehrung gilt implizit
  // "alle Jahre" bzw. die gefilterte, persistierte Auswahl - kein Render-Flash (wie /realisiert).
  const availableYears = result?.sellYears ?? [];
  const [selectedYears, setSelectedYears] = useState(() => new Set(loadStoredYears()));
  const userTouchedRef = useRef(false);

  const activeYears = useMemo(() => {
    if (userTouchedRef.current) return selectedYears; // laufende Session: exakt respektieren (auch leer)
    const filtered = [...selectedYears].filter((y) => availableYears.includes(y));
    return new Set(filtered.length ? filtered : availableYears); // gueltig gespeichert, sonst Default alle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYears, availableYears.join(",")]);

  useEffect(() => {
    if (availableYears.length === 0) return; // vor dem Laden nichts schreiben
    try {
      localStorage.setItem(YEARS_KEY, JSON.stringify([...activeYears]));
    } catch {
      /* Persistenz optional - Fehler bewusst schlucken */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [[...activeYears].join(","), availableYears.length]);

  const toggleYear = (y) => {
    userTouchedRef.current = true;
    const next = new Set(activeYears);
    next.has(y) ? next.delete(y) : next.add(y);
    setSelectedYears(next);
  };
  const selectAllYears = () => {
    userTouchedRef.current = true;
    setSelectedYears(new Set(availableYears));
  };
  const clearYears = () => {
    userTouchedRef.current = true;
    setSelectedYears(new Set());
  };

  // (1) Allokation: nach Wertpapier (bisher) oder Objekttyp - reiner Heute-Snapshot, ignoriert Jahre.
  const allocationBySecurity = useMemo(() => {
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

  const allocationByType = useMemo(() => {
    if (!result) return [];
    const byType = new Map();
    for (const p of result.positions) {
      if (p.marketValue == null || p.marketValue <= 0) continue;
      byType.set(p.objectType, (byType.get(p.objectType) ?? 0) + p.marketValue);
    }
    return OBJECT_TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({
      name: OBJECT_TYPE_LABEL[t],
      value: Math.round(byType.get(t) * 100) / 100,
    }));
  }, [result]);

  const allocationData = donutDim === "objectType" ? allocationByType : allocationBySecurity;

  // (2) Kumulierter realisierter G/V - immer die volle Historie, Jahre nur Hervorhebung.
  const allSells = useMemo(
    () => (result ? Object.values(result.byYear).flatMap((y) => y.sells) : []),
    [result],
  );
  const cumulativeData = useMemo(() => cumulativeRealized(allSells), [allSells]);

  // (3) Winners/Losers mit Modus- und Einheits-Umschalter.
  const winnersLosers = useMemo(() => {
    if (!result) return [];
    let scored;
    if (wlMetric === "unrealized") {
      scored = result.positions
        .map((p) => ({ name: p.name ?? p.isin, value: wlUnit === "pct" ? p.unrealizedPct : p.unrealizedPl }))
        .filter((d) => d.value != null);
    } else if (wlMetric === "realized") {
      scored = result.positions
        .map((p) => {
          const relevant = p.sells.filter((s) => activeYears.has(s.year) && s.realized != null);
          if (!relevant.length) return { name: p.name ?? p.isin, value: null };
          const sumRealized = relevant.reduce((s, x) => s + x.realized, 0);
          const sumCost = relevant.reduce((s, x) => s + (x.matchedCost ?? 0), 0);
          const value = wlUnit === "pct" ? (sumCost > 0 ? sumRealized / sumCost : null) : sumRealized;
          return { name: p.name ?? p.isin, value };
        })
        .filter((d) => d.value != null);
    } else {
      scored = result.positions
        .map((p) => {
          const totalGain = p.realizedPl + (p.unrealizedPl ?? 0);
          const value = wlUnit === "pct" ? (p.totalInvested > 0 ? totalGain / p.totalInvested : null) : totalGain;
          return { name: p.name ?? p.isin, value };
        })
        .filter((d) => d.value != null);
    }
    const threshold = wlUnit === "pct" ? 0.0005 : 0.5;
    scored = scored.filter((d) => Math.abs(d.value) > threshold).sort((a, b) => b.value - a.value);
    return [...scored.slice(0, 8), ...scored.slice(-8)].filter(
      (d, i, arr) => arr.findIndex((x) => x.name === d.name) === i,
    );
  }, [result, wlMetric, wlUnit, activeYears]);

  // (4) Realisiert (gewaehlte Jahre) vs. unrealisiert (Stand heute).
  const realizedSummary = useMemo(() => {
    if (!result) return null;
    return aggregateYears(result.byYear, activeYears);
  }, [result, activeYears]);

  const yearsLabel = useMemo(() => {
    if (activeYears.size === 0) return "keine Jahre";
    if (activeYears.size === availableYears.length) return "alle Jahre";
    return [...activeYears].sort().join(", ");
  }, [activeYears, availableYears.length]);

  // (5) Realisierter XIRR je Jahr + optionale Gesamt-Kopfzahl.
  const xirrByYearFull = useMemo(() => realizedXirrByYear(allSells), [allSells]);
  // Jedes gewaehlte Jahr bekommt einen Balken, auch wenn realizedXirrByYear dafuer
  // gar keinen Eintrag lieferte (z.B. nur Verkaeufe ohne Kostenbasis) - sonst wuerde
  // das Jahr statt als "n/a" einfach kommentarlos fehlen.
  const xirrByYearFiltered = useMemo(() => {
    const out = {};
    for (const y of activeYears) out[y] = xirrByYearFull[y] ?? null;
    return out;
  }, [xirrByYearFull, activeYears]);
  const totalXirr = useMemo(() => {
    if (!result) return null;
    return xirr(overallXirrFlows(result.positions, result.cash));
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

      <Card
        title="Zeitraum für realisierte Auswertungen"
        action={<span className="text-xs text-ink-3">Unrealisiert bleibt immer „Stand heute"</span>}
      >
        <YearToggleBar
          availableYears={availableYears}
          selectedYears={activeYears}
          onToggle={toggleYear}
          onSelectAll={selectAllYears}
          onClear={clearYears}
          countFor={(y) => result.byYear[y]?.count}
        />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card
          title="Depot-Allokation"
          action={
            <Tabs
              options={[
                { value: "security", label: "Wertpapier" },
                { value: "objectType", label: "Objekttyp" },
              ]}
              value={donutDim}
              onChange={setDonutDim}
            />
          }
        >
          <AllocationDonut data={allocationData} />
        </Card>

        <Card
          title="Gewinner / Verlierer"
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <Tabs
                options={[
                  { value: "total", label: "Gesamt" },
                  { value: "unrealized", label: "Unrealisiert" },
                  { value: "realized", label: "Realisiert" },
                ]}
                value={wlMetric}
                onChange={setWlMetric}
              />
              <Tabs
                options={[
                  { value: "eur", label: "€" },
                  { value: "pct", label: "%" },
                ]}
                value={wlUnit}
                onChange={setWlUnit}
              />
            </div>
          }
        >
          {wlMetric === "realized" && activeYears.size === 0 ? (
            <div className="text-sm text-ink-3">Keine Jahre ausgewählt.</div>
          ) : (
            <WinnersLosersBar data={winnersLosers} unit={wlUnit} />
          )}
          {wlMetric === "unrealized" && (
            <div className="text-xs text-ink-3 mt-1">Stand heute, unabhängig von der Jahresauswahl.</div>
          )}
          {wlMetric === "realized" && activeYears.size > 0 && (
            <div className="text-xs text-ink-3 mt-1">Realisiert in: {yearsLabel}.</div>
          )}
        </Card>
      </div>

      <Card title="Kumulierter realisierter G/V (volle Historie, gewählte Jahre hervorgehoben)">
        <CumulativeRealizedLine data={cumulativeData} selectedYears={activeYears} />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Realisiert vs. unrealisiert">
          <RealizedUnrealizedSplit
            realizedSel={realizedSummary?.realizedPl ?? 0}
            unrealizedNow={t.pricedCount ? t.unrealizedPl : null}
            yearsLabel={yearsLabel}
            priceCoverage={t.priceCoverage}
          />
        </Card>

        <Card
          title="Geldgewichtete Rendite (XIRR) je Jahr"
          action={
            <span className="text-xs text-ink-2">
              Gesamt seit Beginn:{" "}
              <span className="tnum font-medium">
                {totalXirr == null || t.priceCoverage < 0.5 ? "n/a" : fmtPct(totalXirr)}
              </span>
            </span>
          }
        >
          <p className="text-xs text-ink-3 mb-2">
            Nur realisierte Käufe/Verkäufe, keine Kurse nötig. „n/a" = Jahr ohne vollständigen
            Kauf-Verkauf-Zyklus. Gesamt-Kopfzahl inkl. heutigem Bestandswert (Kursabdeckung{" "}
            {fmtPct(t.priceCoverage).replace("+", "")}) – Ein-/Auszahlungen fließen nicht ein.
          </p>
          {activeYears.size === 0 ? (
            <div className="text-sm text-ink-3">Keine Jahre ausgewählt.</div>
          ) : (
            <XirrByYearBar xirrByYear={xirrByYearFiltered} />
          )}
        </Card>
      </div>

      <Card title="Investiertes Kapital über Zeit (kumulierte Käufe – kein Marktwert-Verlauf)">
        <InvestedOverTimeArea data={invested} />
      </Card>
    </div>
  );
}
