import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../../hooks/useData";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Money } from "../../components/ui/Money";
import { Badge } from "../../components/ui/Badge";
import { CustodyStatusBadge } from "../../components/broker/CustodyStatusBadge";
import { fmtShares } from "../../lib/format";

export function BrokersScreen({ user }) {
  const { portfolio, custody } = useData();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#5b6067");
  const [selected, setSelected] = useState(new Set());
  const [bulkTarget, setBulkTarget] = useState("");

  const held = (portfolio.result?.positions ?? []).filter((p) => p.sharesHeld > 1e-9);

  const groups = useMemo(() => {
    const g = {};
    for (const p of held) {
      const rows = custody.custodyByIsin[p.isin] ?? [];
      const key = rows[0]?.broker_id ?? "__none__";
      (g[key] ??= []).push({ position: p, custodyRow: rows[0] });
    }
    return g;
  }, [held, custody.custodyByIsin]);

  const addBroker = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await supabase.from("brokers").insert({
      user_id: user.id, id: slug, name: newName.trim(), color: newColor, active: true, sort_order: 50,
    });
    setNewName("");
    custody.refresh();
  };

  const toggleActive = async (b) => {
    await supabase.from("brokers").update({ active: !b.active }).eq("id", b.id);
    custody.refresh();
  };

  const rename = async (b) => {
    const name = prompt("Neuer Name:", b.name);
    if (!name) return;
    await supabase.from("brokers").update({ name }).eq("id", b.id);
    custody.refresh();
  };

  const bulkAssign = async () => {
    if (!bulkTarget || selected.size === 0) return;
    for (const isin of selected) {
      await custody.setBrokerFor(user.id, isin, bulkTarget);
    }
    setSelected(new Set());
  };

  const toggleSelect = (isin) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(isin) ? n.delete(isin) : n.add(isin);
      return n;
    });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Broker</h1>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Broker-Verwaltung">
          <ul className="space-y-1 mb-3">
            {custody.brokers.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: b.color ?? "#9aa0a8" }} />
                <span className={b.active === false ? "line-through text-ink-3" : "font-medium"}>{b.name}</span>
                <span className="text-xs text-ink-3">({b.id})</span>
                <span className="ml-auto flex gap-1">
                  <button className="text-xs text-accent" onClick={() => rename(b)}>Umbenennen</button>
                  <button className="text-xs text-ink-3" onClick={() => toggleActive(b)}>
                    {b.active === false ? "Aktivieren" : "Deaktivieren"}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <form onSubmit={addBroker} className="flex items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Neuer Broker (z. B. Trade Republic)"
              className="rounded border border-surface-2 px-2 py-1 text-sm flex-1 bg-bg"
            />
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
              className="w-8 h-8 rounded border border-surface-2 bg-bg" />
            <Button type="submit" variant="secondary">Anlegen</Button>
          </form>
        </Card>

        <Card title="Bulk-Zuordnung">
          <p className="text-xs text-ink-3 mb-2">
            Positionen unten anhaken, Ziel-Broker wählen – praktisch nach einem Sammel-Rückübertrag.
            Ändert nur das Standort-Etikett, nie die G/V-Rechnung.
          </p>
          <div className="flex items-center gap-2">
            <select value={bulkTarget} onChange={(e) => setBulkTarget(e.target.value)}
              className="rounded border border-surface-2 px-2 py-1 text-sm bg-bg">
              <option value="">Ziel-Broker…</option>
              {custody.brokers.filter((b) => b.active !== false).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <Button onClick={bulkAssign} disabled={!bulkTarget || selected.size === 0}>
              {selected.size} Position{selected.size === 1 ? "" : "en"} zuordnen
            </Button>
          </div>
        </Card>
      </div>

      <Card title="Was liegt wo?">
        {Object.entries(groups).map(([brokerId, items]) => {
          const broker = custody.brokers.find((b) => b.id === brokerId);
          const mv = items.reduce((s, i) => s + (i.position.marketValue ?? 0), 0);
          return (
            <div key={brokerId} className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-3 h-3 rounded-full inline-block" style={{ background: broker?.color ?? "#9aa0a8" }} />
                <span className="font-medium">{broker?.name ?? "Nicht zugeordnet"}</span>
                <span className="text-sm text-ink-3">· {items.length} Positionen ·</span>
                <Money value={mv} />
              </div>
              <ul className="text-sm space-y-0.5">
                {items.map(({ position: p, custodyRow }) => (
                  <li key={p.isin} className="flex items-center gap-2 pl-5">
                    <input
                      type="checkbox"
                      checked={selected.has(p.isin)}
                      onChange={() => toggleSelect(p.isin)}
                    />
                    <Link to={`/wertpapier/${p.isin}`} className="hover:text-accent">
                      {p.name ?? p.isin}
                    </Link>
                    <span className="text-ink-3 tnum text-xs">{fmtShares(p.sharesHeld)} St.</span>
                    {p.marketValue != null ? (
                      <Money value={p.marketValue} className="text-xs" />
                    ) : (
                      <Badge variant="warn">Kurs fehlt</Badge>
                    )}
                    <CustodyStatusBadge row={custodyRow} brokers={custody.brokers} />
                    {custodyRow?.note && <span className="text-xs text-warn">{custodyRow.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {held.length === 0 && <div className="text-sm text-ink-3">Keine gehaltenen Positionen.</div>}
      </Card>
    </div>
  );
}
