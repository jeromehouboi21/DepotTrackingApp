import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../../hooks/useData";
import { supabase } from "../../lib/supabase";
import { Table } from "../../components/ui/Table";
import { Money } from "../../components/ui/Money";
import { PctChange } from "../../components/ui/PctChange";
import { Badge, SourceBadge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { Tabs } from "../../components/ui/Tabs";
import { BrokerSelect } from "../../components/broker/BrokerSelect";
import { CustodyStatusBadge } from "../../components/broker/CustodyStatusBadge";
import { fmtShares, fmtDate } from "../../lib/format";
import { useAuth } from "../../hooks/useAuth";

const ASSET_LABEL = { equity: "Aktie", fund_etf: "Fonds/ETF", bond: "Anleihe", other: "Sonstig" };

export function PositionsScreen() {
  const { portfolio, custody, refreshAll } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("held"); // held | all | noprice
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [groupByBroker, setGroupByBroker] = useState(false);

  const result = portfolio.result;

  const rows = useMemo(() => {
    if (!result) return [];
    let list = result.positions;
    if (filter === "held") list = list.filter((p) => p.sharesHeld > 1e-9);
    if (filter === "noprice") list = list.filter((p) => p.sharesHeld > 1e-9 && p.currentPrice == null);
    if (brokerFilter !== "all") {
      list = list.filter((p) => custody.custodyByIsin[p.isin]?.some((c) => c.broker_id === brokerFilter));
    }
    return list;
  }, [result, filter, brokerFilter, custody.custodyByIsin]);

  if (portfolio.loading) return <div className="text-ink-3">Lade Portfolio…</div>;
  if (!result || result.positions.length === 0) {
    return (
      <EmptyState title="Noch keine Daten">
        Bitte zuerst die Parser-Dateien über den Import-Screen laden.
      </EmptyState>
    );
  }

  const createBroker = async (slug, name) => {
    await supabase.from("brokers").insert({ user_id: user.id, id: slug, name, active: true, sort_order: 99 });
    custody.refresh();
  };

  const setBroker = async (isin, brokerId) => {
    await custody.setBrokerFor(user.id, isin, brokerId);
  };

  const columns = [
    {
      key: "name",
      label: "Wertpapier",
      render: (p) => (
        <div>
          <div className="font-medium">{p.name ?? p.isin}</div>
          <div className="text-xs text-ink-3">
            {p.isin}
            {p.wkn ? ` · ${p.wkn}` : ""} · {ASSET_LABEL[p.assetClass]}
            {p.isSavingsPlan && " · Sparplan"}
          </div>
        </div>
      ),
      sortValue: (p) => p.name ?? p.isin,
    },
    {
      key: "broker",
      label: "Broker (Standort)",
      render: (p) => {
        const rowsForIsin = custody.custodyByIsin[p.isin] ?? [];
        const current = rowsForIsin[0];
        return (
          <div className="flex items-center gap-1">
            <BrokerSelect
              compact
              brokers={custody.brokers}
              value={current?.broker_id ?? null}
              onChange={(id) => setBroker(p.isin, id)}
              onCreateBroker={createBroker}
            />
            <CustodyStatusBadge row={current} brokers={custody.brokers} />
          </div>
        );
      },
      sortValue: (p) => custody.custodyByIsin[p.isin]?.[0]?.broker_id ?? "",
    },
    { key: "sharesHeld", label: "Bestand", align: "right", render: (p) => <span className="tnum">{fmtShares(p.sharesHeld)}</span>, sortValue: (p) => p.sharesHeld },
    { key: "avgCost", label: "Ø-Kosten", align: "right", render: (p) => <Money value={p.sharesHeld > 0 ? p.avgCost : null} />, sortValue: (p) => p.avgCost },
    {
      key: "currentPrice",
      label: "Kurs",
      align: "right",
      render: (p) =>
        p.currentPrice != null ? (
          <div>
            <Money value={p.currentPrice} />
            <div className="text-[10px] text-ink-3">
              {p.priceIsOverride ? "manuell" : fmtDate(p.priceAsOf?.slice(0, 10))}
            </div>
          </div>
        ) : p.sharesHeld > 1e-9 ? (
          <Badge variant="warn">Kurs fehlt</Badge>
        ) : (
          <span className="text-ink-3">–</span>
        ),
      sortValue: (p) => p.currentPrice ?? -1,
    },
    { key: "marketValue", label: "Marktwert", align: "right", render: (p) => <Money value={p.marketValue} />, sortValue: (p) => p.marketValue ?? -1 },
    { key: "unrealizedPl", label: "Unrealisiert", align: "right", render: (p) => <Money value={p.unrealizedPl} signed colored />, sortValue: (p) => p.unrealizedPl ?? -Infinity },
    { key: "unrealizedPct", label: "%", align: "right", render: (p) => <PctChange value={p.unrealizedPct} />, sortValue: (p) => p.unrealizedPct ?? -Infinity },
    { key: "realizedPl", label: "Realisiert", align: "right", render: (p) => <Money value={p.realizedPl} signed colored />, sortValue: (p) => p.realizedPl },
    { key: "totalFees", label: "Gebühren", align: "right", render: (p) => <Money value={p.totalFees} />, sortValue: (p) => p.totalFees },
    {
      key: "sources",
      label: "Quelle(n)",
      render: (p) => (
        <div className="flex gap-1">{p.sources.map((s) => <SourceBadge key={s} source={s} />)}</div>
      ),
      sortValue: (p) => p.sources.join(","),
    },
  ];

  const sum = (fn) => rows.reduce((s, p) => s + (fn(p) ?? 0), 0);
  const footer = [
    `${rows.length} Positionen`,
    "", "", "", "",
    <Money key="mv" value={sum((p) => p.marketValue)} />,
    <Money key="upl" value={sum((p) => p.unrealizedPl)} signed colored />,
    "",
    <Money key="rpl" value={sum((p) => p.realizedPl)} signed colored />,
    <Money key="fees" value={sum((p) => p.totalFees)} />,
    "",
  ];

  const brokerGroups = groupByBroker
    ? Object.entries(
        rows.reduce((acc, p) => {
          const bid = custody.custodyByIsin[p.isin]?.[0]?.broker_id ?? "(nicht zugeordnet)";
          (acc[bid] ??= []).push(p);
          return acc;
        }, {}),
      )
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Positionen</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            options={[
              { value: "held", label: "Mit Bestand" },
              { value: "all", label: "Alle" },
              { value: "noprice", label: "Kurs fehlt" },
            ]}
            value={filter}
            onChange={setFilter}
          />
          <select
            value={brokerFilter}
            onChange={(e) => setBrokerFilter(e.target.value)}
            className="rounded-lg border border-surface-2 bg-surface px-2 py-1 text-sm"
          >
            <option value="all">Alle Broker</option>
            {custody.brokers.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <label className="text-sm text-ink-2 flex items-center gap-1">
            <input type="checkbox" checked={groupByBroker} onChange={(e) => setGroupByBroker(e.target.checked)} />
            Nach Broker gruppieren
          </label>
        </div>
      </div>

      {result.totals.priceCoverage < 1 && filter === "held" && (
        <div className="text-xs text-ink-2">
          Kursabdeckung: {result.totals.pricedCount}/{result.totals.heldCount} Positionen bewertet –
          Zeilen ohne Kurs fließen nicht in die Marktwert-Summe ein.
        </div>
      )}

      {brokerGroups ? (
        brokerGroups.map(([bid, list]) => (
          <div key={bid} className="bg-surface rounded-xl border border-surface-2 p-2">
            <div className="px-2 py-1 font-medium text-sm">
              {custody.brokers.find((b) => b.id === bid)?.name ?? bid}
              <span className="text-ink-3 font-normal"> · {list.length} Positionen · </span>
              <Money value={list.reduce((s, p) => s + (p.marketValue ?? 0), 0)} />
            </div>
            <Table
              columns={columns}
              rows={list}
              rowKey={(p) => p.isin}
              onRowClick={(p) => navigate(`/wertpapier/${p.isin}`)}
            />
          </div>
        ))
      ) : (
        <div className="bg-surface rounded-xl border border-surface-2 p-2">
          <Table
            columns={columns}
            rows={rows}
            rowKey={(p) => p.isin}
            defaultSort={{ key: "marketValue", dir: "desc" }}
            footer={footer}
            onRowClick={(p) => navigate(`/wertpapier/${p.isin}`)}
          />
        </div>
      )}
    </div>
  );
}
