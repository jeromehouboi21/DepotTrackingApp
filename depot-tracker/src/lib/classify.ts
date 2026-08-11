// Objekttyp-Klassifizierung (Aktie/ETF/Fonds/Anleihe/Sonstige), getrennt von
// securities.asset_class (equity|fund_etf|bond|other - bleibt fuer den
// AllocationDonut unveraendert). Reihenfolge: manueller Override (securities.
// object_type) -> OpenFIGI-Typ (figi_security_type) -> Namens-Heuristik.

export type ObjectType = "stock" | "etf" | "fund" | "bond" | "other";

export const OBJECT_TYPE_LABEL: Record<ObjectType, string> = {
  stock: "Aktie", etf: "ETF", fund: "Fonds", bond: "Anleihe", other: "Sonstige",
};

// stabile Sortier-/Anzeigereihenfolge der Gruppen
export const OBJECT_TYPE_ORDER: ObjectType[] = ["stock", "etf", "fund", "bond", "other"];

/** OpenFIGI securityType2 / securityType -> ObjectType */
export function mapFigiSecurityType(t?: string | null): ObjectType | null {
  if (!t) return null;
  const s = t.toUpperCase();
  if (s.includes("ETP") || s.includes("ETF")) return "etf";
  if (s.includes("MUTUAL FUND") || s.includes("OPEN-END") || s.includes("FUND")) return "fund";
  if (s.includes("BOND") || s.includes("NOTE") || s.includes("BILL")) return "bond";
  if (s.includes("COMMON STOCK") || s.includes("DEPOSITARY") || s.includes("ADR")
      || s.includes("REIT") || s.includes("PREFERRED") || s.includes("SHARES")) return "stock";
  return "other";
}

/** Namens-Heuristik (letzter Fallback). ETF-Signale bewusst vor Fonds geprueft. */
export function objectTypeFromName(name: string): ObjectType {
  const u = name.toUpperCase();
  const has = (...k: string[]) => k.some((x) => u.includes(x));
  if (has("ETF", "UCITS", "MSCI", "STOXX", "ACWI", "FTSE", "S&P", "INDEX", "IMI", "SMALL CAP"))
    return "etf";
  if (has("FONDS", "FUND", "SICAV", "RAIFF", "-EQ.", "AKT.", "A ST.", "-INH", "I.B-"))
    return "fund";
  if (has("ANLEIHE", "BOND", "% ", "MTN", "NOTES"))
    return "bond";
  return "stock";
}

/** effektiver Objekttyp: Override -> OpenFIGI -> Name-Heuristik */
export function classifyObjectType(sec: {
  object_type?: string | null;
  figi_security_type?: string | null;
  name: string;
}): ObjectType {
  if (sec.object_type) return sec.object_type as ObjectType;
  return mapFigiSecurityType(sec.figi_security_type) ?? objectTypeFromName(sec.name);
}
