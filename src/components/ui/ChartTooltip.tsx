import { Swatch } from "./Swatch";
import { errorText, note } from "./styles";

export const tooltip =
  "min-w-[180px] rounded-md border border-line bg-raised px-3 py-2.5 text-size-xs shadow-(--shadow-pop)";

/**
 * Recharts tooltip content: total, non-zero series and an optional hint. With `highlight`
 * (the hovered segment's data key) that series comes first and stands out.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  format,
  footer,
  countForLabel,
  labelFormat = (l) => String(l),
  highlight,
}: {
  active?: boolean;
  payload?: readonly {
    name?: string;
    dataKey?: unknown;
    value?: number | string;
    fill?: string;
    /** A short aside after the name (e.g. a series' errors), in the error color. */
    note?: string;
  }[];
  label?: string | number;
  format: (n: number) => string;
  footer?: string;
  countForLabel?: (label: string | number) => number;
  labelFormat?: (label: string | number) => string;
  highlight?: string;
}) {
  if (!active || !payload?.length) return null;
  const lit = (p: (typeof payload)[number]) => highlight !== undefined && p.dataKey === highlight;
  const rows = payload
    .filter((p) => Number(p.value) > 0)
    .sort((a, b) => Number(lit(b)) - Number(lit(a)));
  return (
    <div className={tooltip}>
      <div className="text-ink-3">{label === undefined ? "" : labelFormat(label)}</div>
      <strong className="mt-[3px] mb-1.5 block text-size-lg">
        {format(payload.reduce((n, p) => n + Number(p.value || 0), 0))}
      </strong>
      {rows.map((p) => (
        <div
          key={p.name}
          className={
            "-mx-1.5 flex items-center gap-2 rounded-xs px-1.5" +
            (lit(p) ? " bg-sunken font-semibold text-ink" : highlight ? " text-ink-2" : "")
          }
        >
          <Swatch color={p.fill || "var(--color-primary)"} />
          <span className="max-w-[220px] truncate">{p.name}</span>
          {p.note && <span className={errorText}>{p.note}</span>}
          <b className="ml-auto pl-3">{format(Number(p.value))}</b>
        </div>
      ))}
      {footer && (
        <p className={"mt-2 " + note}>
          {countForLabel && label !== undefined
            ? `${countForLabel(label)} sesiones · `
            : ""}
          {footer}
        </p>
      )}
    </div>
  );
}
