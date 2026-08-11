import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from "recharts";
import { fmtPct } from "../../lib/format";

/**
 * Realisierter XIRR je Jahr (§5.1) - nur Jahre mit vollstaendigen Kauf/Verkauf-
 * Cashflows liefern eine Zahl; sonst "n/a" statt 0% (keine Rendite vorzutaeuschen).
 */
export function XirrByYearBar({ xirrByYear, selectedYears }) {
  // xirrByYear: Record<year, number|null>
  const years = Object.keys(xirrByYear).sort();
  if (!years.length) return <div className="text-sm text-ink-3">Keine Daten.</div>;

  const data = years.map((y) => ({ year: y, value: xirrByYear[y] ?? 0, na: xirrByYear[y] == null }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ left: 8, right: 8, top: 16 }}>
        <XAxis dataKey="year" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={(v) => fmtPct(v)} tick={{ fontSize: 10 }} width={60} />
        <Tooltip
          formatter={(v, _n, p) => (p?.payload?.na ? "n/a" : fmtPct(v))}
        />
        <ReferenceLine y={0} stroke="#9aa0a8" />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.na ? "var(--color-ink-3)" : d.value >= 0 ? "var(--color-gain)" : "var(--color-loss)"}
              opacity={selectedYears && selectedYears.size > 0 && !selectedYears.has(d.year) ? 0.35 : 1}
            />
          ))}
          <LabelList
            dataKey="value"
            content={({ x, y, width, index }) => {
              const d = data[index];
              if (!d.na) return null;
              return (
                <text x={x + width / 2} y={y - 4} textAnchor="middle" fontSize={10} fill="var(--color-ink-3)">
                  n/a
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
