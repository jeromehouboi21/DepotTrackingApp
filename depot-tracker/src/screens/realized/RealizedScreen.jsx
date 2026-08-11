import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../../hooks/useData";
import { Card } from "../../components/ui/Card";
import { Stat } from "../../components/ui/Stat";
import { Money } from "../../components/ui/Money";
import { Tabs } from "../../components/ui/Tabs";
import { Badge } from "../../components/ui/Badge";
import { Table } from "../../components/ui/Table";
import { EmptyState } from "../../components/ui/EmptyState";
import { RealizedByYearBar } from "../../components/charts/RealizedByYearBar";
import { aggregateYears } from "../../lib/portfolio";
import { fmtDate, fmtShares } from "../../lib/format";

export function RealizedScreen() {
  const { portfolio } = useData();
  const [view, setView] = useState("brutto");
  const result = portfolio.result;

  // verfuegbare Jahre = tatsaechlich vorhandene Jahres-Buckets (S6), aufsteigend sortiert.
  const years = result?.sellYears ?? [];

  // Explizite Auswahl (nur gueltig, sobald der Nutzer sie angefasst hat). Vor dem ersten
  // Antippen gilt implizit "alle Jahre aktiv" (activeYears unten) - so gibt es keinen
  // Render-Flash einer leeren Auswahl, waehrend `result` asynchron laedt.
  const [selectedYears, setSelectedYears] = useState(() => new Set());
  const userTouchedRef = useRef(false);
  const activeYears = userTouchedRef.current ? selectedYears : new Set(years);

  const toggleYear = (y) => {
    const base = userTouchedRef.current ? selectedYears : new Set(years);
    userTouchedRef.current = true;
    const next = new Set(base);
    next.has(y) ? next.delete(y) : next.add(y);
    setSelectedYears(next);
  };
  const selectAllYears = () => {
    userTouchedRef.current = true;
    setSelectedYears(new Set(years));
  };
  const clearYears = () => {
    userTouchedRef.current = true;
    setSelectedYears(new Set());
  };

  const chartData = useMemo(
    () => years.map((y) => ({ year: y, realizedPl: result.byYear[y].realizedPl })),
    [years, result],
  );

  const summary = useMemo(() => {
    if (!result) return null;
    return aggregateYears(result.byYear, activeYears);
  }, [result, activeYears]);

  if (portfolio.loading) return <div className="text-ink-3">Lade…</div>;
  if (!result || !years.length) return <EmptyState title="Keine Verkäufe vorhanden" />;

  const shown = (s) => (view === "brutto" ? s.realized : s.realized != null ? s.realized - s.tax : null);
  const shownTotal = view === "brutto" ? summary.realizedPl : summary.realizedPl - summary.tax;

  const winners = summary.sells.filter((s) => (shown(s) ?? 0) > 0);
  const losers = summary.sells.filter((s) => (shown(s) ?? 0) < 0);

  const columns = [
    { key: "date", label: "Datum", render: (s) => fmtDate(s.date), sortValue: (s) => s.date },
    {
      key: "name",
      label: "Wertpapier",
      render: (s) => (
        <Link to={`/wertpapier/${s.isin}`} className="hover:text-accent">
          {s.name ?? s.isin}
        </Link>
      ),
      sortValue: (s) => s.name ?? s.isin,
    },
    { key: "shares", label: "Stück", align: "right", render: (s) => <span className="tnum">{fmtShares(s.shares)}</span>, sortValue: (s) => s.shares },
    { key: "proceeds", label: "Erlös", align: "right", render: (s) => <Money value={s.proceeds} />, sortValue: (s) => s.proceeds },
    { key: "matchedCost", label: "Anschaffung", align: "right", render: (s) => <Money value={s.matchedCost} />, sortValue: (s) => s.matchedCost ?? 0 },
    { key: "fees", label: "Gebühren", align: "right", render: (s) => <Money value={s.fees} />, sortValue: (s) => s.fees },
    { key: "tax", label: "Steuern", align: "right", render: (s) => <Money value={s.tax} />, sortValue: (s) => s.tax },
    {
      key: "realized",
      label: view === "brutto" ? "G/V brutto" : "G/V netto",
      align: "right",
      render: (s) =>
        s.realized == null ? (
          <Badge variant="warn">Basis unbekannt</Badge>
        ) : (
          <Money value={shown(s)} signed colored />
        ),
      sortValue: (s) => shown(s) ?? -Infinity,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Realisiert</h1>
        <Tabs
          options={[
            { value: "brutto", label: "Brutto" },
            { value: "netto", label: "Netto (nach Steuern)" },
          ]}
          value={view}
          onChange={setView}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={selectAllYears}
          className="rounded-full px-3 py-1 text-sm bg-surface-2 text-ink-2 hover:text-ink"
        >
          Alle
        </button>
        <button
          onClick={clearYears}
          className="rounded-full px-3 py-1 text-sm bg-surface-2 text-ink-2 hover:text-ink"
        >
          Keine
        </button>
        <span className="mx-1 text-ink-3">·</span>
        {years.map((y) => {
          const active = activeYears.has(y);
          return (
            <button
              key={y}
              onClick={() => toggleYear(y)}
              className={`rounded-full px-3 py-1 text-sm tnum ${active ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"}`}
              title={`${result.byYear[y].count} Verkäufe`}
            >
              {y}
              <span className={`ml-1 text-[10px] ${active ? "text-white/70" : "text-ink-3"}`}>
                ({result.byYear[y].count})
              </span>
            </button>
          );
        })}
      </div>

      <Card title="Realisierter G/V pro Jahr (nur Verkäufe) · Klick hebt Jahr hervor">
        <RealizedByYearBar data={chartData} selectedYears={activeYears} onToggleYear={toggleYear} />
      </Card>

      {activeYears.size === 0 ? (
        <EmptyState title="Keine Jahre ausgewählt">
          Wähle oben mindestens ein Jahr aus, um Kennzahlen und Verkäufe zu sehen.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Stat label={`Realisierter G/V ${view === "netto" ? "(netto)" : "(brutto)"}`}>
              <Money value={shownTotal} signed colored />
            </Stat>
            <Stat label="Erlös"><Money value={summary.proceeds} /></Stat>
            <Stat label="Anschaffungskosten"><Money value={summary.cost} /></Stat>
            <Stat label="Gebühren / Steuern" sub={<Money value={summary.tax} />}>
              <Money value={summary.fees} />
            </Stat>
            <Stat label="Verkäufe" sub={summary.excludedNoCostBasis > 0 ? `${summary.excludedNoCostBasis} ohne Kostenbasis (nicht in Summe)` : null}>
              <span className="tnum">{summary.count}</span>
            </Stat>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title={`Gewinner (${winners.length})`}>
              <Table
                columns={columns}
                rows={winners}
                rowKey={(s) => s.tx_id}
                defaultSort={{ key: "realized", dir: "desc" }}
              />
            </Card>
            <Card title={`Verlierer (${losers.length})`}>
              <Table
                columns={columns}
                rows={losers}
                rowKey={(s) => s.tx_id}
                defaultSort={{ key: "realized", dir: "asc" }}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
