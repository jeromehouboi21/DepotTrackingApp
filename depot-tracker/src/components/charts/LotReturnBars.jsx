import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { fmtEur, fmtDate } from "../../lib/format";

/** Jeder Sparplan-Kauf als Balken (gruen/rot) - Wertzuwachs je Lot (Anforderung 3). */
export function LotReturnBars({ lots, groupByYear = false }) {
  if (!lots.length) return <div className="text-sm text-ink-3">Keine offenen Lots mit Kurs.</div>;

  let data;
  if (groupByYear) {
    const byYear = {};
    for (const l of lots) {
      const y = l.date.slice(0, 4);
      byYear[y] = (byYear[y] ?? 0) + (l.unrealizedPl ?? 0);
    }
    data = Object.entries(byYear)
      .sort()
      .map(([label, value]) => ({ label, value }));
  } else {
    data = lots.map((l) => ({ label: l.date, value: l.unrealizedPl ?? 0 }));
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <XAxis
          dataKey="label"
          tick={{ fontSize: 9 }}
          minTickGap={30}
          tickFormatter={(v) => (groupByYear ? v : fmtDate(v))}
        />
        <YAxis tickFormatter={(v) => fmtEur(v)} tick={{ fontSize: 10 }} width={70} />
        <Tooltip formatter={(v) => fmtEur(v)} labelFormatter={(v) => (groupByYear ? v : fmtDate(v))} />
        <ReferenceLine y={0} stroke="#9aa0a8" />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? "var(--color-gain)" : "var(--color-loss)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
