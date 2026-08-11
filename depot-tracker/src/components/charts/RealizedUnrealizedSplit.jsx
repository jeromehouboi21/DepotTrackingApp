import { Money } from "../ui/Money";
import { fmtPct } from "../../lib/format";

/**
 * Realisiert (gewaehlte Jahre, Flussgroesse) vs. unrealisiert (Stand heute,
 * Bestandsgroesse) nebeneinander - die zwei Zeitachsen werden nie unbeschriftet
 * vermischt (§0.1/§4). `unrealizedNow === null` heisst "keine bewerteten
 * Positionen" - wird als "–" angezeigt, nie stillschweigend als 0 angenommen.
 */
export function RealizedUnrealizedSplit({ realizedSel, unrealizedNow, yearsLabel, priceCoverage }) {
  const hasUnrealized = unrealizedNow != null;
  const unrealizedForBar = unrealizedNow ?? 0;
  const combined = hasUnrealized ? realizedSel + unrealizedNow : null;
  const total = Math.abs(realizedSel) + Math.abs(unrealizedForBar);
  const realizedPct = total > 0 ? Math.abs(realizedSel) / total : 0.5;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-ink-3">Realisiert ({yearsLabel})</div>
          <Money value={realizedSel} signed colored className="text-lg" />
        </div>
        <div>
          <div className="text-xs text-ink-3">Unrealisiert (Stand heute)</div>
          <Money value={unrealizedNow} signed={hasUnrealized} colored className="text-lg" />
        </div>
      </div>

      <div className="h-3 rounded-full overflow-hidden flex bg-surface-2">
        <div
          style={{ width: `${realizedPct * 100}%` }}
          className={realizedSel >= 0 ? "bg-gain" : "bg-loss"}
        />
        <div
          style={{ width: `${(1 - realizedPct) * 100}%` }}
          className={unrealizedForBar >= 0 ? "bg-gain" : "bg-loss"}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-ink-2">
        <span>
          Ergebnis kombiniert:{" "}
          {combined == null ? "keine bewerteten Positionen" : <Money value={combined} signed colored />}
        </span>
        {priceCoverage < 1 && (
          <span className="text-ink-3">
            Kursabdeckung {fmtPct(priceCoverage).replace("+", "")} – unrealisiert unvollständig
          </span>
        )}
      </div>
    </div>
  );
}
