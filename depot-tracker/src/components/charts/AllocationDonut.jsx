import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { fmtEur } from "../../lib/format";

const PALETTE = ["#2d5a4e", "#005ea8", "#b26b00", "#7c4dff", "#127c4a", "#b3261e", "#5b6067", "#1a1a2e", "#4c9a8f", "#8d6e63"];

export function AllocationDonut({ data }) {
  // data: [{name, value}]
  if (!data.length) return <div className="text-sm text-ink-3">Keine bewerteten Positionen.</div>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={1}>
          {data.map((_, i) => (
            <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => fmtEur(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
