import { fmtEur, fmtEurSigned } from "../../lib/format";

/** Betrag in de-DE, tabular-nums, optional Vorzeichen-Farbe. */
export function Money({ value, signed = false, colored = false, className = "" }) {
  const color =
    colored && value != null && isFinite(value)
      ? value > 0.004
        ? "text-gain"
        : value < -0.004
          ? "text-loss"
          : "text-ink-2"
      : "";
  return (
    <span className={`tnum ${color} ${className}`}>
      {signed ? fmtEurSigned(value) : fmtEur(value)}
    </span>
  );
}
