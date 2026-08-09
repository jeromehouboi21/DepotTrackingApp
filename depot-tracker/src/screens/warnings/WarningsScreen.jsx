import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../../hooks/useData";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Tabs } from "../../components/ui/Tabs";
import { EmptyState } from "../../components/ui/EmptyState";
import { CorrectionDrawer } from "../../components/warnings/CorrectionDrawer";
import { fmtDateTime } from "../../lib/format";

const CODE_LABEL = {
  FIFO_MISMATCH: "FIFO weicht von Bank ab",
  TRANSFER_UNMATCHED: "Übertrag ohne Gegenseite",
  NO_COST_BASIS: "Kostenbasis unbekannt",
  TRANSFER_SHARES_MISMATCH: "Übertrags-Mengen ungleich",
};

export function WarningsScreen({ user }) {
  const { warnings, portfolio, refreshAll } = useData();
  const [statusFilter, setStatusFilter] = useState("open");
  const [codeFilter, setCodeFilter] = useState("all");
  const [openDrawer, setOpenDrawer] = useState(null);
  const [noteDraft, setNoteDraft] = useState({});

  const list = useMemo(() => {
    let l = warnings.warnings;
    if (statusFilter !== "all") l = l.filter((w) => w.status === statusFilter);
    if (codeFilter !== "all") l = l.filter((w) => w.code === codeFilter);
    return l;
  }, [warnings.warnings, statusFilter, codeFilter]);

  const codes = [...new Set(warnings.warnings.map((w) => w.code))].sort();

  if (warnings.loading) return <div className="text-ink-3">Lade Warnungen…</div>;
  if (!warnings.warnings.length) {
    return <EmptyState title="Keine Warnungen">Nach dem Import erscheinen die Parser-Warnungen hier.</EmptyState>;
  }

  const done = (w) => async (opts) => {
    if (opts?.resolve) {
      await warnings.setStatus(w.id, "resolved", opts.note ?? "korrigiert");
    }
    setOpenDrawer(null);
    refreshAll();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Warnungen</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            options={[
              { value: "open", label: `Offen (${warnings.warnings.filter((w) => w.status === "open").length})` },
              { value: "resolved", label: "Erledigt" },
              { value: "ignored", label: "Ignoriert" },
              { value: "all", label: "Alle" },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <select
            value={codeFilter}
            onChange={(e) => setCodeFilter(e.target.value)}
            className="rounded-lg border border-surface-2 bg-surface px-2 py-1 text-sm"
          >
            <option value="all">Alle Codes</option>
            {codes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        {list.map((w) => (
          <div key={w.id} className="bg-surface rounded-xl border border-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={w.status === "open" ? "warn" : "neutral"}>{w.code}</Badge>
              <span className="text-xs text-ink-3">{CODE_LABEL[w.code]}</span>
              {w.isin && (
                <Link to={`/wertpapier/${w.isin}`} className="text-sm text-accent">
                  {w.isin}
                </Link>
              )}
              <span className="text-sm flex-1">{w.message}</span>
              {w.status === "open" ? (
                <div className="flex items-center gap-1">
                  <Button variant="secondary" onClick={() => setOpenDrawer(openDrawer === w.id ? null : w.id)}>
                    {openDrawer === w.id ? "Schließen" : "Korrigieren"}
                  </Button>
                  <Button variant="ghost" onClick={() => warnings.setStatus(w.id, "resolved", noteDraft[w.id] ?? null)}>
                    Erledigt
                  </Button>
                  <Button variant="ghost" onClick={() => warnings.setStatus(w.id, "ignored", noteDraft[w.id] ?? null)}>
                    Ignorieren
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-ink-3 flex items-center gap-2">
                  {w.status === "resolved" ? "erledigt" : "ignoriert"}
                  {w.resolved_at && ` · ${fmtDateTime(w.resolved_at)}`}
                  {w.resolution_note && ` · ${w.resolution_note}`}
                  <Button variant="ghost" onClick={() => warnings.setStatus(w.id, "open", null)}>
                    Wieder öffnen
                  </Button>
                </div>
              )}
            </div>
            {w.status === "open" && (
              <input
                value={noteDraft[w.id] ?? ""}
                onChange={(e) => setNoteDraft((n) => ({ ...n, [w.id]: e.target.value }))}
                placeholder="Notiz zur Erledigung (optional)"
                className="mt-2 rounded border border-surface-2 px-2 py-1 text-xs w-full max-w-md bg-bg"
              />
            )}
            {openDrawer === w.id && (
              <div className="mt-3 border-t border-surface-2 pt-3">
                <CorrectionDrawer
                  user={user}
                  warning={w}
                  transactions={portfolio.raw?.transactions ?? []}
                  overrides={portfolio.raw?.overrides ?? []}
                  onDone={done(w)}
                />
              </div>
            )}
          </div>
        ))}
        {list.length === 0 && <div className="text-sm text-ink-3 px-2">Keine Warnungen in dieser Ansicht.</div>}
      </div>
    </div>
  );
}
