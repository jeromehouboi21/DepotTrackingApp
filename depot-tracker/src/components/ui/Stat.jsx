/** Kennzahl-Karte: Label, Wert, optional Sub-Wert. */
export function Stat({ label, children, sub, className = "" }) {
  return (
    <div className={`bg-surface rounded-xl border border-surface-2 px-4 py-3 ${className}`}>
      <div className="text-xs uppercase tracking-wide text-ink-3">{label}</div>
      <div className="text-xl font-medium tnum mt-1">{children}</div>
      {sub && <div className="text-xs text-ink-2 mt-0.5">{sub}</div>}
    </div>
  );
}
