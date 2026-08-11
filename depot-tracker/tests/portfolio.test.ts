// Parity-Test der Engine gegen den Parser-Output (DESIGN §8, Validierungs-Test).
// Ohne Korrekturen muss die Engine portfolio_seed reproduzieren (Toleranz 0,01 EUR).

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  computePortfolio, applyOverrides, detectSavingsPlan, aggregateYears,
  cumulativeRealized, realizedXirrByYear, overallXirrFlows,
} from "../src/lib/portfolio";
import type { Transaction } from "../src/lib/portfolio";

const OUT = resolve(__dirname, "../../depot-parser/output");
const HAS_SEED = existsSync(resolve(OUT, "transactions.json"));

function load<T>(file: string): T {
  return JSON.parse(readFileSync(resolve(OUT, file), "utf-8"));
}

describe.skipIf(!HAS_SEED)("Engine-Paritaet gegen Parser-Seed", () => {
  const transactions = HAS_SEED ? load<Transaction[]>("transactions.json") : [];
  const seed = HAS_SEED
    ? load<{ positions: any[] }>("portfolio.json")
    : { positions: [] };
  const result = HAS_SEED ? computePortfolio({ transactions }) : null!;

  it("verarbeitet alle 907 Transaktionen", () => {
    expect(transactions.length).toBe(907);
  });

  it("liefert dieselbe Positionsanzahl wie der Seed", () => {
    expect(result.positions.length).toBe(seed.positions.length);
  });

  it("reproduziert sharesHeld, costBasisRemaining und realizedPl je ISIN (±0,01)", () => {
    const seedByIsin = new Map(seed.positions.map((p: any) => [p.isin, p]));
    const diffs: string[] = [];
    for (const pos of result.positions) {
      const s = seedByIsin.get(pos.isin);
      if (!s) {
        diffs.push(`${pos.isin}: fehlt im Seed`);
        continue;
      }
      if (Math.abs(pos.sharesHeld - s.shares_held) > 0.001) {
        diffs.push(`${pos.isin}: sharesHeld ${pos.sharesHeld} vs ${s.shares_held}`);
      }
      if (Math.abs(pos.costBasisRemaining - s.cost_basis_remaining) > 0.01) {
        diffs.push(
          `${pos.isin}: costBasis ${pos.costBasisRemaining.toFixed(2)} vs ${s.cost_basis_remaining.toFixed(2)}`,
        );
      }
      if (Math.abs(pos.realizedPl - s.realized_pl) > 0.01) {
        diffs.push(`${pos.isin}: realizedPl ${pos.realizedPl.toFixed(2)} vs ${s.realized_pl.toFixed(2)}`);
      }
    }
    expect(diffs, diffs.join("\n")).toEqual([]);
  });

  it("reproduziert die Aggregate (realized ~3.050,52 / costBasis ~88.138,30)", () => {
    const seedRealized = seed.positions.reduce((s: number, p: any) => s + p.realized_pl, 0);
    const seedCost = seed.positions
      .filter((p: any) => p.shares_held > 1e-9)
      .reduce((s: number, p: any) => s + p.cost_basis_remaining, 0);
    expect(Math.abs(result.totals.realizedPl - seedRealized)).toBeLessThan(0.01);
    expect(Math.abs(result.totals.costBasis - seedCost)).toBeLessThan(0.01);
  });

  it("zaehlt SELLs pro Jahr wie erwartet (Anhang A)", () => {
    const expected: Record<string, number> = {
      "2008": 6, "2009": 1, "2017": 15, "2019": 1, "2020": 8,
      "2022": 9, "2023": 21, "2024": 19, "2025": 66, "2026": 18,
    };
    for (const [year, count] of Object.entries(expected)) {
      expect(result.byYear[year]?.count ?? 0, `Jahr ${year}`).toBe(count);
    }
  });

  it("cumulativeRealized endet bei ~3.050,52 EUR (DESIGN_Dashboard-Auswertungen §2)", () => {
    const allSells = Object.values(result.byYear).flatMap((y: any) => y.sells);
    const points = cumulativeRealized(allSells);
    expect(points.length).toBeGreaterThan(0);
    const endValue = points[points.length - 1].cumRealized;
    expect(Math.abs(endValue - result.totals.realizedPl)).toBeLessThan(0.01);
    expect(endValue).toBeCloseTo(3050.52, 1);
  });

  it("cumulativeRealized ist streng chronologisch aufsteigend nach Datum", () => {
    const allSells = Object.values(result.byYear).flatMap((y: any) => y.sells);
    const points = cumulativeRealized(allSells);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].date >= points[i - 1].date).toBe(true);
    }
  });

  it("aggregateYears(2025+2026) summiert 66+18=84 Verkaeufe (DESIGN §6.3)", () => {
    const combined = aggregateYears(result.byYear, ["2025", "2026"]);
    expect(combined.count).toBe(84);
    expect(combined.realizedPl).toBeCloseTo(
      result.byYear["2025"].realizedPl + result.byYear["2026"].realizedPl, 2,
    );
  });

  it("erkennt die bekannten Sparplaene per Heuristik (E4)", () => {
    const spIsins = result.positions.filter((p) => p.isSavingsPlan).map((p) => p.isin);
    // Die 5 Scalable-ETF-Sparplaene + Amundi ACWI muessen dabei sein
    for (const isin of [
      "IE00BL25JL35", // Xtrackers World Quality
      "IE00BL25JP72", // Xtrackers World Momentum
      "IE00BKM4GZ66", // iShares EM IMI
      "IE00BCBJG560", // SPDR World Small Cap
      "LU1829220216", // Amundi ACWI
    ]) {
      expect(spIsins, `Sparplan ${isin}`).toContain(isin);
    }
  });
});

describe("Overrides & Korrekturen", () => {
  const baseTx: Transaction = {
    id: "T1", source: "comdirect", date: "2020-01-02", type: "BUY",
    isin: "DE0000000001", wkn: null, name: "Test", shares: 10, price: 10,
    gross: 100, fees: 5, tax: 0, net: -105, currency: "EUR", raw_ref: "t",
    reported_realized_pl: null, cost_lots: [], flags: [],
  };

  it("applyOverrides patcht nur die angegebenen Felder", () => {
    const [patched] = applyOverrides([baseTx], [{ transaction_id: "T1", patch: { fees: 9.9 } }]);
    expect(patched.fees).toBe(9.9);
    expect(patched.net).toBe(-105);
  });

  it("manual_cost_lots liefern die Basis fuer NO_COST_BASIS-Verkaeufe", () => {
    const sell: Transaction = {
      ...baseTx, id: "S1", type: "SELL", date: "2021-06-01", shares: 10, net: 150,
    };
    const withoutLot = computePortfolio({ transactions: [sell] });
    expect(withoutLot.noCostBasisSells.length).toBe(1);

    const withLot = computePortfolio({
      transactions: [sell],
      manualCostLots: [{ isin: "DE0000000001", date: "2019-01-01", shares: 10, cost: 100 }],
    });
    expect(withLot.noCostBasisSells.length).toBe(0);
    expect(withLot.positions[0].realizedPl).toBeCloseTo(50, 2);
  });

  it("manuell nachgetragener SELL schliesst die Position (F2)", () => {
    // Simuliert die usePortfolio-Einmischung: kanonische manuelle Transaktion
    const manualSell: Transaction = {
      id: "manual:abc", source: "manual", date: "2026-08-01", type: "SELL",
      isin: "DE0000000001", wkn: null, name: null, shares: 10, price: 0,
      gross: 0, fees: 0, tax: 0, net: 105, currency: "EUR",
      raw_ref: "manuell nachgetragen", reported_realized_pl: null,
      cost_lots: [], flags: ["MANUAL"],
    };
    const r = computePortfolio({ transactions: [baseTx, manualSell] });
    const pos = r.positions[0];
    expect(pos.sharesHeld).toBe(0); // faellt aus dem "Mit Bestand"-Filter
    expect(pos.realizedPl).toBeCloseTo(0, 2); // Erloes = Kostenbasis -> kein erfundener G/V
    expect(pos.flags).toContain("MANUAL");
  });

  it("Override 'gemeldeten Bankwert uebernehmen' beseitigt den Mismatch", () => {
    const buy = { ...baseTx };
    const sell: Transaction = {
      ...baseTx, id: "S1", type: "SELL", date: "2021-06-01", net: 150,
      reported_realized_pl: 40,
    };
    const before = computePortfolio({ transactions: [buy, sell] });
    expect(before.fifoMismatches.length).toBe(1); // eigene 45 vs. 40

    // Korrektur: Kostenbasis des Kaufs anpassen (Patch auf net)
    const after = computePortfolio({
      transactions: [buy, sell],
      overrides: [{ transaction_id: "T1", patch: { net: -110 } }],
    });
    expect(after.fifoMismatches.length).toBe(0);
  });
});

describe("objectType an der Position (DESIGN_Objekttyp-Gruppierung)", () => {
  const buy: Transaction = {
    id: "B1", source: "comdirect", date: "2020-01-02", type: "BUY",
    isin: "IE00TEST0001", wkn: null, name: "iShs Core MSCI EM IMI U.ETF", shares: 10, price: 10,
    gross: 100, fees: 5, tax: 0, net: -105, currency: "EUR", raw_ref: "t",
    reported_realized_pl: null, cost_lots: [], flags: [],
  };

  it("faellt ohne Override/OpenFIGI auf die Namens-Heuristik zurueck", () => {
    const r = computePortfolio({ transactions: [buy] });
    expect(r.positions[0].objectType).toBe("etf");
  });

  it("manueller Override (securityMeta.object_type) gewinnt", () => {
    const r = computePortfolio({
      transactions: [buy],
      securityMeta: { "IE00TEST0001": { isin: "IE00TEST0001", object_type: "fund" } },
    });
    expect(r.positions[0].objectType).toBe("fund");
  });
});

describe("aggregateYears (DESIGN_Realisiert_Mehrfach-Jahresauswahl)", () => {
  const mkSell = (id: string, isin: string, realized: number): any => ({
    tx_id: id, isin, name: null, date: "2000-01-01", year: "2000", shares: 1,
    proceeds: realized, fees: 0, tax: 0, matchedCost: 0, ownRealized: realized,
    reported: null, realized, mismatch: false, noCostBasis: false, allocatedLots: [],
  });

  const byYear = {
    "2025": {
      year: "2025", realizedPl: 100, proceeds: 200, cost: 100, fees: 5, tax: 10,
      count: 2, excludedNoCostBasis: 0, sells: [mkSell("s1", "A", 60), mkSell("s2", "A", 40)],
    },
    "2026": {
      year: "2026", realizedPl: -20, proceeds: 30, cost: 50, fees: 1, tax: 0,
      count: 1, excludedNoCostBasis: 1, sells: [mkSell("s3", "B", -20)],
    },
  } as any;

  it("summiert ueber mehrere Jahre", () => {
    const r = aggregateYears(byYear, ["2025", "2026"]);
    expect(r.realizedPl).toBe(80);
    expect(r.proceeds).toBe(230);
    expect(r.cost).toBe(150);
    expect(r.fees).toBe(6);
    expect(r.tax).toBe(10);
    expect(r.count).toBe(3);
    expect(r.excludedNoCostBasis).toBe(1);
    expect(r.sells.map((s) => s.tx_id)).toEqual(["s1", "s2", "s3"]);
  });

  it("liefert genau ein Jahr wie das frühere Single-Select", () => {
    const r = aggregateYears(byYear, ["2025"]);
    expect(r.realizedPl).toBe(100);
    expect(r.count).toBe(2);
  });

  it("leere Jahresmenge liefert Nullwerte, kein Fehler", () => {
    const r = aggregateYears(byYear, []);
    expect(r.realizedPl).toBe(0);
    expect(r.count).toBe(0);
    expect(r.sells).toEqual([]);
  });

  it("ignoriert unbekannte Jahre statt zu werfen", () => {
    const r = aggregateYears(byYear, ["2025", "1999"]);
    expect(r.realizedPl).toBe(100);
    expect(r.count).toBe(2);
  });
});

describe("cumulativeRealized (synthetisch)", () => {
  const mkSell = (id: string, date: string, realized: number | null): any => ({
    tx_id: id, isin: "A", name: null, date, year: date.slice(0, 4), shares: 1,
    proceeds: realized ?? 0, fees: 0, tax: 0, matchedCost: 0, ownRealized: realized,
    reported: null, realized, mismatch: false, noCostBasis: realized == null, allocatedLots: [],
  });

  it("kumuliert chronologisch, auch bei unsortierter Eingabe", () => {
    const sells = [mkSell("s2", "2021-06-01", 20), mkSell("s1", "2020-01-01", 100), mkSell("s3", "2022-01-01", -50)];
    const points = cumulativeRealized(sells);
    expect(points.map((p) => p.date)).toEqual(["2020-01-01", "2021-06-01", "2022-01-01"]);
    expect(points.map((p) => p.cumRealized)).toEqual([100, 120, 70]);
  });

  it("ueberspringt Verkaeufe ohne Kostenbasis (realized=null)", () => {
    const sells = [mkSell("s1", "2020-01-01", 100), mkSell("s2", "2020-06-01", null)];
    const points = cumulativeRealized(sells);
    expect(points.length).toBe(1);
    expect(points[0].cumRealized).toBe(100);
  });
});

describe("realizedXirrByYear (synthetisch)", () => {
  const mkSell = (id: string, year: string, date: string, proceeds: number, lots: Array<[string, number]>): any => ({
    tx_id: id, isin: "A", name: null, date, year, shares: 1,
    proceeds, fees: 0, tax: 0, matchedCost: lots.reduce((s, [, c]) => s + c, 0),
    ownRealized: null, reported: null, realized: proceeds, mismatch: false, noCostBasis: false,
    allocatedLots: lots.map(([d, c]) => ({ date: d, shares: 1, cost: c, tx_id: "b" })),
  });

  it("liefert eine positive Rendite fuer einen klaren Gewinn-Zyklus", () => {
    const sells = [mkSell("s1", "2025", "2025-06-01", 1100, [["2024-06-01", 1000]])];
    const r = realizedXirrByYear(sells);
    expect(r["2025"]).not.toBeNull();
    expect(r["2025"]!).toBeGreaterThan(0);
  });

  it("ignoriert Verkaeufe ohne zugeordnete Lots (keine Kostenbasis)", () => {
    const sells = [mkSell("s1", "2025", "2025-06-01", 500, [])];
    const r = realizedXirrByYear(sells);
    expect(r["2025"] ?? null).toBeNull();
  });

  it("rechnet Jahre unabhaengig voneinander", () => {
    const sells = [
      mkSell("s1", "2024", "2024-06-01", 1100, [["2023-06-01", 1000]]),
      mkSell("s2", "2025", "2025-06-01", 900, [["2024-06-01", 1000]]), // Verlust
    ];
    const r = realizedXirrByYear(sells);
    expect(r["2024"]!).toBeGreaterThan(0);
    expect(r["2025"]!).toBeLessThan(0);
  });
});

describe("overallXirrFlows (synthetisch)", () => {
  const mkPosition = (overrides: any): any => ({
    isin: "A", wkn: null, name: "Test", sources: [], assetClass: "equity", objectType: "stock",
    isSavingsPlan: false, flags: [], sharesHeld: 0, openLots: [], costBasisRemaining: 0, avgCost: 0,
    currentPrice: null, priceAsOf: null, priceIsOverride: false, marketValue: null, unrealizedPl: null,
    unrealizedPct: null, realizedPl: 0, realizedPlReported: null, realizedMatches: true,
    hasUnknownCostBasis: false, sells: [], totalBuyFees: 0, totalSellFees: 0, totalTransferFees: 0,
    totalFees: 0, totalTax: 0, totalInvested: 0, txIds: [], txCount: 0,
    ...overrides,
  });

  it("nimmt offene Lots am Original-Kaufdatum als Ausgabe + heutigen Marktwert als Schlusswert", () => {
    const pos = mkPosition({
      openLots: [{ date: "2024-01-01", shares: 10, cost_per_share: 10, tx_id: "b1", isManual: false, costBasis: 100, marketValue: 150, unrealizedPl: 50, unrealizedPct: 0.5, holdingDays: 400, annualizedPct: 0.4 }],
      marketValue: 150, sharesHeld: 10,
    });
    const flows = overallXirrFlows([pos], [], new Date("2025-06-01"));
    expect(flows).toContainEqual({ date: new Date("2024-01-01"), amount: -100 });
    expect(flows).toContainEqual({ date: new Date("2025-06-01"), amount: 150 });
  });

  it("verwendet bei Verkaeufen die FIFO-zugeordneten Lot-Daten (kein Cashflow am Uebertragstag)", () => {
    const pos = mkPosition({
      sells: [{
        tx_id: "s1", isin: "A", name: null, date: "2025-03-01", year: "2025", shares: 5,
        proceeds: 120, fees: 0, tax: 0, matchedCost: 100, ownRealized: 20, reported: null,
        realized: 20, mismatch: false, noCostBasis: false,
        allocatedLots: [{ date: "2020-01-01", shares: 5, cost: 100, tx_id: "b1" }],
      }],
    });
    const flows = overallXirrFlows([pos], [], new Date("2025-06-01"));
    expect(flows).toContainEqual({ date: new Date("2020-01-01"), amount: -100 });
    expect(flows).toContainEqual({ date: new Date("2025-03-01"), amount: 120 });
  });

  it("nimmt Dividenden/Zinsen als Einnahme, aber keine Ein-/Auszahlungen", () => {
    const cash = [
      { tx_id: "c1", date: "2025-01-01", name: "Dividende", isin: "A", net: 10, kind: "distribution" as const },
      { tx_id: "c2", date: "2025-01-02", name: "Zins", isin: null, net: 2, kind: "interest" as const },
      { tx_id: "c3", date: "2025-01-03", name: "Einzahlung", isin: null, net: 1000, kind: "other" as const },
    ];
    const flows = overallXirrFlows([], cash, new Date("2025-06-01"));
    expect(flows).toContainEqual({ date: new Date("2025-01-01"), amount: 10 });
    expect(flows).toContainEqual({ date: new Date("2025-01-02"), amount: 2 });
    expect(flows.some((f) => f.amount === 1000)).toBe(false);
  });
});

describe("Sparplan-Heuristik", () => {
  it("braucht >=5 Bruchstueck-Kaeufe", () => {
    const mk = (i: number, shares: number): Transaction => ({
      id: `B${i}`, source: "scalable", date: `2024-0${(i % 8) + 1}-01`, type: "BUY",
      isin: "X", wkn: null, name: null, shares, price: 1, gross: shares, fees: 0,
      tax: 0, net: -shares, currency: "EUR", raw_ref: "", reported_realized_pl: null,
      cost_lots: [], flags: [],
    });
    expect(detectSavingsPlan([1, 2, 3, 4].map((i) => mk(i, 0.5)))).toBe(false);
    expect(detectSavingsPlan([1, 2, 3, 4, 5].map((i) => mk(i, 0.5)))).toBe(true);
    expect(detectSavingsPlan([1, 2, 3, 4, 5, 6].map((i) => mk(i, 10)))).toBe(false);
  });
});
