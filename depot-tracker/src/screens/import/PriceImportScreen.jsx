import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../../hooks/useData";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Money } from "../../components/ui/Money";
import { PctChange } from "../../components/ui/PctChange";
import { fmtDateTime } from "../../lib/format";
import { parseComdirectPriceCsv, buildPriceDiff } from "../../lib/comdirectPriceImport";

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const SECTIONS = [
  { key: "update", title: "Wird aktualisiert", hint: "WKN gefunden, Import ist aktueller (oder es gibt noch keinen Kurs)." },
  { key: "skip", title: "Übersprungen – vorhandener Kurs ist neuer", hint: "Konfliktregel: ein älterer Export überschreibt keinen aktuelleren Automatik-Kurs." },
  { key: "unknown", title: "Unbekannte WKN", hint: "Kein Treffer in den Wertpapier-Stammdaten – wird nicht geschrieben." },
];

function DiffRow({ row }) {
  return (
    <tr className="border-b border-surface-2">
      <td className="px-2 py-1">{row.name || "–"}</td>
      <td className="px-2 py-1 tnum">{row.wkn}</td>
      <td className="px-2 py-1 text-right"><Money value={row.price} /></td>
      <td className="px-2 py-1 text-right text-ink-3">{fmtDateTime(row.asOf)}</td>
      <td className="px-2 py-1 text-right">
        {row.currentPrice != null ? <Money value={row.deltaEur} signed colored /> : <span className="text-ink-3">–</span>}
      </td>
      <td className="px-2 py-1 text-right">
        {row.currentPrice != null ? <PctChange value={row.deltaPct} /> : <span className="text-ink-3">–</span>}
      </td>
      <td className="px-2 py-1 text-xs text-ink-3">
        {row.rowCount > 1 && `aus ${row.rowCount} Zeilen zusammengeführt`}
      </td>
    </tr>
  );
}

/**
 * Comdirect-Depotübersicht-CSV -> price_quotes (source='comdirect-import').
 * Ergänzung zur automatischen marketstack-Kette für Exoten, die dort dauerhaft
 * 'unresolved' bleiben (§9-Erweiterung, FEATURE Comdirect-Kurs-Batch-Import.md).
 * price_quotes ist global (E9: kein owner_id) - unberührt von der Inhaber-Wahl.
 */
export function PriceImportScreen({ user }) {
  const { portfolio } = useData();
  const [fileName, setFileName] = useState(null);
  const [diff, setDiff] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setDiff([]);
    try {
      const buf = await file.arrayBuffer();
      const text = new TextDecoder("windows-1252").decode(buf);
      const { rows } = parseComdirectPriceCsv(text);
      if (!rows.length) {
        setError("Keine Datenzeilen gefunden – bitte die comdirect-Depotübersicht als CSV exportieren.");
        return;
      }
      const quotesByIsin = {};
      for (const q of portfolio.raw?.quotes ?? []) {
        if (q.price != null) quotesByIsin[q.isin] = { price: Number(q.price), as_of: q.as_of, source: q.source };
      }
      setDiff(buildPriceDiff(rows, portfolio.raw?.securities ?? [], quotesByIsin));
      setFileName(file.name);
    } catch (err) {
      setError(`Datei konnte nicht gelesen werden: ${err.message}`);
    }
  };

  const updates = diff.filter((d) => d.category === "update");
  const skipped = diff.filter((d) => d.category === "skip");
  const unknown = diff.filter((d) => d.category === "unknown");
  const byCategory = { update: updates, skip: skipped, unknown };

  const confirm = async () => {
    if (!updates.length) return;
    setBusy(true);
    setError(null);
    try {
      const payload = updates.map((d) => ({
        user_id: user.id,
        isin: d.isin,
        price: d.price,
        raw_price: null,
        raw_currency: null,
        fx_rate: null,
        as_of: d.asOf,
        source: "comdirect-import",
      }));
      for (const part of chunk(payload, 500)) {
        const { error: err } = await supabase.from("price_quotes").upsert(part, { onConflict: "user_id,isin" });
        if (err) throw err;
      }
      setResult({ updated: updates.length, skipped: skipped.length, unknown: unknown.length });
      setDiff([]);
      portfolio.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Kurs-Batch (comdirect)</h1>
      <p className="text-sm text-ink-2 max-w-2xl">
        Ergänzung zur automatischen Kurs-Auflösung: die comdirect-Depotübersicht (Export als CSV) liefert
        für Exoten, die marketstack nicht findet, einen EUR-Kurs. Löst die Automatik eine ISIN später
        selbst auf, ersetzt sie den hier gesetzten Kurs beim nächsten Lauf ohne Aufräumschritt. Betrifft
        ausschließlich die Kurs-Anzeige – nicht die FIFO-/G&amp;V-Rechnung.
      </p>

      <Card>
        <label className="block rounded-lg border-2 border-dashed border-surface-2 hover:border-ink-3 p-4 cursor-pointer transition-colors">
          <input type="file" accept=".csv" className="hidden" onChange={onFile} />
          <div className="font-medium text-sm">depotuebersicht_*.csv</div>
          <div className="text-xs text-ink-3">Export aus dem comdirect Web-Depot (Encoding: Windows-1252)</div>
          {fileName && <div className="text-xs text-accent mt-1">✓ {fileName}</div>}
        </label>
        {error && <div className="text-sm text-loss mt-3">{error}</div>}
      </Card>

      {diff.length > 0 && (
        <>
          {SECTIONS.map((s) => {
            const rows = byCategory[s.key];
            if (!rows.length) return null;
            return (
              <Card key={s.key} title={`${s.title} (${rows.length})`}>
                <p className="text-xs text-ink-3 mb-2">{s.hint}</p>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-surface-2 text-ink-2">
                        <th className="text-left px-2 py-1 font-medium">Name</th>
                        <th className="text-left px-2 py-1 font-medium">WKN</th>
                        <th className="text-right px-2 py-1 font-medium">Neuer Kurs</th>
                        <th className="text-right px-2 py-1 font-medium">Stand</th>
                        <th className="text-right px-2 py-1 font-medium">Δ €</th>
                        <th className="text-right px-2 py-1 font-medium">Δ %</th>
                        <th className="px-2 py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => <DiffRow key={r.wkn} row={r} />)}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}

          <Card>
            <div className="flex items-center gap-3">
              <Button onClick={confirm} disabled={busy || !updates.length}>
                {busy ? "Übernehme…" : `${updates.length} Kurs${updates.length === 1 ? "" : "e"} übernehmen`}
              </Button>
              <span className="text-xs text-ink-3">Schreibt nur die Zeilen aus „Wird aktualisiert".</span>
            </div>
          </Card>
        </>
      )}

      {result && (
        <Card title="Ergebnis">
          <ul className="text-sm space-y-1">
            <li>Aktualisiert: <span className="tnum">{result.updated}</span></li>
            <li>Übersprungen (vorhandener Kurs neuer): <span className="tnum">{result.skipped}</span></li>
            <li>Unbekannte WKN: <span className="tnum">{result.unknown}</span></li>
          </ul>
          <Link to="/positionen" className="text-sm text-accent hover:underline mt-2 inline-block">
            Zur Positionen-Übersicht →
          </Link>
        </Card>
      )}
    </div>
  );
}
