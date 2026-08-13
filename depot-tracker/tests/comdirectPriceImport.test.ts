// FEATURE Comdirect-Kurs-Batch-Import.md

import { describe, it, expect } from "vitest";
import { parseComdirectPriceCsv, buildPriceDiff } from "../src/lib/comdirectPriceImport";

const HEADER =
  '"Stück / Nominale";"Bezeichnung";"WKN";"Währung";"Aktueller Kurs";"Wert in EUR";"Datum";"Zeit"';

function csv(...dataLines: string[]): string {
  return ["", HEADER, ...dataLines, "", '"Depotwert";"12.345,67"', '"Kaufwert";"11.000,00"'].join("\n");
}

describe("parseComdirectPriceCsv", () => {
  it("liest eine einfache Zeile inkl. Umlaut in der Bezeichnung", () => {
    const text = csv(
      '"8.500";"BRAINCHIP HOLDINGS LTD";"A14Z7W";"EUR";"9,515";"696,15";"11.08.2026";"20:11:50"',
    );
    const { rows } = parseComdirectPriceCsv(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].wkn).toBe("A14Z7W");
    expect(rows[0].name).toBe("BRAINCHIP HOLDINGS LTD");
    expect(rows[0].sharesTotal).toBe(8500);
    expect(rows[0].valueEurTotal).toBeCloseTo(696.15);
    expect(rows[0].price).toBeCloseTo(696.15 / 8500);
    expect(rows[0].asOf).toBe(new Date(2026, 7, 11, 20, 11, 50).toISOString());
    expect(rows[0].rowCount).toBe(1);
  });

  it("verwirft Summary-Bloecke und Leerzeilen nach den Datenzeilen", () => {
    const text = csv(
      '"100";"TEST AG";"AAAAAA";"EUR";"10,00";"1000,00";"01.01.2026";"09:00:00"',
    );
    const { rows, rawRowCount } = parseComdirectPriceCsv(text);
    expect(rawRowCount).toBe(1);
    expect(rows).toHaveLength(1);
  });

  it("setzt as_of auf 00:00 bei Zeit '--' (kein Handelstag)", () => {
    const text = csv('"10";"TEST AG";"AAAAAA";"EUR";"5,00";"50,00";"02.01.2026";"--"');
    const { rows } = parseComdirectPriceCsv(text);
    expect(rows[0].asOf).toBe(new Date(2026, 0, 2, 0, 0, 0).toISOString());
  });

  it("fasst dieselbe WKN ueber mehrere Boersenplaetze/Waehrungen gewichtet zusammen", () => {
    const text = csv(
      '"50";"SANA BIOTECHNICS EUR";"91LP4M";"EUR";"1,90";"95,00";"10.08.2026";"18:00:00"',
      '"20";"SANA BIOTECHNICS USD";"91LP4M";"USD";"2,10";"38,00";"10.08.2026";"18:05:00"',
    );
    const { rows } = parseComdirectPriceCsv(text);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.rowCount).toBe(2);
    expect(r.sharesTotal).toBe(70);
    expect(r.valueEurTotal).toBeCloseTo(133);
    expect(r.price).toBeCloseTo(133 / 70);
    // juengster Zeitstempel der Gruppe gewinnt
    expect(r.asOf).toBe(new Date(2026, 7, 10, 18, 5, 0).toISOString());
    expect(r.currency).toBe("EUR/USD");
  });

  it("liefert nichts, wenn keine Header-Zeile gefunden wird", () => {
    const { rows, rawRowCount } = parseComdirectPriceCsv("nur irgendein Text\nohne Struktur");
    expect(rows).toEqual([]);
    expect(rawRowCount).toBe(0);
  });
});

describe("buildPriceDiff", () => {
  const securities = [
    { isin: "AU000000BRN8", wkn: "A14Z7W", name: "BrainChip" },
    { isin: "US0000000001", wkn: "91LP4M", name: "Sana Biotechnics" },
  ];

  const rows = parseComdirectPriceCsv(
    csv(
      '"8.500";"BRAINCHIP HOLDINGS LTD";"A14Z7W";"EUR";"9,515";"696,15";"11.08.2026";"20:11:50"',
      '"100";"UNBEKANNT GMBH";"ZZZZZZ";"EUR";"1,00";"100,00";"11.08.2026";"20:11:50"',
    ),
  ).rows;

  it("markiert unbekannte WKN statt sie stumm zu verwerfen", () => {
    const diff = buildPriceDiff(rows, securities, {});
    const unknown = diff.find((d) => d.wkn === "ZZZZZZ");
    expect(unknown?.category).toBe("unknown");
    expect(unknown?.isin).toBeNull();
  });

  it("kategorisiert als 'update', wenn noch kein Kurs vorhanden ist", () => {
    const diff = buildPriceDiff(rows, securities, {});
    const known = diff.find((d) => d.wkn === "A14Z7W");
    expect(known?.category).toBe("update");
    expect(known?.isin).toBe("AU000000BRN8");
  });

  it("kategorisiert als 'update', wenn der Import-Kurs neuer oder gleich alt ist", () => {
    const diff = buildPriceDiff(rows, securities, {
      AU000000BRN8: { price: 600, as_of: new Date(2026, 7, 10, 0, 0, 0).toISOString(), source: "marketstack" },
    });
    const known = diff.find((d) => d.wkn === "A14Z7W");
    expect(known?.category).toBe("update");
    expect(known?.deltaEur).toBeCloseTo(696.15 / 8500 - 600);
  });

  it("kategorisiert als 'skip' (Konfliktregel), wenn der vorhandene Kurs juenger ist", () => {
    const diff = buildPriceDiff(rows, securities, {
      AU000000BRN8: { price: 600, as_of: new Date(2026, 7, 12, 0, 0, 0).toISOString(), source: "marketstack" },
    });
    const known = diff.find((d) => d.wkn === "A14Z7W");
    expect(known?.category).toBe("skip");
  });
});
