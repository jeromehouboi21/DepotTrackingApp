import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { logger } from "../../lib/logger";
import { useData } from "../../hooks/useData";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { OwnerSelect } from "../../components/owner/OwnerSelect";
import { fmtDateTime } from "../../lib/format";

const FILES = [
  { key: "transactions", label: "transactions.json", hint: "Kanonische Faktenbasis (~907 Einträge)" },
  { key: "portfolio", label: "portfolio.json", hint: "Parser-Positionen (Seed/Gegenprobe)" },
  { key: "securities", label: "securities.json", hint: "WKN↔ISIN-Stammdaten" },
  { key: "warnings", label: "warnings.json", hint: "Lauf-Report & Sonderfälle" },
];

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function upsertBatched(table, rows, onConflict) {
  for (const part of chunk(rows, 500)) {
    const { error } = await supabase.from(table).upsert(part, onConflict ? { onConflict } : undefined);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

// §13: Default-Standort je gehaltener ISIN aus der Uebertrags-Kette herleiten.
function deriveCustodyDefaults(transactions, heldIsins) {
  const byIsin = new Map();
  for (const t of transactions) {
    if (!t.isin) continue;
    (byIsin.get(t.isin) ?? byIsin.set(t.isin, []).get(t.isin)).push(t);
  }
  const result = [];
  for (const isin of heldIsins) {
    const txs = (byIsin.get(isin) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const transfersIn = txs.filter((t) => t.type === "TRANSFER_IN");
    const transfersOut = txs.filter((t) => t.type === "TRANSFER_OUT");
    let brokerId = null;
    let note = null;

    if (transfersIn.length || transfersOut.length) {
      const lastIn = transfersIn[transfersIn.length - 1];
      const lastOut = transfersOut[transfersOut.length - 1];
      if (lastIn && (!lastOut || lastIn.date >= lastOut.date)) {
        brokerId = lastIn.source; // letzter Eingang gewinnt
      } else if (lastOut) {
        // Abgang ohne spaeteren Eingang: liegt vermutlich noch beim Gegenbroker
        brokerId = lastOut.source === "scalable" ? "comdirect" : "scalable";
        note = "bitte prüfen (aus Übertrags-Abgang hergeleitet)";
      }
    }
    if (!brokerId) {
      const lastBuy = [...txs].reverse().find((t) => t.type === "BUY");
      brokerId = lastBuy?.source ?? "comdirect";
      if (!lastBuy) note = "bitte prüfen (kein Kauf gefunden)";
    }
    result.push({ isin, broker_id: brokerId, note });
  }
  return result;
}

/** Mapping-Pruef-Tabelle (§9.4): Symbol-Aufloesung anstossen + Status je Security. */
function MappingCard() {
  const { portfolio } = useData();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const secs = portfolio.raw?.securities ?? [];
  const heldIsins = new Set(
    (portfolio.result?.positions ?? []).filter((p) => p.sharesHeld > 1e-9).map((p) => p.isin),
  );
  const relevant = secs.filter((s) => heldIsins.has(s.isin));
  const byStatus = relevant.reduce((acc, s) => {
    const k = s.mapping_status ?? "unresolved";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const run = async (force) => {
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("resolve-symbols", {
        body: { force, isins: [...heldIsins] },
      });
      if (error) throw error;
      setMsg(
        `Aufgelöst: ${data?.summary?.verified ?? 0} verified · ${data?.summary?.needs_review ?? 0} needs_review · ${data?.summary?.unresolved ?? 0} unresolved`,
      );
      portfolio.refresh();
    } catch (e) {
      setMsg(`Fehler: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  if (!relevant.length) return null;

  return (
    <Card
      title="Kurs-Mapping (ISIN → marketstack-Ticker)"
      action={
        <div className="flex items-center gap-2">
          {msg && <span className="text-xs text-ink-2">{msg}</span>}
          <Button variant="secondary" onClick={() => run(false)} disabled={busy}>
            {busy ? "Löse auf…" : "Symbole auflösen"}
          </Button>
        </div>
      }
    >
      <div className="text-sm text-ink-2 mb-2">
        {Object.entries(byStatus).map(([k, n]) => `${n}× ${k}`).join(" · ")}
      </div>
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="text-xs w-full">
          <thead>
            <tr className="bg-surface-2 text-ink-2">
              <th className="text-left px-2 py-1 font-medium">Wertpapier</th>
              <th className="text-left px-2 py-1 font-medium">ISIN</th>
              <th className="text-left px-2 py-1 font-medium">Symbol</th>
              <th className="text-left px-2 py-1 font-medium">Börse</th>
              <th className="text-left px-2 py-1 font-medium">Währung</th>
              <th className="text-left px-2 py-1 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {relevant.map((s) => (
              <tr key={s.isin} className="border-b border-surface-2">
                <td className="px-2 py-1">{s.display_name ?? s.name ?? "–"}</td>
                <td className="px-2 py-1 tnum">{s.isin}</td>
                <td className="px-2 py-1">{s.price_symbol ?? "–"}</td>
                <td className="px-2 py-1">{s.price_mic ?? "–"}</td>
                <td className="px-2 py-1">{s.price_currency ?? "–"}</td>
                <td className="px-2 py-1">
                  <span
                    className={
                      s.mapping_status === "verified"
                        ? "text-gain"
                        : s.mapping_status === "needs_review"
                          ? "text-warn"
                          : "text-ink-3"
                    }
                  >
                    {s.mapping_status ?? "unresolved"}
                    {s.mapping_confidence != null && ` (${s.mapping_confidence}/5)`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-3 mt-2">
        Für <code>unresolved</code>-Titel auf der Wertpapier-Detailseite einen manuellen Kurs setzen.
      </p>
    </Card>
  );
}

export function ImportScreen({ user }) {
  // `custody` ist das useCustody()-Hook-OBJEKT (brokers, custodyByIsin, refresh, ...);
  // die holding_custody-Zeilen liegen als Array unter `custody.custody`.
  const { refreshAll, custody, owners } = useData();
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [runs, setRuns] = useState([]);
  // E9: welchem Inhaber dieser Upload gehört (1b) - Default: der gerade aktive
  // Inhaber, aber explizit veränderbar, damit kein Depot versehentlich dem
  // falschen Inhaber zugeordnet wird.
  const [ownerId, setOwnerId] = useState(owners.activeOwnerId);
  useEffect(() => {
    if (!ownerId && owners.activeOwnerId) setOwnerId(owners.activeOwnerId);
  }, [owners.activeOwnerId, ownerId]);
  const selectedOwner = owners.owners.find((o) => o.id === ownerId) ?? null;

  useEffect(() => {
    if (!ownerId) return;
    supabase
      .from("import_runs")
      .select("*")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setRuns(data ?? []));
  }, [report, ownerId]);

  const pick = (key) => async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      setFiles((f) => ({ ...f, [key]: { name: file.name, json } }));
      setError(null);
    } catch (err) {
      setError(`${file.name}: kein gültiges JSON (${err.message})`);
    }
  };

  const validate = () => {
    const problems = [];
    if (!ownerId) problems.push("Kein Inhaber ausgewählt");
    const tx = files.transactions?.json;
    const wf = files.warnings?.json;
    if (!Array.isArray(tx)) problems.push("transactions.json fehlt oder ist kein Array");
    if (!files.portfolio?.json?.positions) problems.push("portfolio.json fehlt oder hat keine positions");
    if (!Array.isArray(files.securities?.json)) problems.push("securities.json fehlt oder ist kein Array");
    if (!wf?.summary) problems.push("warnings.json fehlt oder hat keine summary");
    if (Array.isArray(tx) && wf?.summary && tx.some((t) => !t.id)) {
      problems.push("transactions.json: Einträge ohne id");
    }
    return problems;
  };

  const doImport = async () => {
    const problems = validate();
    if (problems.length) {
      setError(problems.join(" · "));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const uid = user.id;
      const tx = files.transactions.json;
      const pf = files.portfolio.json;
      const secs = files.securities.json;
      const wf = files.warnings.json;

      const oid = ownerId; // E9: Partitionsschluessel fuer alle rechnungsrelevanten Tabellen

      // 1. import_run
      const { data: run, error: runErr } = await supabase
        .from("import_runs")
        .insert({
          user_id: uid,
          owner_id: oid,
          generated_at: pf.generated_at ?? null,
          summary: wf.summary,
          counts: { transactions: tx.length, securities: secs.length, warnings: wf.issues?.length ?? 0 },
        })
        .select()
        .single();
      if (runErr) throw runErr;

      // 2. securities - GLOBAL (E9): kein owner_id, gleiche ISIN = gleiches Wertpapier
      // fuer alle Inhaber. App-verwaltete Spalten (display_name, is_savings_plan,
      // object_type, mapping_*, ...) werden hier bewusst NICHT mitgeschrieben.
      await upsertBatched(
        "securities",
        secs.map((s) => ({
          user_id: uid,
          isin: s.isin,
          wkn: s.wkn ?? null,
          name: s.name ?? null,
          verwahrart: s.verwahrart ?? null,
          currency: s.currency ?? "EUR",
        })),
        "user_id,isin",
      );

      // 3. transactions (roh, ueberschreibt bei gleicher ID) - je Inhaber partitioniert;
      // zwei Inhaber koennen denselben comdirect-doc_hash tragen, ohne zu kollidieren.
      await upsertBatched(
        "transactions",
        tx.map((t) => ({ user_id: uid, owner_id: oid, ...t })),
        "user_id,owner_id,id",
      );

      // 4. portfolio_seed
      await upsertBatched(
        "portfolio_seed",
        pf.positions.map((p) => ({
          user_id: uid,
          owner_id: oid,
          isin: p.isin,
          data: p,
          generated_at: pf.generated_at ?? null,
        })),
        "user_id,owner_id,isin",
      );

      // 5. warnings - Status bestehender Warnungen bleibt erhalten
      const warnRows = (wf.issues ?? []).map((w) => ({
        user_id: uid,
        owner_id: oid,
        code: w.code,
        level: w.level ?? "warn",
        isin: w.isin ?? null,
        ref: w.ref ?? null,
        message: w.message ?? null,
        import_run_id: run.id,
      }));
      for (const part of chunk(warnRows, 500)) {
        const { error } = await supabase
          .from("warnings")
          .upsert(part, { onConflict: "user_id,owner_id,code,isin,ref", ignoreDuplicates: true });
        if (error) throw new Error(`warnings: ${error.message}`);
      }

      // 6. Broker-Seed (GLOBAL, E9) + Custody-Defaults je Inhaber (nur fuer ISINs
      // ohne bestehende Zuordnung DIESES Inhabers, §13)
      await supabase.from("brokers").upsert(
        [
          { user_id: uid, id: "comdirect", name: "comdirect", color: "#005EA8", active: true, sort_order: 1 },
          { user_id: uid, id: "scalable", name: "Scalable Capital", color: "#1A1A2E", active: true, sort_order: 2 },
        ],
        { onConflict: "user_id,id", ignoreDuplicates: true },
      );
      const heldIsins = pf.positions.filter((p) => p.shares_held > 1e-9).map((p) => p.isin);
      const existing = new Set((custody.custody ?? []).map((c) => c.isin));
      const defaults = deriveCustodyDefaults(tx, heldIsins).filter((d) => !existing.has(d.isin));
      if (defaults.length) {
        await upsertBatched(
          "holding_custody",
          defaults.map((d) => ({
            user_id: uid,
            owner_id: oid,
            isin: d.isin,
            broker_id: d.broker_id,
            status: "settled",
            note: d.note,
          })),
          "user_id,owner_id,isin,broker_id",
        );
      }

      setReport({
        transactions: tx.length,
        securities: secs.length,
        seed: pf.positions.length,
        warnings: warnRows.length,
        custodyDefaults: defaults.length,
        summary: wf.summary,
      });
      logger.info("Import abgeschlossen", { transactions: tx.length });
      refreshAll();
    } catch (e) {
      setError(e.message);
      logger.error("Import fehlgeschlagen", { message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl">Import</h1>
      <p className="text-sm text-ink-2 max-w-2xl">
        Die vier JSON-Dateien aus dem Depot-Parser (<code>depot-parser/output/</code>) auswählen und
        importieren. Re-Import ist idempotent; Korrekturen und Warnungs-Status bleiben erhalten.
      </p>

      <Card title="Inhaber dieses Depots">
        <p className="text-xs text-ink-3 mb-2">
          Jede Zeile dieses Uploads wird diesem Inhaber zugeordnet – Rechnung (FIFO, Kostenbasis,
          G/V) läuft danach vollständig getrennt von anderen Inhabern. Der Parser kennt den
          Inhaber nicht; die Zuordnung passiert ausschließlich hier.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <OwnerSelect
            owners={owners.owners}
            value={ownerId}
            onChange={setOwnerId}
            onCreateOwner={(slug, name) => owners.createOwner(user.id, slug, name)}
          />
          {selectedOwner && <Badge variant="accent">Aktiv: {selectedOwner.name}</Badge>}
        </div>
      </Card>

      <Card>
        <div className="grid md:grid-cols-2 gap-3">
          {FILES.map((f) => (
            <label
              key={f.key}
              className={`block rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
                files[f.key] ? "border-accent bg-[#f2f7f5]" : "border-surface-2 hover:border-ink-3"
              }`}
            >
              <input type="file" accept=".json" className="hidden" onChange={pick(f.key)} />
              <div className="font-medium text-sm">{f.label}</div>
              <div className="text-xs text-ink-3">{f.hint}</div>
              {files[f.key] && (
                <div className="text-xs text-accent mt-1">
                  ✓ {files[f.key].name}
                  {f.key === "transactions" && ` – ${files[f.key].json.length} Einträge`}
                  {f.key === "securities" && ` – ${files[f.key].json.length} Einträge`}
                  {f.key === "warnings" && ` – ${files[f.key].json.issues?.length ?? 0} Issues`}
                  {f.key === "portfolio" && ` – ${files[f.key].json.positions?.length ?? 0} Positionen`}
                </div>
              )}
            </label>
          ))}
        </div>
        {error && <div className="text-sm text-loss mt-3">{error}</div>}
        <div className="mt-4">
          <Button onClick={doImport} disabled={busy || !ownerId || Object.keys(files).length < 4}>
            {busy ? "Importiere…" : "Importieren"}
          </Button>
        </div>
      </Card>

      {report && (
        <Card title="Import-Ergebnis">
          <ul className="text-sm space-y-1">
            <li>Transaktionen: <span className="tnum">{report.transactions}</span></li>
            <li>Wertpapiere: <span className="tnum">{report.securities}</span></li>
            <li>Seed-Positionen: <span className="tnum">{report.seed}</span></li>
            <li>Warnungen: <span className="tnum">{report.warnings}</span></li>
            <li>Broker-Standort-Defaults gesetzt: <span className="tnum">{report.custodyDefaults}</span></li>
          </ul>
        </Card>
      )}

      <MappingCard />

      <Card title="Letzte Import-Läufe">
        {runs.length === 0 ? (
          <div className="text-sm text-ink-3">Noch keine Importe.</div>
        ) : (
          <ul className="text-sm space-y-1">
            {runs.map((r) => (
              <li key={r.id} className="flex gap-4">
                <span className="text-ink-3 tnum">{fmtDateTime(r.created_at)}</span>
                <span>
                  {r.counts?.transactions ?? "?"} Transaktionen · {r.counts?.warnings ?? "?"} Warnungen
                  {r.generated_at && ` · Parser-Lauf ${fmtDateTime(r.generated_at)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
