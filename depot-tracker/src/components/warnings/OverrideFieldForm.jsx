import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/Button";

const PATCHABLE = [
  { key: "fees", label: "Gebühren (€)" },
  { key: "tax", label: "Steuern (€)" },
  { key: "net", label: "Netto-Cash-Flow (€, Vorzeichen beachten)" },
  { key: "shares", label: "Stückzahl" },
  { key: "reported_realized_pl", label: "Gemeldeter G/V (€)" },
];

/**
 * Nicht-destruktiver Feld-Patch fuer eine Transaktion (E2).
 * Schreibt transaction_overrides; "Original wiederherstellen" loescht die Zeile.
 */
export function OverrideFieldForm({ user, transaction, existingOverride, onDone }) {
  const [patch, setPatch] = useState(existingOverride?.patch ?? {});
  const [note, setNote] = useState(existingOverride?.note ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const cleaned = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== "" && v != null).map(([k, v]) => [k, Number(v)]),
    );
    if (Object.keys(cleaned).length === 0) {
      setBusy(false);
      return;
    }
    await supabase.from("transaction_overrides").upsert(
      {
        user_id: user.id,
        transaction_id: transaction.id,
        patch: cleaned,
        note: note || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,transaction_id" },
    );
    setBusy(false);
    onDone?.();
  };

  const reset = async () => {
    setBusy(true);
    await supabase.from("transaction_overrides").delete().eq("transaction_id", transaction.id);
    setBusy(false);
    onDone?.();
  };

  return (
    <div className="space-y-2">
      <div className="text-xs text-ink-3">
        Original bleibt erhalten – der Patch wird beim Rechnen über die Rohdaten gelegt.
      </div>
      {PATCHABLE.map((f) => (
        <div key={f.key} className="flex items-center gap-2">
          <label className="text-sm text-ink-2 w-64">{f.label}</label>
          <input
            type="number"
            step="any"
            placeholder={String(transaction[f.key] ?? "")}
            value={patch[f.key] ?? ""}
            onChange={(e) => setPatch((p) => ({ ...p, [f.key]: e.target.value }))}
            className="rounded border border-surface-2 px-2 py-1 text-sm w-40 bg-bg tnum"
          />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <label className="text-sm text-ink-2 w-64">Notiz</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="rounded border border-surface-2 px-2 py-1 text-sm flex-1 bg-bg"
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button onClick={save} disabled={busy}>Override speichern</Button>
        {existingOverride && (
          <Button variant="secondary" onClick={reset} disabled={busy}>
            Original wiederherstellen
          </Button>
        )}
      </div>
    </div>
  );
}
