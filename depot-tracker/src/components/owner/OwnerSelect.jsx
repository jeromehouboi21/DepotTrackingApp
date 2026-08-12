import { useState } from "react";

/**
 * Dropdown fuer den Depotinhaber (E9) - inkl. "neuen Inhaber anlegen".
 * Anders als BrokerSelect (E7, reines Etikett) ist die Auswahl hier ein harter
 * Partitionsschluessel: FIFO/Kostenbasis laufen je Inhaber komplett getrennt.
 */
export function OwnerSelect({ owners, value, onChange, onCreateOwner, compact = false }) {
  const [creating, setCreating] = useState(owners.length === 0);
  const [newName, setNewName] = useState("");

  if (creating) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
          await onCreateOwner(slug, newName.trim());
          onChange(slug);
          setCreating(false);
          setNewName("");
        }}
        className="flex gap-1 items-center"
      >
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="z. B. Hauptdepot, Kind 1 – Anna"
          className="rounded border border-surface-2 px-2 py-1 text-sm w-56 bg-bg"
        />
        <button type="submit" className="text-xs text-accent">Anlegen</button>
        {owners.length > 0 && (
          <button type="button" className="text-xs text-ink-3" onClick={() => setCreating(false)}>
            Abbrechen
          </button>
        )}
      </form>
    );
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => {
        if (e.target.value === "__new__") setCreating(true);
        else onChange(e.target.value);
      }}
      className={`rounded border border-surface-2 bg-surface text-ink ${compact ? "text-xs px-1 py-0.5" : "text-sm px-2 py-1"}`}
    >
      <option value="" disabled>Inhaber wählen…</option>
      {owners.filter((o) => o.active !== false).map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
      <option value="__new__">+ Neuen Inhaber anlegen…</option>
    </select>
  );
}
