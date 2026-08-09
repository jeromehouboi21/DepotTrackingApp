// Parity-Test der Engine gegen den Parser-Output (DESIGN §8, Validierungs-Test).
// Ohne Korrekturen muss die Engine portfolio_seed reproduzieren (Toleranz 0,01 EUR).

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { computePortfolio, applyOverrides, detectSavingsPlan } from "../src/lib/portfolio";
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
