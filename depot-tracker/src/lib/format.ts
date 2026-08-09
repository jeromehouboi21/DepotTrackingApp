// Deutsche Formatierung fuer Zahlen/Datum/Waehrung. Intern immer number (Punkt-Dezimal).

const EUR = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

const PCT = new Intl.NumberFormat("de-DE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

export function fmtEur(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "–";
  return EUR.format(v);
}

export function fmtEurSigned(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "–";
  return (v > 0 ? "+" : "") + EUR.format(v);
}

export function fmtShares(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "–";
  return NUM.format(v);
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !isFinite(v)) return "–";
  return PCT.format(v);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "–";
  const dt = new Date(iso);
  return dt.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}
