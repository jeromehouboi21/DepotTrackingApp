import { Money } from "../ui/Money";
import { PctChange } from "../ui/PctChange";
import { fmtDate, fmtShares, fmtPct } from "../../lib/format";

/** Offene Lots - pro Kauf individueller Wertzuwachs (Anforderung 3). */
export function LotTable({ lots, showAnnualized = true }) {
  if (!lots.length) return <div className="text-sm text-ink-3">Keine offenen Lots.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="text-sm w-full">
        <thead>
          <tr className="bg-surface-2 text-ink-2 text-xs">
            <th className="text-left px-2 py-1 font-medium">Kauf</th>
            <th className="text-right px-2 py-1 font-medium">Stück</th>
            <th className="text-right px-2 py-1 font-medium">Kaufkurs</th>
            <th className="text-right px-2 py-1 font-medium">Einstand</th>
            <th className="text-right px-2 py-1 font-medium">Wert heute</th>
            <th className="text-right px-2 py-1 font-medium">Zuwachs €</th>
            <th className="text-right px-2 py-1 font-medium">Zuwachs %</th>
            <th className="text-right px-2 py-1 font-medium">Haltedauer</th>
            {showAnnualized && <th className="text-right px-2 py-1 font-medium">p.a.</th>}
          </tr>
        </thead>
        <tbody>
          {lots.map((l, i) => (
            <tr key={i} className="border-b border-surface-2">
              <td className="px-2 py-1">{fmtDate(l.date)}{l.isManual ? " (manuell)" : ""}</td>
              <td className="px-2 py-1 text-right tnum">{fmtShares(l.shares)}</td>
              <td className="px-2 py-1 text-right"><Money value={l.cost_per_share} /></td>
              <td className="px-2 py-1 text-right"><Money value={l.costBasis} /></td>
              <td className="px-2 py-1 text-right"><Money value={l.marketValue} /></td>
              <td className="px-2 py-1 text-right"><Money value={l.unrealizedPl} signed colored /></td>
              <td className="px-2 py-1 text-right"><PctChange value={l.unrealizedPct} /></td>
              <td className="px-2 py-1 text-right tnum">{l.holdingDays} T.</td>
              {showAnnualized && (
                <td className="px-2 py-1 text-right tnum text-ink-2">
                  {l.annualizedPct != null ? fmtPct(l.annualizedPct) : "–"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
