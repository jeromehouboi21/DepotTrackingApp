// Geldgewichtete Rendite (XIRR). Reine, unit-testbare Funktion, kein State/Netz.
// Newton-Raphson mit Bisektions-Fallback, Tageszaehlung Actual/365.

export interface CashFlow {
  date: Date;
  amount: number; // Ausgabe negativ, Einnahme positiv
}

/** geldgewichtete Jahresrendite; null, wenn nicht bestimmbar */
export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasNeg = flows.some((f) => f.amount < 0);
  const hasPos = flows.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null; // ohne Vorzeichenwechsel kein IRR

  const t0 = Math.min(...flows.map((f) => +f.date));
  const yf = (d: Date) => (+d - t0) / (365 * 864e5); // Jahresbruchteile (Actual/365)
  const npv = (r: number) => flows.reduce((s, f) => s + f.amount / Math.pow(1 + r, yf(f.date)), 0);
  const dnpv = (r: number) =>
    flows.reduce((s, f) => {
      const t = yf(f.date);
      return s - (t * f.amount) / Math.pow(1 + r, t + 1);
    }, 0);

  // Newton
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const v = npv(r);
    const d = dnpv(r);
    if (!isFinite(v) || !isFinite(d) || d === 0) break;
    const nr = r - v / d;
    if (Math.abs(nr - r) < 1e-7) return nr <= -1 ? null : nr;
    r = nr;
  }

  // Bisektion als Fallback
  let lo = -0.9999;
  let hi = 10;
  let flo = npv(lo);
  if (!isFinite(flo)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if (flo * fm < 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return null; // nicht konvergiert -> n/a anzeigen
}
