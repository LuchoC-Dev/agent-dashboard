import { useState, type ReactNode } from "react";
import { int } from "../../lib/format";
import { Pagination } from "./Pagination";
import { num } from "./styles";

export type Column<T> = {
  key: string;
  label: string;
  value: (r: T) => string | number;
  render?: (r: T) => ReactNode;
  numeric?: boolean;
  className?: string;
};

/** Sortable, paginated table. Numeric columns sort descending first. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  defaultSort,
  onRow,
  empty,
  pageSize = 50,
  selected,
  rowTitle,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (r: T) => string;
  defaultSort?: string;
  onRow?: (r: T) => void;
  /** Marks the row of an active filter. */
  selected?: (r: T) => boolean;
  /** What a click on the row does, as its tooltip. */
  rowTitle?: (r: T) => string;
  empty?: ReactNode;
  pageSize?: number;
}) {
  const [sort, setSort] = useState({
    key: defaultSort || columns[0].key,
    desc: !!defaultSort || !!columns[0].numeric,
  });
  const [page, setPage] = useState(0);
  const col = columns.find((c) => c.key === sort.key) || columns[0];
  const sorted = [...rows].sort((a, b) => {
    const x = col.value(a),
      y = col.value(b);
    return (
      (typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), "es")) * (sort.desc ? -1 : 1)
    );
  });
  const pages = Math.ceil(rows.length / pageSize),
    current = Math.min(page, Math.max(0, pages - 1));
  const cellClass = (c: Column<T>) =>
    (c.numeric ? num + " " : "") + (c.className || "");
  return (
    <>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cellClass(c)}
                  aria-sort={
                    sort.key === c.key
                      ? sort.desc
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <button
                    onClick={() => {
                      setSort({
                        key: c.key,
                        desc: sort.key === c.key ? !sort.desc : !!c.numeric,
                      });
                      setPage(0);
                    }}
                  >
                    {c.label}
                    <span className="arrow">
                      {sort.key === c.key ? (sort.desc ? "▼" : "▲") : ""}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted
              .slice(current * pageSize, (current + 1) * pageSize)
              .map((r) => (
                <tr
                  key={rowKey(r)}
                  className={onRow ? "link" : ""}
                  data-selected={selected?.(r) || undefined}
                  // A clickable row is reachable and activatable from the keyboard too.
                  tabIndex={onRow ? 0 : undefined}
                  title={onRow ? rowTitle?.(r) : undefined}
                  onClick={() => onRow?.(r)}
                  onKeyDown={(e) => {
                    if (!onRow || e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onRow(r);
                    }
                  }}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cellClass(c)}>
                      {c.render ? c.render(r) : c.value(r)}
                    </td>
                  ))}
                </tr>
              ))}
            {!rows.length && (
              <tr className="empty-row">
                <td colSpan={columns.length}>
                  {empty || "No hay datos en este rango."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <Pagination
          label={
            <>
              {current + 1} de {pages} · {int(rows.length)} filas
            </>
          }
          hasPrevious={current > 0}
          hasNext={current < pages - 1}
          onPrevious={() => setPage(current - 1)}
          onNext={() => setPage(current + 1)}
        />
      )}
    </>
  );
}
