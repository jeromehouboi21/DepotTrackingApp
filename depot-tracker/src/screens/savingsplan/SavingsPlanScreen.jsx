import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../../hooks/useData";
import { supabase } from "../../lib/supabase";
import { Card } from "../../components/ui/Card";
import { Money } from "../../components/ui/Money";
import { PctChange } from "../../components/ui/PctChange";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { LotTable } from "../../components/position/LotTable";
import { LotReturnBars } from "../../components/charts/LotReturnBars";
import { fmtShares } from "../../lib/format";

export function SavingsPlanScreen({ user }) {
  const { portfolio } = useData();
  const [open, setOpen] = useState({});
  const [groupYears, setGroupYears] = useState({});
  // Default: Positionen ohne Bestand ausblenden (Screen dient primaer laufenden Sparplaenen)
  const [hideZeroBalance, setHideZeroBalance] = useState(true);
  const result = portfolio.result;

  if (portfolio.loading) return <div className="text-ink-3">Lade…</div>;

  const allPlans = (result?.positions ?? []).filter((p) => p.isSavingsPlan);
  if (!allPlans.length) {
    return <EmptyState title="Keine Sparplan-Positionen erkannt">Heuristik: ≥ 5 Bruchstück-Käufe. Auf der Detailseite lässt sich das Flag manuell setzen.</EmptyState>;
  }
  const plans = allPlans.filter((p) => !hideZeroBalance || p.sharesHeld > 0);
  const hiddenCount = allPlans.length - plans.length;

  const toggleFlag = async (isin, current) => {
    // Manueller Override der E4-Heuristik
    await supabase.from("securities").update({ is_savings_plan: !current }).eq("isin", isin);
    portfolio.refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl">Sparplan</h1>
        <label className="text-sm text-ink-2 flex items-center gap-1">
          <input
            type="checkbox"
            checked={hideZeroBalance}
            onChange={(e) => setHideZeroBalance(e.target.checked)}
          />
          Nur mit Bestand
        </label>
      </div>
      <p className="text-sm text-ink-2 max-w-2xl">
        Jeder Sparplan-Kauf mit individuellem Wertzuwachs (Anforderung 3). Ohne Live-Kurs bleiben
        die Zuwachs-Spalten leer.
      </p>
      {hiddenCount > 0 && (
        <p className="text-xs text-ink-3">
          {hiddenCount} Position{hiddenCount === 1 ? "" : "en"} ohne Bestand ausgeblendet ·{" "}
          <button className="text-accent" onClick={() => setHideZeroBalance(false)}>
            Alle anzeigen
          </button>
        </p>
      )}
      {!plans.length && (
        <EmptyState title="Alle Sparplan-Positionen sind ausgeblendet">
          <button className="text-accent" onClick={() => setHideZeroBalance(false)}>
            Alle anzeigen
          </button>
        </EmptyState>
      )}

      {plans.map((p) => {
        const isOpen = open[p.isin] ?? false;
        const lotsWithPrice = p.openLots.filter((l) => l.unrealizedPl != null);
        return (
          <Card
            key={p.isin}
            title={
              <span className="flex items-center gap-2 flex-wrap">
                <Link to={`/wertpapier/${p.isin}`} className="text-ink hover:text-accent font-medium">
                  {p.name ?? p.isin}
                </Link>
                <Badge variant="accent">{p.openLots.length} offene Lots</Badge>
                {p.currentPrice == null && p.sharesHeld > 0 && <Badge variant="warn">Kurs fehlt</Badge>}
              </span>
            }
            action={
              <div className="flex items-center gap-3 text-sm">
                <span className="text-ink-2">Bestand <span className="tnum">{fmtShares(p.sharesHeld)}</span></span>
                <Money value={p.marketValue} />
                <span className="flex items-center gap-1">
                  <Money value={p.unrealizedPl} signed colored />
                  <PctChange value={p.unrealizedPct} />
                </span>
                <button className="text-accent text-xs" onClick={() => setOpen((o) => ({ ...o, [p.isin]: !isOpen }))}>
                  {isOpen ? "Einklappen" : "Lots anzeigen"}
                </button>
                <button className="text-ink-3 text-xs" onClick={() => toggleFlag(p.isin, true)}>
                  kein Sparplan
                </button>
              </div>
            }
          >
            {lotsWithPrice.length > 0 && (
              <div className="mb-2">
                <div className="flex justify-end">
                  <label className="text-xs text-ink-2 flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={groupYears[p.isin] ?? p.openLots.length > 40}
                      onChange={(e) => setGroupYears((g) => ({ ...g, [p.isin]: e.target.checked }))}
                    />
                    nach Jahr gruppieren
                  </label>
                </div>
                <LotReturnBars lots={lotsWithPrice} groupByYear={groupYears[p.isin] ?? p.openLots.length > 40} />
              </div>
            )}
            {isOpen && <LotTable lots={p.openLots} />}
          </Card>
        );
      })}
    </div>
  );
}
