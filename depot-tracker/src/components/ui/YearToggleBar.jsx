/**
 * Gemeinsame Jahres-Toggle-Leiste (genutzt in /realisiert und /dashboard).
 * Beliebig viele Jahre gleichzeitig aktivierbar statt Single-Select.
 *
 * props:
 *   availableYears: string[]        - nur Jahre mit Verkaeufen (keine toten Chips)
 *   selectedYears:  Set<string>     - aktuell aktive Jahre
 *   onToggle(year), onSelectAll(), onClear()
 *   countFor?(year): number         - optionale Anzahl (z.B. Verkaeufe) als kleine Zahl im Chip
 */
export function YearToggleBar({ availableYears, selectedYears, onToggle, onSelectAll, onClear, countFor }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        onClick={onSelectAll}
        className="rounded-full px-3 py-1 text-sm bg-surface-2 text-ink-2 hover:text-ink"
      >
        Alle
      </button>
      <button
        onClick={onClear}
        className="rounded-full px-3 py-1 text-sm bg-surface-2 text-ink-2 hover:text-ink"
      >
        Keine
      </button>
      <span className="mx-1 text-ink-3">·</span>
      {availableYears.map((y) => {
        const active = selectedYears.has(y);
        const count = countFor ? countFor(y) : null;
        return (
          <button
            key={y}
            onClick={() => onToggle(y)}
            className={`rounded-full px-3 py-1 text-sm tnum ${active ? "bg-accent text-white" : "bg-surface-2 text-ink-2 hover:text-ink"}`}
            title={count != null ? `${count} Verkäufe` : undefined}
          >
            {y}
            {count != null && (
              <span className={`ml-1 text-[10px] ${active ? "text-white/70" : "text-ink-3"}`}>({count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
