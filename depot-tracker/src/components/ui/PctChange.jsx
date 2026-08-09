import { fmtPct } from "../../lib/format";

export function PctChange({ value, className = "" }) {
  if (value == null || !isFinite(value)) {
    return <span className={`tnum text-ink-3 ${className}`}>–</span>;
  }
  const up = value > 0.0001;
  const down = value < -0.0001;
  const color = up ? "text-gain" : down ? "text-loss" : "text-ink-2";
  const arrow = up ? "▲" : down ? "▼" : "•";
  return (
    <span className={`tnum ${color} ${className}`}>
      {arrow} {fmtPct(value)}
    </span>
  );
}
