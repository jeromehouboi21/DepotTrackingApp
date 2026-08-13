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

// Grobe Alters-Angabe fuer Kursquelle-Badges ("vor 2 Std.", "vor 3 Tg.").
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return "–";
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "gerade eben";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.floor(std / 24);
  return `vor ${tage} Tg.`;
}
