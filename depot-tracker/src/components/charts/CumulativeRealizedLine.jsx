import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";
import { fmtEur, fmtDate } from "../../lib/format";

/**
 * Kumulierter realisierter G/V ueber die volle Historie (§2) - ehrlicher als eine
 * nicht rekonstruierbare Depotwertkurve. Die Kurve bleibt IMMER vollstaendig;
 * die Jahresauswahl hebt nur die entsprechenden X-Bereiche hervor, filtert nicht.
 *
 * X-Achse ist numerisch (Zeitstempel) statt kategorial: ReferenceArea braucht fuer
 * die Jahres-Baender beliebige Grenzen (1.1./31.12.), die selten exakt auf einen
 * Datenpunkt fallen - auf einer category-Achse wuerde Recharts solche Bereiche
 * stillschweigend nicht zeichnen.
 */
export function CumulativeRealizedLine({ data, selectedYears }) {
  // data: [{date: 'YYYY-MM-DD', cumRealized}]
  if (!data.length) return <div className="text-sm text-ink-3">Noch keine Verkäufe.</div>;

  const points = data.map((d) => ({ t: +new Date(d.date), cumRealized: d.cumRealized }));

  // zusammenhaengende Jahres-Baender fuer die Hervorhebung ermitteln
  const bands = [];
  if (selectedYears && selectedYears.size > 0) {
    const years = [...new Set(data.map((d) => d.date.slice(0, 4)))].sort();
    let bandStart = null;
    for (let i = 0; i < years.length; i++) {
      const active = selectedYears.has(years[i]);
      if (active && bandStart === null) bandStart = years[i];
      const isLast = i === years.length - 1;
      const nextActive = !isLast && selectedYears.has(years[i + 1]);
      if (active && (isLast || !nextActive)) {
        bands.push([+new Date(`${bandStart}-01-01`), +new Date(`${years[i]}-12-31`)]);
        bandStart = null;
      }
    }
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={points} margin={{ left: 8, right: 8 }}>
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => fmtDate(new Date(v).toISOString())}
        />
        <YAxis tickFormatter={(v) => fmtEur(v)} tick={{ fontSize: 10 }} width={80} />
        <Tooltip formatter={(v) => fmtEur(v)} labelFormatter={(v) => fmtDate(new Date(v).toISOString())} />
        <ReferenceLine y={0} stroke="#9aa0a8" />
        {bands.map(([from, to], i) => (
          <ReferenceArea key={i} x1={from} x2={to} fill="var(--color-accent)" fillOpacity={0.1} />
        ))}
        <Line type="monotone" dataKey="cumRealized" stroke="var(--color-accent)" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
