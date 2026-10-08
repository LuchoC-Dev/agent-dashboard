import { useState } from "react";
import { int, pct } from "../../lib/format";
import { tooltip } from "./ChartTooltip";
import { Swatch } from "./Swatch";

export type SharePart = {
  key?: string;
  label: string;
  value: number;
  color: string;
  /** Dimmed: another part is the active filter. */
  dim?: boolean;
};

/**
 * Stacked proportion bar; the aria-label carries every value. Hovering a segment lights it
 * (it grows, the rest dims) and shows its value and share in a tooltip. With `onPart` a
 * segment click is a cross-filter or a drilldown (the legend or rows next to it offer the
 * same for the keyboard). `format` formats the values (counts by default).
 */
export function ShareBar({
  parts,
  onPart,
  format = int,
  actionHint,
}: {
  parts: SharePart[];
  onPart?: (key: string) => void;
  format?: (n: number) => string;
  /** What a click does, at the foot of the tooltip. */
  actionHint?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = parts.reduce((n, p) => n + p.value, 0),
    shown = parts.filter((p) => p.value > 0);
  // Where the hovered segment starts, as a share of the bar, to place the tooltip over it.
  const offset = (i: number) => shown.slice(0, i).reduce((n, p) => n + p.value, 0) / (total || 1);
  const lit = hover === null ? null : shown[hover];
  return (
    <div
      // Above the table that follows (its sticky header) while the tooltip is open.
      className={"relative -my-1.5 py-1.5 " + (hover === null ? "z-[1]" : "z-20")}
      aria-label={parts.map((p) => `${p.label}: ${format(p.value)}`).join(", ")}
      onMouseLeave={() => setHover(null)}
    >
      <div className="flex h-1.5 w-full items-center gap-0.5">
        {shown.map((p, i) => (
          <span
            key={p.key ?? p.label}
            className={
              "block h-full min-w-0.5 origin-center transition-[opacity,transform] duration-150 ease-out first:rounded-l-[2px] last:rounded-r-[2px] motion-reduce:transition-none" +
              (onPart && p.key ? " cursor-pointer" : "") +
              (hover === i ? " scale-y-[1.67]" : "")
            }
            style={{
              flex: p.value,
              background: p.color,
              opacity: hover !== null ? (hover === i ? 1 : 0.45) : p.dim ? 0.3 : undefined,
            }}
            onMouseEnter={() => setHover(i)}
            onClick={onPart && p.key ? () => onPart(p.key!) : undefined}
          />
        ))}
      </div>
      {lit && (
        <div
          role="tooltip"
          className={tooltip + " pointer-events-none absolute top-full mt-1 w-max max-w-[260px]"}
          style={{
            left: `clamp(0px, calc(${100 * (offset(hover!) + lit.value / (total || 1) / 2)}% - 90px), calc(100% - 180px))`,
          }}
        >
          <div className="flex items-center gap-2">
            <Swatch color={lit.color} />
            <span className="min-w-0 truncate font-semibold text-ink">{lit.label}</span>
          </div>
          <div className="mt-1 flex gap-3 text-ink-2 tabular-nums">
            <b className="font-semibold text-ink">{format(lit.value)}</b>
            <span>{pct(lit.value / (total || 1))}</span>
          </div>
          {onPart && lit.key && actionHint && <p className="mt-1.5 text-ink-3">{actionHint}</p>}
        </div>
      )}
    </div>
  );
}
