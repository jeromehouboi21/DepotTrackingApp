import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/Button";

/** NO_COST_BASIS: fehlendes Kauf-Lot manuell erfassen (§12). E9: gehoert zum
 *  aktiven Inhaber (ownerId). */
export function ManualCostBasisForm({ user, ownerId, isin, onDone }) {
  const [date, setDate] = useState("");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    await supabase.from("manual_cost_lots").insert({
      user_id: user.id,
      owner_id: ownerId,
      isin,
      date,
      shares: Number(shares.replace(",", ".")),
      cost: Number(cost.replace(",", ".")),
      note: note || null,
    });
    setBusy(false);
    onDone?.();
  };

  return (
    <form onSubmit={save} className="space-y-2">
      <div className="text-xs text-ink-3">
        Erzeugt ein Kauf-Lot für {isin}, das die FIFO-Rechnung als Kostenbasis nutzt.
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="text-sm">
          <span className="text-ink-2 block text-xs mb-0.5">Anschaffungsdatum</span>
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg" />
        </label>
        <label className="text-sm">
          <span className="text-ink-2 block text-xs mb-0.5">Stück</span>
          <input required value={shares} onChange={(e) => setShares(e.target.value)} placeholder="z. B. 348"
            className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg tnum" />
        </label>
        <label className="text-sm">
          <span className="text-ink-2 block text-xs mb-0.5">Kosten gesamt (€)</span>
          <input required value={cost} onChange={(e) => setCost(e.target.value)} placeholder="inkl. Gebühren"
            className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg tnum" />
        </label>
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz (optional)"
        className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg" />
      <Button type="submit" disabled={busy}>Kostenbasis speichern</Button>
    </form>
  );
}
