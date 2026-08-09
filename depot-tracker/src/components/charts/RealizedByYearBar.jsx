import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { fmtEur } from "../../lib/format";

export function RealizedByYearBar({ data, selectedYear, onSelect }) {
  // data: [{year, realizedPl}]
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 8, right: 8 }}>
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => fmtEur(v)} tick={{ fontSize: 10 }} width={80} />
        <Tooltip formatter={(v) => fmtEur(v)} />
        <ReferenceLine y={0} stroke="#9aa0a8" />
        <Bar dataKey="realizedPl" radius={[3, 3, 0, 0]} onClick={(d) => onSelect?.(d.year)} cursor={onSelect ? "pointer" : undefined}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.realizedPl >= 0 ? "var(--color-gain)" : "var(--color-loss)"}
              opacity={selectedYear && selectedYear !== "all" && d.year !== selectedYear ? 0.35 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
