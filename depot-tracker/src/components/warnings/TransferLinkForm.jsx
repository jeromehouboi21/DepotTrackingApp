import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/Button";
import { fmtDate, fmtShares } from "../../lib/format";

/**
 * TRANSFER_UNMATCHED / TRANSFER_SHARES_MISMATCH: Abgang mit Eingang verknuepfen
 * oder als "extern uebertragen, kein Ziel" markieren (§12).
 */
export function TransferLinkForm({ user, isin, transactions, onDone }) {
  const outs = useMemo(
    () => transactions.filter((t) => t.isin === isin && t.type === "TRANSFER_OUT"),
    [transactions, isin],
  );
  const ins = useMemo(
    () => transactions.filter((t) => t.isin === isin && t.type === "TRANSFER_IN"),
    [transactions, isin],
  );
  const [outId, setOutId] = useState(outs[0]?.id ?? "");
  const [inId, setInId] = useState("__none__");
  const [basis, setBasis] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!outId) return;
    setBusy(true);
    await supabase.from("transfer_links").insert({
      user_id: user.id,
      out_transaction_id: outId,
      in_transaction_id: inId === "__none__" ? null : inId,
      carried_cost_basis: basis ? Number(basis.replace(",", ".")) : null,
      note: note || null,
    });
    setBusy(false);
    onDone?.();
  };

  if (!outs.length && !ins.length) {
    return <div className="text-sm text-ink-3">Keine Übertrags-Transaktionen für {isin} gefunden.</div>;
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <label className="block text-sm">
        <span className="text-ink-2 block text-xs mb-0.5">Abgang (TRANSFER_OUT)</span>
        <select value={outId} onChange={(e) => setOutId(e.target.value)}
          className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg">
          {outs.map((t) => (
            <option key={t.id} value={t.id}>
              {fmtDate(String(t.date))} · {fmtShares(Number(t.shares))} St. · {t.source} ({t.id})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink-2 block text-xs mb-0.5">Ziel (TRANSFER_IN)</span>
        <select value={inId} onChange={(e) => setInId(e.target.value)}
          className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg">
          <option value="__none__">Extern übertragen – kein Ziel in den Daten</option>
          {ins.map((t) => (
            <option key={t.id} value={t.id}>
              {fmtDate(String(t.date))} · {fmtShares(Number(t.shares))} St. · {t.source} ({t.id})
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink-2 block text-xs mb-0.5">
          Mitwandernde Kostenbasis in € (optional; leer = Lots bleiben beim Abgang unangetastet)
        </span>
        <input value={basis} onChange={(e) => setBasis(e.target.value)} placeholder="z. B. 1250,43"
          className="rounded border border-surface-2 px-2 py-1 text-sm w-48 bg-bg tnum" />
      </label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz, z. B. Teilmengen/Split"
        className="rounded border border-surface-2 px-2 py-1 text-sm w-full bg-bg" />
      <Button type="submit" disabled={busy || !outId}>Verknüpfung speichern</Button>
    </form>
  );
}
