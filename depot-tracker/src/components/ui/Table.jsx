import { useMemo, useState } from "react";

/**
 * Sortierbare, kompakte Datentabelle.
 * columns: [{ key, label, align?: 'right', sortValue?: (row)=>any, render?: (row)=>node, className? }]
 * footer: optionale Zeile (array von nodes, gleiche Reihenfolge wie columns)
 */
export function Table({ columns, rows, rowKey, defaultSort, footer, onRowClick, emptyText = "Keine Daten" }) {
  const [sort, setSort] = useState(defaultSort ?? null); // {key, dir}

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sortValue ?? ((r) => r[sort.key]);
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? (va ?? 0) - (vb ?? 0)
          : String(va ?? "").localeCompare(String(vb ?? ""), "de");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const toggle = (key) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-2 text-ink-2 text-xs">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={() => toggle(c.key)}
                className={`px-2 py-1.5 font-medium cursor-pointer select-none whitespace-nowrap ${c.align === "right" ? "text-right" : "text-left"}`}
              >
                {c.label}
                {sort?.key === c.key && <span className="ml-0.5">{sort.dir === "asc" ? "↑" : "↓"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-2 py-6 text-center text-ink-3">
                {emptyText}
              </td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-surface-2 hover:bg-surface-2/50 ${onRowClick ? "cursor-pointer" : ""}`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-2 py-1.5 ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="font-medium bg-surface-2/60">
              {footer.map((node, i) => (
                <td key={i} className={`px-2 py-1.5 ${columns[i]?.align === "right" ? "text-right" : ""}`}>
                  {node}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
