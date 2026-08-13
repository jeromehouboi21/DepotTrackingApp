// comdirect-Depotuebersicht-CSV -> EUR-Kurse fuer price_quotes (source='comdirect-import').
// Reine, testbare Funktionen (kein Supabase-Zugriff) - siehe
// FEATURE Comdirect-Kurs-Batch-Import.md. Zielort ist price_quotes, nicht
// price_overrides: die Automatik (fetch-prices) muss einen comdirect-Kurs
// spaeter ohne Aufraeumschritt ueberschreiben koennen.

// Zeilen dieser Art beenden den Datenblock (Summary-Bloecke, Fusszeile).
const SUMMARY_MARKERS = [
  "depotwert", "kaufwert", "veränderung", "veraenderung", "beleihungswert",
  "enthält aktuell ausgeführte orders", "enthaelt aktuell ausgefuehrte orders",
  "wechselkurs", "kundennummer",
];

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ";") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

function parseDeNumber(s: string | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// "11.08.2026" + "20:11:50" (oder "--" ohne Handelstag) -> ISO-Timestamp.
function parseDateTime(datum: string | undefined, zeit: string | undefined): string | null {
  const m = (datum ?? "").trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  let hh = "00", mi = "00", ss = "00";
  const t = (zeit ?? "").trim();
  if (t && t !== "--") {
    const tm = t.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (tm) {
      hh = tm[1];
      mi = tm[2];
      ss = tm[3] ?? "00";
    }
  }
  const dt = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

interface RawPriceRow {
  wkn: string;
  name: string;
  currency: string;
  shares: number;
  valueEur: number;
  asOf: string;
}

export interface ParsedPriceRow {
  wkn: string;
  name: string;
  currency: string;
  sharesTotal: number;
  valueEurTotal: number;
  price: number; // valueEurTotal / sharesTotal, bereits EUR (comdirect hat FX erledigt)
  asOf: string; // juengster Zeitstempel der zusammengefuehrten Zeilen
  rowCount: number; // Anzahl urspruenglicher CSV-Zeilen (>1 = Boersenplatz-/Waehrungs-Split)
}

const HEADER = {
  shares: "Stück / Nominale",
  name: "Bezeichnung",
  wkn: "WKN",
  currency: "Währung",
  valueEur: "Wert in EUR",
  date: "Datum",
  time: "Zeit",
};

/** Parst den rohen (bereits cp1252->Unicode dekodierten) CSV-Text in Roh-Zeilen je Position. */
export function parseComdirectPriceCsv(text: string): { rows: ParsedPriceRow[]; rawRowCount: number } {
  const lines = text.split(/\r\n|\r|\n/);

  let headerIdx = -1;
  let header: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = splitCsvLine(lines[i]);
    if (fields.includes(HEADER.wkn) && fields.includes(HEADER.name)) {
      header = fields;
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return { rows: [], rawRowCount: 0 };

  const iShares = header.indexOf(HEADER.shares);
  const iName = header.indexOf(HEADER.name);
  const iWkn = header.indexOf(HEADER.wkn);
  const iCurrency = header.indexOf(HEADER.currency);
  const iValueEur = header.indexOf(HEADER.valueEur);
  const iDate = header.indexOf(HEADER.date);
  const iTime = header.indexOf(HEADER.time);

  const raw: RawPriceRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) break; // Leerzeile vor den Summary-Bloecken
    const fields = splitCsvLine(line);
    if (fields.length < header.length) break; // Summary-Zeilen haben weniger Spalten
    const first = (fields[0] ?? "").toLowerCase();
    if (SUMMARY_MARKERS.some((marker) => first.includes(marker))) break;

    const wkn = (fields[iWkn] ?? "").toUpperCase();
    const shares = parseDeNumber(fields[iShares]);
    const valueEur = parseDeNumber(fields[iValueEur]);
    const asOf = parseDateTime(fields[iDate], fields[iTime]);
    if (!wkn || shares == null || valueEur == null || !asOf) continue; // defekte Zeile ueberspringen

    raw.push({ wkn, name: fields[iName] ?? "", currency: fields[iCurrency] || "EUR", shares, valueEur, asOf });
  }

  // Gleiche WKN zusammenfassen (Boersenplatz-/Waehrungs-Split, s. Design-Dok):
  // gewichteter EUR-Kurs = Summe(Wert in EUR) / Summe(Stueck).
  const byWkn = new Map<string, RawPriceRow[]>();
  for (const r of raw) {
    (byWkn.get(r.wkn) ?? byWkn.set(r.wkn, []).get(r.wkn)!).push(r);
  }
  const rows: ParsedPriceRow[] = [...byWkn.entries()].map(([wkn, group]) => {
    const sharesTotal = group.reduce((s, r) => s + r.shares, 0);
    const valueEurTotal = group.reduce((s, r) => s + r.valueEur, 0);
    const asOf = group.reduce((latest, r) => (r.asOf > latest ? r.asOf : latest), group[0].asOf);
    const currencies = new Set(group.map((r) => r.currency));
    return {
      wkn,
      name: group[0].name,
      currency: currencies.size === 1 ? group[0].currency : [...currencies].join("/"),
      sharesTotal,
      valueEurTotal,
      price: sharesTotal > 0 ? valueEurTotal / sharesTotal : 0,
      asOf,
      rowCount: group.length,
    };
  });

  return { rows, rawRowCount: raw.length };
}

export interface PriceDiffRow extends ParsedPriceRow {
  isin: string | null;
  category: "update" | "skip" | "unknown";
  currentPrice: number | null;
  currentAsOf: string | null;
  currentSource: string | null;
  deltaEur: number | null;
  deltaPct: number | null;
}

/**
 * Ordnet geparste Zeilen den bekannten Wertpapieren zu (WKN-Match) und
 * kategorisiert sie gegen den vorhandenen price_quotes-Stand:
 * - "update": kein vorhandener Kurs ODER Import-as_of >= vorhandener as_of
 * - "skip": vorhandener Kurs ist juenger (Konfliktregel gegen alte Re-Importe)
 * - "unknown": WKN ohne Treffer in securities
 */
export function buildPriceDiff(
  rows: ParsedPriceRow[],
  securities: Array<{ isin: string; wkn: string | null; name: string | null }>,
  quotesByIsin: Record<string, { price: number; as_of: string | null; source: string | null }>,
): PriceDiffRow[] {
  const byWkn = new Map<string, { isin: string; name: string | null }>();
  for (const s of securities) {
    if (s.wkn) byWkn.set(s.wkn.toUpperCase(), { isin: s.isin, name: s.name });
  }

  return rows.map((r) => {
    const sec = byWkn.get(r.wkn);
    if (!sec) {
      return {
        ...r, isin: null, category: "unknown",
        currentPrice: null, currentAsOf: null, currentSource: null, deltaEur: null, deltaPct: null,
      };
    }
    const current = quotesByIsin[sec.isin];
    const currentPrice = current?.price ?? null;
    const currentAsOf = current?.as_of ?? null;
    const currentSource = current?.source ?? null;
    const category: PriceDiffRow["category"] =
      !current || !currentAsOf || new Date(r.asOf).getTime() >= new Date(currentAsOf).getTime()
        ? "update"
        : "skip";
    const deltaEur = currentPrice != null ? r.price - currentPrice : null;
    const deltaPct = currentPrice != null && currentPrice !== 0 ? (r.price - currentPrice) / currentPrice : null;
    return { ...r, isin: sec.isin, category, currentPrice, currentAsOf, currentSource, deltaEur, deltaPct };
  });
}
