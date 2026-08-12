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
import { fmtDate, fmtShares, fmtEur } from "../../lib/format";
import { OBJECT_TYPE_LABEL, OBJECT_TYPE_ORDER } from "../../lib/classify";

const GERMAN_MICS = ["XETR", "XFRA", "XSTU", "XMUN", "XDUS", "XBER", "XHAM", "XHAN"];

/** F1: Kurs-Symbol (marketstack-Ticker) manuell setzen - NICHT dasselbe wie der
 *  manuelle EUR-Kurs (price_overrides); beide Mechanismen bleiben nebeneinander. */
function SymbolCard({ user, isin, security, portfolio, onFetchPrice, fetching }) {
  const [symbol, setSymbol] = useState(security?.price_symbol ?? "");
  const [mic, setMic] = useState(security?.price_mic ?? "");
  const [currency, setCurrency] = useState(security?.price_currency ?? "EUR");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!symbol.trim()) return;
    setBusy(true);
    await supabase.from("securities").upsert(
      {
        user_id: user.id,
        isin,
        price_symbol: symbol.trim(),
        price_mic: mic.trim() || null,
        price_currency: (currency.trim() || "EUR").toUpperCase(),
        mapping_source: "manual",
        mapping_status: "manual",
        mapping_checked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,isin" },
    );
    setBusy(false);
    portfolio.refresh();
  };

  const reset = async () => {
    setBusy(true);
    await supabase.from("securities").update({
      price_symbol: null, price_mic: null, price_currency: null,
      mapping_source: null, mapping_status: "unresolved",
      mapping_checked_at: new Date().toISOString(),
    }).eq("user_id", user.id).eq("isin", isin);
    setSymbol("");
    setMic("");
    setCurrency("EUR");
    setBusy(false);
    portfolio.refresh();
  };

  const status = security?.mapping_status ?? "unresolved";

  return (
    <Card title="Kurs-Symbol (marketstack)">
      <div className="text-xs text-ink-3 mb-2 flex items-center gap-2 flex-wrap">
        <span>Aktuell:</span>
        {security?.price_symbol ? (
          <span className="tnum">
            {security.price_symbol}
            {security.price_mic ? ` @ ${security.price_mic}` : " (Heimatbörse)"}
            {security.price_currency ? ` · ${security.price_currency}` : ""}
          </span>
        ) : (
          <span>kein Symbol gesetzt</span>
        )}
        <Badge variant={status === "verified" || status === "manual" ? "accent" : status === "needs_review" ? "warn" : "neutral"}>
          {status}
        </Badge>
      </div>
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-sm">
          <span className="text-ink-2 block text-xs mb-0.5">Symbol *</span>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="z. B. TEF"
            className="rounded border border-surface-2 px-2 py-1 text-sm w-28 bg-bg tnum" />
        </label>
        <label className="text-sm">
          <span className="text-ink-2 block text-xs mb-0.5">Börse (MIC, optional)</span>
          <input list={`mics-${isin}`} value={mic} onChange={(e) => setMic(e.target.value)} placeholder="leer = Heimatbörse"
            className="rounded border border-surface-2 px-2 py-1 text-sm w-36 bg-bg" />
          <datalist id={`mics-${isin}`}>
            {GERMAN_MICS.map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>
        <label className="text-sm">
          <span className="text-ink-2 block text-xs mb-0.5">Währung</span>
          <input value={currency} onChange={(e) => setCurrency(e.target.value)}
            className="rounded border border-surface-2 px-2 py-1 text-sm w-16 bg-bg" />
        </label>
        <Button onClick={save} disabled={busy || !symbol.trim()}>Speichern</Button>
        {security?.price_symbol && (
          <>
            <Button variant="secondary" onClick={onFetchPrice} disabled={fetching}>
              {fetching ? "Rufe ab…" : "Kurs jetzt abrufen"}
            </Button>
            <Button variant="ghost" onClick={reset} disabled={busy}>Zurücksetzen</Button>
          </>
        )}
      </div>
    </Card>
  );
}

/** F2: Fehlende Transaktion nachtragen (additiv, E2) - z. B. Position schliessen,
 *  wenn ein Verkaufsbeleg fehlt. Importierte Rohdaten bleiben unberuehrt.
 *  E9: gehoert immer zum aktiven Inhaber (ownerId). */
function ManualTransactionCard({ user, ownerId, isin, position, manualTxs, portfolio }) {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("SELL");
  const [date, setDate] = useState("");
  const [shares, setShares] = useState(String(position.sharesHeld || ""));
  const [net, setNet] = useState(
    position.costBasisRemaining > 0 ? position.costBasisRemaining.toFixed(2) : "",
  );
  const [fees, setFees] = useState("0");
  const [tax, setTax] = useState("0");
  const [reported, setReported] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const num = (s) => Number(String(s).replace(",", "."));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    const netVal = num(net);
    await supabase.from("manual_transactions").insert({
      user_id: user.id,
      owner_id: ownerId,
      isin,
      date,
      type,
      shares: num(shares),
      fees: num(fees) || 0,
      tax: num(tax) || 0,
      // Vorzeichen-Konvention wie im Parser: SELL Erloes positiv, BUY Aufwand negativ
      net: type === "BUY" ? -Math.abs(netVal) : type === "SELL" ? Math.abs(netVal) : 0,
      reported_realized_pl: reported === "" ? null : num(reported),
      note: note || null,
    });
    setBusy(false);
    setShowForm(false);
    portfolio.refresh();
  };

  const remove = async (id) => {
    await supabase.from("manual_transactions").delete().eq("id", id);
    portfolio.refresh();
  };

  return (
    <Card title="Bestand korrigieren">
      <p className="text-xs text-ink-3 mb-2">
        Fehlt ein Beleg (z. B. ein Verkauf aus der Postbox), hier die Transaktion nachtragen –
        die importierten Rohdaten bleiben unverändert. Tipp: Ohne bekannte Verkaufszahlen einen
        Verkauf über die volle Stückzahl mit Erlös ≈ Kostenbasis
        ({fmtEur(position.costBasisRemaining)}) erfassen, dann entsteht kein erfundener G/V.
      </p>

      {manualTxs.length > 0 && (
        <ul className="text-sm space-y-1 mb-3">
          {manualTxs.map((m) => (
            <li key={m.id} className="flex items-center gap-2 flex-wrap border-b border-surface-2 pb-1">
              <Badge variant="accent">MANUELL</Badge>
              <span>{m.type}</span>
              <span>{fmtDate(String(m.date))}</span>
              <span className="tnum">{fmtShares(Number(m.shares))} St.</span>
              <Money value={Number(m.net)} signed />
              {m.reported_realized_pl != null && (
                <span className="text-xs text-ink-2">
                  G/V: <Money value={Number(m.reported_realized_pl)} signed />
                </span>
              )}
              {m.note && <span className="text-xs text-ink-3">{m.note}</span>}
              <button className="text-xs text-loss ml-auto" onClick={() => remove(m.id)}>
                Löschen
              </button>
            </li>
          ))}
        </ul>
      )}

      {!showForm ? (
        <Button variant="secondary" onClick={() => setShowForm(true)}>
          Fehlende Transaktion nachtragen
        </Button>
      ) : (
        <form onSubmit={save} className="space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <label className="text-sm">
              <span className="text-ink-2 block text-xs mb-0.5">Typ</span>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg">
                <option value="SELL">SELL (Verkauf)</option>
                <option value="BUY">BUY (Kauf)</option>
                <option value="TRANSFER_OUT">TRANSFER_OUT (Abgang ohne G/V)</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-ink-2 block text-xs mb-0.5">Datum *</span>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
                className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg" />
            </label>
            <label className="text-sm">
              <span className="text-ink-2 block text-xs mb-0.5">Stück *</span>
              <input required value={shares} onChange={(e) => setShares(e.target.value)}
                className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg tnum" />
            </label>
            <label className="text-sm">
              <span className="text-ink-2 block text-xs mb-0.5">
                {type === "BUY" ? "Aufwand (€) *" : type === "SELL" ? "Erlös/Netto (€) *" : "Netto (€)"}
              </span>
              <input required={type !== "TRANSFER_OUT"} value={net} onChange={(e) => setNet(e.target.value)}
                disabled={type === "TRANSFER_OUT"}
                className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg tnum disabled:opacity-50" />
            </label>
            <label className="text-sm">
              <span className="text-ink-2 block text-xs mb-0.5">Gebühren (€)</span>
              <input value={fees} onChange={(e) => setFees(e.target.value)}
                className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg tnum" />
            </label>
            <label className="text-sm">
              <span className="text-ink-2 block text-xs mb-0.5">Steuern (€)</span>
              <input value={tax} onChange={(e) => setTax(e.target.value)}
                className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg tnum" />
            </label>
            <label className="text-sm">
              <span className="text-ink-2 block text-xs mb-0.5">Gemeldeter G/V (€, optional)</span>
              <input value={reported} onChange={(e) => setReported(e.target.value)}
                className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg tnum" />
            </label>
            <label className="text-sm">
              <span className="text-ink-2 block text-xs mb-0.5">Notiz</span>
              <input value={note} onChange={(e) => setNote(e.target.value)}
                className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg" />
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>Nachtragen</Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Abbrechen</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

export function SecurityDetailScreen({ user }) {
  const { isin } = useParams();
  const { portfolio, custody, warnings, owners, refreshAll } = useData();
  const ownerId = owners.activeOwnerId;
  const [view, setView] = useState("brutto");
  const [editTxId, setEditTxId] = useState(null);
  const [priceInput, setPriceInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState(null);

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
  const security = (portfolio.raw?.securities ?? []).find((s) => s.isin === isin) ?? null;
  const manualTxs = (portfolio.raw?.manualTransactions ?? [])
    .filter((m) => m.isin === isin)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  if (portfolio.loading) return <div className="text-ink-3">Lade…</div>;
  if (!position) return <div className="text-ink-2">Keine Position für {isin} gefunden.</div>;

  const p = position;
  const grossRealized = p.realizedPl;
  const netRealized = p.realizedPl - p.totalTax;
  const shownRealized = view === "brutto" ? grossRealized : netRealized;

  const setBroker = (brokerId) => custody.setBrokerFor(user.id, ownerId, isin, brokerId);
  const setObjectType = async (value) => {
    // "" (automatisch) -> null, damit die Heuristik/OpenFIGI wieder greift (E2-konform rücksetzbar)
    await supabase.from("securities").update({ object_type: value || null }).eq("isin", isin);
    portfolio.refresh();
  };
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

  // F3: gezielter Kursabruf nur fuer diese ISIN
  const fetchPriceNow = async () => {
    setFetching(true);
    setFetchMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-prices", {
        body: { isins: [isin] },
      });
      if (error) throw error;
      setFetchMsg(
        data?.updated > 0
          ? "Kurs aktualisiert."
          : data?.missing?.includes(isin)
            ? "Kein Kurs gefunden (Symbol prüfen)."
            : "Kein Update (Symbol gesetzt und Status verified/manual?).",
      );
      portfolio.refresh();
    } catch (e) {
      setFetchMsg(`Fehler: ${e.message ?? e}`);
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl">{p.name ?? isin}</h1>
          <div className="text-sm text-ink-3 flex items-center gap-2 flex-wrap mt-1">
            <span>{isin}</span>
            {p.wkn && <span>· WKN {p.wkn}</span>}
            <span className="flex items-center gap-1">
              · Objekttyp:
              <select
                value={security?.object_type ?? ""}
                onChange={(e) => setObjectType(e.target.value)}
                className="rounded border border-surface-2 bg-surface text-ink text-xs px-1 py-0.5"
                title="Manueller Override; leer = automatisch aus OpenFIGI/Namen ableiten"
              >
                <option value="">automatisch ({OBJECT_TYPE_LABEL[p.objectType]})</option>
                {OBJECT_TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>{OBJECT_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </span>
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
          <SymbolCard
            user={user}
            isin={isin}
            security={security}
            portfolio={portfolio}
            onFetchPrice={fetchPriceNow}
            fetching={fetching}
          />
          {fetchMsg && <div className="text-xs text-ink-2 px-1">{fetchMsg}</div>}
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
          <ManualTransactionCard
            user={user}
            ownerId={ownerId}
            isin={isin}
            position={p}
            manualTxs={manualTxs}
            portfolio={portfolio}
          />
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
                            ownerId={ownerId}
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
