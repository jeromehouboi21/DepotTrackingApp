import { useState } from "react";

/** Dropdown fuer den Broker-Standort (E7) - inkl. "neuen Broker anlegen". */
export function BrokerSelect({ brokers, value, onChange, onCreateBroker, compact = false }) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  if (creating) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
          await onCreateBroker(slug, newName.trim());
          onChange(slug);
          setCreating(false);
          setNewName("");
        }}
        className="flex gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Broker-Name"
          className="rounded border border-surface-2 px-2 py-0.5 text-xs w-28 bg-bg"
        />
        <button type="submit" className="text-xs text-accent">OK</button>
        <button type="button" className="text-xs text-ink-3" onClick={() => setCreating(false)}>✕</button>
      </form>
    );
  }

  return (
    <select
      value={value ?? ""}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        if (e.target.value === "__new__") setCreating(true);
        else onChange(e.target.value);
      }}
      className={`rounded border border-surface-2 bg-surface text-ink ${compact ? "text-xs px-1 py-0.5" : "text-sm px-2 py-1"}`}
    >
      <option value="" disabled>–</option>
      {brokers.filter((b) => b.active !== false).map((b) => (
        <option key={b.id} value={b.id}>{b.name}</option>
      ))}
      {onCreateBroker && <option value="__new__">+ Neuer Broker…</option>}
    </select>
  );
}
