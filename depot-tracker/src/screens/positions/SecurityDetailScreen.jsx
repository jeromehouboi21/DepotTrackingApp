import { Fragment, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useData } from "../../hooks/useData";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Stat } from "../../components/ui/Stat";
import { Money } from "../../components/ui/Money";
import { PctChange } from "../../components/ui/PctChange";
import { Badge, SourceBadge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Tabs } from "../../components/ui/Tabs";
import { BuySellTimeline } from "../../components/position/BuySellTimeline";
import { CostBreakdownTable } from "../../components/position/CostBreakdownTable";
import { LotTable } from "../../components/position/LotTable";
import { BrokerSelect } from "../../components/broker/BrokerSelect";
import { CustodyStatusBadge } from "../../components/broker/CustodyStatusBadge";
import { OverrideFieldForm } from "../../components/warnings/OverrideFieldForm";
import { fmtDate, fmtShares } from "../../lib/format";

export function SecurityDetailScreen({ user }) {
  const { isin } = useParams();
  const { portfolio, custody, warnings, refreshAll } = useData();
  const [view, setView] = useState("brutto");
  const [editTxId, setEditTxId] = useState(null);
  const [priceInput, setPriceInput] = useState("");

  const position = portfolio.result?.positions.find((p) => p.isin === isin);
  const txs = useMemo(
    () =>
      (portfolio.raw?.transactions ?? [])
        .filter((t) => t.isin === isin)
        .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [portfolio.raw, isin],
  );
  const overridesByTx = useMemo(() => {
    const m = new Map();
    for (const o of portfolio.raw?.overrides ?? []) m.set(o.transaction_id, o);
    return m;
  }, [portfolio.raw]);
  const relatedWarnings = warnings.warnings.filter((w) => w.isin === isin);
  const custodyRow = custody.custodyByIsin[isin]?.[0];

  if (portfolio.loading) return <div className="text-ink-3">Lade…</div>;
  if (!position) return <div className="text-ink-2">Keine Position für {isin} gefunden.</div>;

  const p = position;
  const grossRealized = p.realizedPl;
  const netRealized = p.realizedPl - p.totalTax;
  const shownRealized = view === "brutto" ? grossRealized : netRealized;

  const setBroker = (brokerId) => custody.setBrokerFor(user.id, isin, brokerId);
  const createBroker = async (slug, name) => {
    await supabase.from("brokers").insert({ user_id: user.id, id: slug, name, active: true, sort_order: 99 });
    custody.refresh();
  };
  const savePriceOverride = async () => {
    const v = Number(priceInput.replace(",", "."));
    if (!isFinite(v) || v <= 0) return;
    await supabase.from("price_overrides").upsert(
      { user_id: user.id, isin, price: v, as_of: new Date().toISOString(), note: "manuell gesetzt" },
      { onConflict: "user_id,isin" },
    );
    setPriceInput("");
    portfolio.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{p.name ?? isin}</h1>
          <div className="text-sm text-ink-3 flex items-center gap-2 flex-wrap mt-1">
            <span>{isin}</span>
            {p.wkn && <span>· WKN {p.wkn}</span>}
            <span>· {p.assetClass === "bond" ? "Anleihe" : p.assetClass === "fund_etf" ? "Fonds/ETF" : "Aktie"}</span>
            {p.isSavingsPlan && <Badge variant="accent">Sparplan</Badge>}
            {p.flags.map((f) => <Badge key={f}>{f}</Badge>)}
            {p.sources.map((s) => <SourceBadge key={s} source={s} />)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-2">Broker (Standort):</span>
          <BrokerSelect
            brokers={custody.brokers}
            value={custodyRow?.broker_id ?? null}
            onChange={setBroker}
            onCreateBroker={createBroker}
          />
          <CustodyStatusBadge row={custodyRow} brokers={custody.brokers} />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Bestand">{fmtShares(p.sharesHeld)}</Stat>
        <Stat label="Einstand (offen)"><Money value={p.costBasisRemaining} /></Stat>
        <Stat label="Marktwert" sub={p.currentPrice == null && p.sharesHeld > 0 ? "Kurs fehlt" : p.priceIsOverride ? "manueller Kurs" : null}>
          <Money value={p.marketValue} />
        </Stat>
        <Stat label="Unrealisiert" sub={<PctChange value={p.unrealizedPct} />}>
          <Money value={p.unrealizedPl} signed colored />
        </Stat>
        <Stat label={view === "brutto" ? "Realisiert (brutto)" : "Realisiert (netto)"}>
          <Money value={shownRealized} signed colored />
        </Stat>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs
          options={[
            { value: "brutto", label: "Brutto" },
            { value: "netto", label: "Netto (nach Steuern)" },
          ]}
          value={view}
          onChange={setView}
        />
        {p.hasUnknownCostBasis && (
          <Badge variant="warn">Teilweise unbekannte Kostenbasis – Zahlen mit Vorsicht</Badge>
        )}
      </div>

      {relatedWarnings.length > 0 && (
        <Card title="Zugehörige Warnungen">
          <ul className="text-sm space-y-1">
            {relatedWarnings.map((w) => (
              <li key={w.id} className="flex items-center gap-2">
                <Badge variant={w.status === "open" ? "warn" : "neutral"}>{w.code}</Badge>
                <span className={w.status !== "open" ? "text-ink-3 line-through" : ""}>{w.message}</span>
                <Link to="/warnungen" className="text-accent text-xs ml-auto shrink-0">→ Warnungen</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Kauf ↔ Verkauf (FIFO-Zuordnung)">
          <BuySellTimeline sells={p.sells} />
        </Card>
        <div className="space-y-4">
          <Card title="Kostenaufschlüsselung">
            <CostBreakdownTable position={p} />
            <div className="text-sm mt-3 space-y-1 border-t border-surface-2 pt-2">
              <div className="flex justify-between">
                <span className="text-ink-2">Realisiert brutto</span>
                <Money value={grossRealized} signed colored />
              </div>
              <div className="flex justify-between">
                <span className="text-ink-2">abzgl. abgeführte Steuern</span>
                <Money value={-p.totalTax} signed />
              </div>
              <div className="flex justify-between font-medium">
                <span>Realisiert netto</span>
                <Money value={netRealized} signed colored />
              </div>
            </div>
          </Card>
          <Card title="Manueller Kurs (Fallback)">
            <div className="flex items-center gap-2">
              <input
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="Kurs in EUR, z. B. 1,23"
                className="rounded border border-surface-2 px-2 py-1 text-sm w-40 bg-bg tnum"
              />
              <Button variant="secondary" onClick={savePriceOverride}>Setzen</Button>
              {p.priceIsOverride && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    await supabase.from("price_overrides").delete().eq("isin", isin);
                    portfolio.refresh();
                  }}
                >
                  Override löschen
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Card title="Offene Lots">
        <LotTable lots={p.openLots} />
      </Card>

      <Card title={`Transaktionen (${txs.length})`}>
        <div className="overflow-x-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="bg-surface-2 text-ink-2 text-xs">
                <th className="text-left px-2 py-1 font-medium">Datum</th>
                <th className="text-left px-2 py-1 font-medium">Typ</th>
                <th className="text-right px-2 py-1 font-medium">Stück</th>
                <th className="text-right px-2 py-1 font-medium">Kurs</th>
                <th className="text-right px-2 py-1 font-medium">Gebühren</th>
                <th className="text-right px-2 py-1 font-medium">Steuern</th>
                <th className="text-right px-2 py-1 font-medium">Netto</th>
                <th className="text-left px-2 py-1 font-medium">Quelle</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => {
                const ov = overridesByTx.get(t.id);
                return (
                  <Fragment key={t.id}>
                    <tr className="border-b border-surface-2">
                      <td className="px-2 py-1">{fmtDate(String(t.date))}</td>
                      <td className="px-2 py-1">
                        {t.type}
                        {ov && <Badge variant="accent" className="ml-1">Override</Badge>}
                      </td>
                      <td className="px-2 py-1 text-right tnum">{fmtShares(Number(t.shares))}</td>
                      <td className="px-2 py-1 text-right"><Money value={Number(t.price)} /></td>
                      <td className="px-2 py-1 text-right"><Money value={Number(t.fees)} /></td>
                      <td className="px-2 py-1 text-right"><Money value={Number(t.tax)} /></td>
                      <td className="px-2 py-1 text-right"><Money value={Number(t.net)} signed /></td>
                      <td className="px-2 py-1"><SourceBadge source={t.source} /></td>
                      <td className="px-2 py-1 text-right">
                        <button
                          className="text-xs text-accent"
                          onClick={() => setEditTxId(editTxId === t.id ? null : t.id)}
                        >
                          {editTxId === t.id ? "Schließen" : "Korrigieren"}
                        </button>
                      </td>
                    </tr>
                    {editTxId === t.id && (
                      <tr>
                        <td colSpan={9} className="px-2 py-2 bg-surface-2/40">
                          <OverrideFieldForm
                            user={user}
                            transaction={t}
                            existingOverride={ov}
                            onDone={() => {
                              setEditTxId(null);
                              refreshAll();
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
