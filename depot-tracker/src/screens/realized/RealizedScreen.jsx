import { useMemo, useState } from "react";
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
import { fmtDate, fmtShares } from "../../lib/format";

export function RealizedScreen() {
  const { portfolio } = useData();
  const [year, setYear] = useState("all");
  const [view, setView] = useState("brutto");
  const result = portfolio.result;

  const years = result?.sellYears ?? [];
  const chartData = useMemo(
    () => years.map((y) => ({ year: y, realizedPl: result.byYear[y].realizedPl })),
    [years, result],
  );

  const agg = useMemo(() => {
    if (!result) return null;
    if (year === "all") {
      const all = Object.values(result.byYear);
      return {
        realizedPl: all.reduce((s, a) => s + a.realizedPl, 0),
        proceeds: all.reduce((s, a) => s + a.proceeds, 0),
        cost: all.reduce((s, a) => s + a.cost, 0),
        fees: all.reduce((s, a) => s + a.fees, 0),
        tax: all.reduce((s, a) => s + a.tax, 0),
        count: all.reduce((s, a) => s + a.count, 0),
        excludedNoCostBasis: all.reduce((s, a) => s + a.excludedNoCostBasis, 0),
        sells: all.flatMap((a) => a.sells),
      };
    }
    return result.byYear[year];
  }, [result, year]);

  if (portfolio.loading) return <div className="text-ink-3">Lade…</div>;
  if (!result || !years.length) return <EmptyState title="Keine Verkäufe vorhanden" />;

  const shown = (s) => (view === "brutto" ? s.realized : s.realized != null ? s.realized - s.tax : null);
  const shownTotal = view === "brutto" ? agg.realizedPl : agg.realizedPl - agg.tax;

  const winners = agg.sells.filter((s) => (shown(s) ?? 0) > 0);
  const losers = agg.sells.filter((s) => (shown(s) ?? 0) < 0);

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

      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => setYear("all")}
          className={`rounded-full px-3 py-1 text-sm ${year === "all" ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"}`}
        >
          Alle
        </button>
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={`rounded-full px-3 py-1 text-sm tnum ${year === y ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"}`}
          >
            {y}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label={`Realisierter G/V ${view === "netto" ? "(netto)" : "(brutto)"}`}>
          <Money value={shownTotal} signed colored />
        </Stat>
        <Stat label="Erlös"><Money value={agg.proceeds} /></Stat>
        <Stat label="Anschaffungskosten"><Money value={agg.cost} /></Stat>
        <Stat label="Gebühren / Steuern" sub={<Money value={agg.tax} />}>
          <Money value={agg.fees} />
        </Stat>
        <Stat label="Verkäufe" sub={agg.excludedNoCostBasis > 0 ? `${agg.excludedNoCostBasis} ohne Kostenbasis (nicht in Summe)` : null}>
          <span className="tnum">{agg.count}</span>
        </Stat>
      </div>

      <Card title="Realisierter G/V pro Jahr (nur Verkäufe)">
        <RealizedByYearBar data={chartData} selectedYear={year} onSelect={setYear} />
      </Card>

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
    </div>
  );
}
