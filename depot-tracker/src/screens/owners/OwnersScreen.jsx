import { useState } from "react";
import { useData } from "../../hooks/useData";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";

/**
 * Inhaber-Verwaltung (E9), analog BrokersScreen: anlegen, umbenennen, Farbe,
 * deaktivieren. Anlegen ist zusaetzlich direkt aus dem Import-Screen moeglich
 * (OwnerSelect, 1b). Bewusst OHNE "Was liegt wo?" - das ist eine Broker-Frage
 * (E7) innerhalb eines Inhabers, nicht zwischen Inhabern.
 */
export function OwnersScreen({ user }) {
  const { owners, portfolio } = useData();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#2d5a4e");

  const addOwner = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await owners.createOwner(user.id, slug, newName.trim());
    setNewName("");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Inhaber</h1>
      <p className="text-sm text-ink-2 max-w-2xl">
        Jeder Inhaber (eigenes Depot, Kinderdepots …) hat eine vollständig getrennte Rechnung –
        FIFO, Kostenbasis und Gewinn/Verlust werden nie über Inhaber hinweg vermischt. Der aktive
        Inhaber wird oben in der Navigation umgeschaltet.
      </p>

      <Card title="Inhaber-Verwaltung">
        <ul className="space-y-1 mb-3">
          {owners.owners.map((o) => (
            <li key={o.id} className="flex items-center gap-2 text-sm">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: o.color ?? "#9aa0a8" }} />
              <span className={o.active === false ? "line-through text-ink-3" : "font-medium"}>{o.name}</span>
              <span className="text-xs text-ink-3">({o.id})</span>
              {o.id === owners.activeOwnerId && <Badge variant="accent">aktiv</Badge>}
              {o.note && <span className="text-xs text-ink-3">· {o.note}</span>}
              <span className="ml-auto flex gap-1">
                <button
                  className="text-xs text-accent"
                  onClick={async () => {
                    const name = prompt("Neuer Name:", o.name);
                    if (name) await owners.renameOwner(o.id, name);
                  }}
                >
                  Umbenennen
                </button>
                <button className="text-xs text-ink-3" onClick={() => owners.toggleActiveOwner(o)}>
                  {o.active === false ? "Aktivieren" : "Deaktivieren"}
                </button>
              </span>
            </li>
          ))}
          {owners.owners.length === 0 && !owners.loading && (
            <li className="text-sm text-ink-3">Noch kein Inhaber angelegt.</li>
          )}
        </ul>
        <form onSubmit={addOwner} className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Neuer Inhaber (z. B. Kind 1 – Anna)"
            className="rounded border border-surface-2 px-2 py-1 text-sm flex-1 bg-bg"
          />
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-8 h-8 rounded border border-surface-2 bg-bg"
          />
          <Button type="submit" variant="secondary">Anlegen</Button>
        </form>
      </Card>

      {owners.activeOwner && (
        <Card title={`Aktuelle Rechnung: ${owners.activeOwner.name}`}>
          <p className="text-sm text-ink-2">
            {portfolio.loading
              ? "Lade…"
              : portfolio.result
                ? `${portfolio.result.positions.length} Positionen · realisiert (all-time) ${
                    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
                      portfolio.result.totals.realizedPl,
                    )
                  }`
                : "Noch keine Daten für diesen Inhaber importiert."}
          </p>
        </Card>
      )}
    </div>
  );
}
