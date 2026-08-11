import { describe, it, expect } from "vitest";
import { xirr } from "../src/lib/xirr";

describe("xirr", () => {
  it("liefert null bei weniger als zwei Cashflows", () => {
    expect(xirr([])).toBeNull();
    expect(xirr([{ date: new Date("2020-01-01"), amount: -100 }])).toBeNull();
  });

  it("liefert null ohne Vorzeichenwechsel", () => {
    expect(
      xirr([
        { date: new Date("2020-01-01"), amount: 100 },
        { date: new Date("2021-01-01"), amount: 50 },
      ]),
    ).toBeNull();
  });

  it("berechnet ~10% fuer einen einfachen Ein-Jahres-Zyklus", () => {
    const r = xirr([
      { date: new Date("2020-01-01"), amount: -1000 },
      { date: new Date("2021-01-01"), amount: 1100 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(0.1, 2);
  });

  it("berechnet eine plausible Rendite fuer mehrere unregelmaessige Cashflows", () => {
    const r = xirr([
      { date: new Date("2020-01-01"), amount: -1000 },
      { date: new Date("2020-07-01"), amount: -500 },
      { date: new Date("2021-06-01"), amount: 1800 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0);
    expect(r!).toBeLessThan(1);
  });

  it("erkennt einen Verlust (negative Rendite)", () => {
    const r = xirr([
      { date: new Date("2020-01-01"), amount: -1000 },
      { date: new Date("2021-01-01"), amount: 800 },
    ]);
    expect(r).not.toBeNull();
    expect(r!).toBeLessThan(0);
  });

  it("ist symmetrisch zur Skalierung (100x Betraege -> gleiche Rendite)", () => {
    const flows = (scale: number) => [
      { date: new Date("2020-01-01"), amount: -1000 * scale },
      { date: new Date("2020-06-15"), amount: 200 * scale },
      { date: new Date("2021-03-01"), amount: 950 * scale },
    ];
    const r1 = xirr(flows(1));
    const r100 = xirr(flows(100));
    expect(r1).not.toBeNull();
    expect(r100).not.toBeNull();
    expect(r1!).toBeCloseTo(r100!, 6);
  });
});
