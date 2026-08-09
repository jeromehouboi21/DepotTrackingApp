import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { fmtEur } from "../../lib/format";

/** Kumuliertes eingezahltes Kapital (BUY-net) - ehrlich beschriftet, kein Marktwert-Verlauf. */
export function InvestedOverTimeArea({ data }) {
  // data: [{date: 'YYYY-MM', invested: number}]
  if (!data.length) return <div className="text-sm text-ink-3">Keine Daten.</div>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ left: 8, right: 8 }}>
        <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={40} />
        <YAxis tickFormatter={(v) => fmtEur(v)} tick={{ fontSize: 10 }} width={80} />
        <Tooltip formatter={(v) => fmtEur(v)} />
        <Area type="monotone" dataKey="invested" stroke="var(--color-accent)" fill="#e3ecea" name="Investiertes Kapital" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
