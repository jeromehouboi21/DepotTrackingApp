import { useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/Button";
import { ManualCostBasisForm } from "./ManualCostBasisForm";
import { TransferLinkForm } from "./TransferLinkForm";
import { OverrideFieldForm } from "./OverrideFieldForm";
import { Money } from "../ui/Money";

/** Kontextabhaengiges Korrektur-Formular je Warnungs-Code (§12). */
export function CorrectionDrawer({ user, warning, transactions, overrides, onDone }) {
  const code = warning.code;

  if (code === "NO_COST_BASIS") {
    return <ManualCostBasisForm user={user} isin={warning.isin} onDone={onDone} />;
  }

  if (code === "TRANSFER_UNMATCHED" || code === "TRANSFER_SHARES_MISMATCH") {
    return <TransferLinkForm user={user} isin={warning.isin} transactions={transactions} onDone={onDone} />;
  }

  if (code === "FIFO_MISMATCH") {
    return <FifoMismatchDrawer user={user} warning={warning} transactions={transactions} overrides={overrides} onDone={onDone} />;
  }

  return <div className="text-sm text-ink-3">Für diesen Code gibt es keine spezifische Korrektur.</div>;
}

function FifoMismatchDrawer({ user, warning, transactions, overrides, onDone }) {
  // Betroffene Verkaufs-Transaktion ueber ref (Dateiname) oder ISIN finden
  const sellTx = useMemo(() => {
    const byRef = transactions.find(
      (t) => t.type === "SELL" && warning.ref && t.raw_ref && warning.ref.includes(t.raw_ref),
    );
    if (byRef) return byRef;
    return transactions.find((t) => t.type === "SELL" && t.isin === warning.isin) ?? null;
  }, [transactions, warning]);
  const [mode, setMode] = useState(null);
  const existingOverride = overrides.find((o) => o.transaction_id === sellTx?.id);

  if (!sellTx) return <div className="text-sm text-ink-3">Verkaufs-Transaktion nicht gefunden.</div>;

  const acceptReported = async () => {
    // "Gemeldeten Bankwert als massgeblich uebernehmen": die Engine nutzt reported
    // ohnehin als massgeblich - der Override dokumentiert die Entscheidung und
    // beseitigt den Mismatch-Indikator nicht rechnerisch, sondern die Warnung
    // wird als erledigt markiert.
    await supabase.from("transaction_overrides").upsert(
      {
        user_id: user.id,
        transaction_id: sellTx.id,
        patch: { reported_realized_pl: Number(sellTx.reported_realized_pl) },
        note: "Gemeldeter Bankwert als maßgeblich bestätigt",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,transaction_id" },
    );
    onDone?.({ resolve: true, note: "Bankwert übernommen" });
  };

  return (
    <div className="space-y-3">
      <div className="text-sm text-ink-2">
        Verkauf {sellTx.id}: gemeldeter G/V <Money value={Number(sellTx.reported_realized_pl)} signed />.
        Entweder Lots/Gebühren korrigieren oder den Bankwert bestätigen.
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setMode(mode === "edit" ? null : "edit")}>
          Transaktion korrigieren
        </Button>
        <Button onClick={acceptReported}>Gemeldeten Bankwert übernehmen</Button>
      </div>
      {mode === "edit" && (
        <OverrideFieldForm
          user={user}
          transaction={sellTx}
          existingOverride={existingOverride}
          onDone={() => onDone?.({ resolve: false })}
        />
      )}
    </div>
  );
}
