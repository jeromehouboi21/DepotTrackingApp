import { useEffect, useMemo, useState } from "react";
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
import { OBJECT_TYPE_LABEL, OBJECT_TYPE_ORDER } from "../../lib/classify";

const ASSET_LABEL = { equity: "Aktie", fund_etf: "Fonds/ETF", bond: "Anleihe", other: "Sonstig" };

// Zuletzt gewaehlte Gruppierung merken (nur UI-Vorliebe, kein Nutzer-/Finanzdatum).
const GROUP_BY_KEY = "depot-tracker:positions:groupBy";
const GROUP_BY_VALUES = ["none", "broker", "objectType"];

function loadGroupBy() {
  try {
    const v = localStorage.getItem(GROUP_BY_KEY);
    return GROUP_BY_VALUES.includes(v) ? v : "none"; // unbekannte/alte Werte verwerfen
  } catch {
    return "none"; // Storage deaktiviert / privater Modus
  }
}

export function PositionsScreen() {
  const { portfolio, custody, owners, refreshAll } = useData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("held"); // held | all | noprice
  const [brokerFilter, setBrokerFilter] = useState("all");
  const [objectTypeFilter, setObjectTypeFilter] = useState(() => new Set());
  const [groupBy, setGroupBy] = useState(loadGroupBy); // none | broker | objectType - Lazy Initializer

  useEffect(() => {
    try {
      localStorage.setItem(GROUP_BY_KEY, groupBy);
    } catch {
      /* Persistenz optional - Fehler bewusst schlucken */
    }
  }, [groupBy]);

  const result = portfolio.result;

  const rows = useMemo(() => {
    if (!result) return [];
    let list = result.positions;
    if (filter === "held") list = list.filter((p) => p.sharesHeld > 1e-9);
    if (filter === "noprice") list = list.filter((p) => p.sharesHeld > 1e-9 && p.currentPrice == null);
    if (brokerFilter !== "all") {
      list = list.filter((p) => custody.custodyByIsin[p.isin]?.some((c) => c.broker_id === brokerFilter));
    }
    if (objectTypeFilter.size > 0) {
      list = list.filter((p) => objectTypeFilter.has(p.objectType));
    }
    return list;
  }, [result, filter, brokerFilter, objectTypeFilter, custody.custodyByIsin]);

  const toggleObjectType = (t) =>
    setObjectTypeFilter((s) => {
      const n = new Set(s);
      n.has(t) ? n.delete(t) : n.add(t);
      return n;
    });

  // Gruppierung (verallgemeinert aus der frueheren Broker-only-Gruppierung):
  // 'broker' gruppiert nach Standort, 'objectType' nach Aktie/ETF/Fonds/...
  // Muss vor jedem fruehen Return stehen (Rules of Hooks - sonst wirft React
  // "Rendered more hooks than during the previous render", sobald result laedt).
  const groups = useMemo(() => {
    if (groupBy === "none") return null;
    if (groupBy === "objectType") {
      const byType = new Map();
      for (const p of rows) {
        (byType.get(p.objectType) ?? byType.set(p.objectType, []).get(p.objectType)).push(p);
      }
      return OBJECT_TYPE_ORDER
        .filter((t) => byType.has(t))
        .map((t) => [t, OBJECT_TYPE_LABEL[t], byType.get(t)]);
    }
    // groupBy === 'broker'
    const byBroker = {};
    for (const p of rows) {
      const bid = custody.custodyByIsin[p.isin]?.[0]?.broker_id ?? "(nicht zugeordnet)";
      (byBroker[bid] ??= []).push(p);
    }
    return Object.entries(byBroker).map(([bid, list]) => [
      bid,
      custody.brokers.find((b) => b.id === bid)?.name ?? bid,
      list,
    ]);
  }, [groupBy, rows, custody.custodyByIsin, custody.brokers]);

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
    await custody.setBrokerFor(user.id, owners.activeOwnerId, isin, brokerId);
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
      key: "objectType",
      label: "Typ",
      render: (p) => <Badge variant="neutral">{OBJECT_TYPE_LABEL[p.objectType]}</Badge>,
      sortValue: (p) => OBJECT_TYPE_LABEL[p.objectType],
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
    "", "", "", "", "",
    <Money key="mv" value={sum((p) => p.marketValue)} />,
    <Money key="upl" value={sum((p) => p.unrealizedPl)} signed colored />,
    "",
    <Money key="rpl" value={sum((p) => p.realizedPl)} signed colored />,
    <Money key="fees" value={sum((p) => p.totalFees)} />,
    "",
  ];

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
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="rounded-lg border border-surface-2 bg-surface px-2 py-1 text-sm"
          >
            <option value="none">Keine Gruppierung</option>
            <option value="broker">Gruppieren: Broker (Standort)</option>
            <option value="objectType">Gruppieren: Objekttyp</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs text-ink-3 mr-1">Objekttyp:</span>
        {OBJECT_TYPE_ORDER.filter((t) => result.positions.some((p) => p.objectType === t)).map((t) => (
          <button
            key={t}
            onClick={() => toggleObjectType(t)}
            className={`rounded-full px-2.5 py-0.5 text-xs ${
              objectTypeFilter.has(t) ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"
            }`}
          >
            {OBJECT_TYPE_LABEL[t]}
          </button>
        ))}
        {objectTypeFilter.size > 0 && (
          <button onClick={() => setObjectTypeFilter(new Set())} className="text-xs text-ink-3 ml-1">
            zurücksetzen
          </button>
        )}
      </div>

      {result.totals.priceCoverage < 1 && filter === "held" && (
        <div className="text-xs text-ink-2">
          Kursabdeckung: {result.totals.pricedCount}/{result.totals.heldCount} Positionen bewertet –
          Zeilen ohne Kurs fließen nicht in die Marktwert-Summe ein.
        </div>
      )}

      {groups ? (
        groups.map(([key, label, list]) => (
          <div key={key} className="bg-surface rounded-xl border border-surface-2 p-2">
            <div className="px-2 py-1 font-medium text-sm flex items-center gap-3 flex-wrap">
              <span>{label}</span>
              <span className="text-ink-3 font-normal">{list.length} Positionen</span>
              <Money value={list.reduce((s, p) => s + (p.marketValue ?? 0), 0)} />
              <span className="text-ink-3 font-normal">unrealisiert</span>
              <Money value={list.reduce((s, p) => s + (p.unrealizedPl ?? 0), 0)} signed colored />
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
