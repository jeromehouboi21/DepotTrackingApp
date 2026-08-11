import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { fmtEur, fmtPct } from "../../lib/format";

/** Diverging Bar: Top/Flop nach Gesamt-/unrealisiertem/realisiertem G/V ("womit Gewinn / womit Verlust"). */
export function WinnersLosersBar({ data, unit = "eur" }) {
  // data: [{name, value}] sortiert · unit: 'eur' | 'pct' (value dann als Bruch, z.B. 0.12 = 12%)
  const fmt = unit === "pct" ? fmtPct : fmtEur;
  if (!data.length) return <div className="text-sm text-ink-3">Keine Daten.</div>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 26)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="name" width={170} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v) => fmt(v)} />
        <ReferenceLine x={0} stroke="#9aa0a8" />
        <Bar dataKey="value" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? "var(--color-gain)" : "var(--color-loss)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
