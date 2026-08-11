// Objekttyp-Klassifizierung (DESIGN_Objekttyp-Gruppierung_und_Sparplan-Filter.md, §0)

import { describe, it, expect } from "vitest";
import {
  classifyObjectType,
  mapFigiSecurityType,
  objectTypeFromName,
  OBJECT_TYPE_ORDER,
  OBJECT_TYPE_LABEL,
} from "../src/lib/classify";

describe("mapFigiSecurityType", () => {
  it("erkennt ETF/ETP", () => {
    expect(mapFigiSecurityType("ETP")).toBe("etf");
    expect(mapFigiSecurityType("ETF")).toBe("etf");
  });
  it("erkennt Fonds", () => {
    expect(mapFigiSecurityType("Open-End Fund")).toBe("fund");
    expect(mapFigiSecurityType("Mutual Fund")).toBe("fund");
  });
  it("erkennt Anleihen", () => {
    expect(mapFigiSecurityType("Corp Bond")).toBe("bond");
    expect(mapFigiSecurityType("Treasury Note")).toBe("bond");
  });
  it("erkennt Aktien", () => {
    expect(mapFigiSecurityType("Common Stock")).toBe("stock");
    expect(mapFigiSecurityType("ADR")).toBe("stock");
    expect(mapFigiSecurityType("REIT")).toBe("stock");
  });
  it("liefert null ohne Eingabe", () => {
    expect(mapFigiSecurityType(null)).toBeNull();
    expect(mapFigiSecurityType(undefined)).toBeNull();
  });
});

describe("objectTypeFromName (Stichproben aus dem Design-Dokument, §Abnahme Teil A)", () => {
  const cases: Array<[string, string]> = [
    ["iShs Core MSCI EM IMI U.ETF", "etf"],
    ["Xtr. MSCI World Quality", "etf"],
    ["MUL Amundi ACWI ETF", "etf"],
    ["Amundi MSCI ACWI SRI", "etf"],
    ["ASTRA-FONDS ANTEILE", "fund"],
    ["BioNTech SE ADR", "stock"],
    ["BrainChip Holdings", "stock"],
  ];
  for (const [name, expected] of cases) {
    it(`"${name}" -> ${expected}`, () => {
      expect(objectTypeFromName(name)).toBe(expected);
    });
  }
});

describe("classifyObjectType - Prioritaet Override > OpenFIGI > Name", () => {
  it("manueller Override gewinnt immer", () => {
    expect(
      classifyObjectType({ object_type: "bond", figi_security_type: "Common Stock", name: "Irgendein ETF" }),
    ).toBe("bond");
  });
  it("OpenFIGI-Typ gewinnt vor der Namens-Heuristik", () => {
    expect(
      classifyObjectType({ object_type: null, figi_security_type: "Common Stock", name: "MSCI World UCITS ETF" }),
    ).toBe("stock");
  });
  it("Namens-Heuristik als letzter Fallback", () => {
    expect(
      classifyObjectType({ object_type: null, figi_security_type: null, name: "iShs Core MSCI EM IMI U.ETF" }),
    ).toBe("etf");
  });
});

describe("OBJECT_TYPE_ORDER/LABEL", () => {
  it("enthaelt alle fuenf Typen in der Anzeige-Reihenfolge", () => {
    expect(OBJECT_TYPE_ORDER).toEqual(["stock", "etf", "fund", "bond", "other"]);
    for (const t of OBJECT_TYPE_ORDER) expect(OBJECT_TYPE_LABEL[t]).toBeTruthy();
  });
});
