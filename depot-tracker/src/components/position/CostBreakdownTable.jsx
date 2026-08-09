import { Money } from "../ui/Money";

/** Alle Kostenelemente einzeln (Anforderung 2). */
export function CostBreakdownTable({ position }) {
  const p = position;
  const rows = [
    ["Kaufgebühren", p.totalBuyFees],
    ["Verkaufsgebühren", p.totalSellFees],
    ["Übertrags-/Lagerstellenentgelte", p.totalTransferFees],
    ["Abgeführte Steuern", p.totalTax],
  ];
  return (
    <table className="text-sm w-full">
      <tbody>
        {rows.map(([label, v]) => (
          <tr key={label} className="border-b border-surface-2">
            <td className="py-1 text-ink-2">{label}</td>
            <td className="py-1 text-right"><Money value={v} /></td>
          </tr>
        ))}
        <tr className="font-medium">
          <td className="py-1">Summe Gebühren (ohne Steuern)</td>
          <td className="py-1 text-right"><Money value={p.totalFees} /></td>
        </tr>
      </tbody>
    </table>
  );
}
