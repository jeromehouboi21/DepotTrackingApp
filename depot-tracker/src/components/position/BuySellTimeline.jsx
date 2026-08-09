import { Money } from "../ui/Money";
import { Badge } from "../ui/Badge";
import { fmtDate, fmtShares } from "../../lib/format";

/**
 * Kauf-Verkauf-Verknuepfung: jeder Verkauf mit den ihm per FIFO zugeordneten
 * Kauf-Lots + Vergleich mit dem von der Bank gemeldeten Wert (Anforderung 2).
 */
export function BuySellTimeline({ sells }) {
  if (!sells.length) return <div className="text-sm text-ink-3">Noch keine Verkäufe.</div>;
  return (
    <div className="space-y-3">
      {sells.map((s) => (
        <div key={s.tx_id} className="rounded-lg border border-surface-2 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Verkauf {fmtDate(s.date)}</span>
            <span className="tnum">{fmtShares(s.shares)} St.</span>
            <span className="text-ink-2">Erlös</span>
            <Money value={s.proceeds} />
            <span className="ml-auto flex items-center gap-2">
              <span className="text-ink-2">Realisiert:</span>
              <Money value={s.realized} signed colored />
              {s.reported != null && (
                s.mismatch ? (
                  <Badge variant="warn">
                    eigene FIFO weicht ab (<Money value={s.ownRealized} signed />)
                  </Badge>
                ) : (
                  <Badge variant="gain">✓ deckt sich mit Bank</Badge>
                )
              )}
              {s.noCostBasis && <Badge variant="warn">Kostenbasis unbekannt</Badge>}
            </span>
          </div>
          {s.allocatedLots.length > 0 && (
            <table className="text-xs mt-2 w-full">
              <thead>
                <tr className="text-ink-3">
                  <th className="text-left font-normal py-0.5">zugeordnetes Kauf-Lot</th>
                  <th className="text-right font-normal">Stück</th>
                  <th className="text-right font-normal">anteilige Kosten</th>
                </tr>
              </thead>
              <tbody>
                {s.allocatedLots.map((l, i) => (
                  <tr key={i} className="border-t border-surface-2">
                    <td className="py-0.5">Anschaffung vom {fmtDate(l.date)}{l.tx_id === "manual" ? " (manuell)" : ""}</td>
                    <td className="text-right tnum">{fmtShares(l.shares)}</td>
                    <td className="text-right"><Money value={l.cost} /></td>
                  </tr>
                ))}
                <tr className="border-t border-surface-2 font-medium">
                  <td className="py-0.5">Summe Anschaffungskosten</td>
                  <td />
                  <td className="text-right"><Money value={s.matchedCost} /></td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      ))}
    </div>
  );
}
