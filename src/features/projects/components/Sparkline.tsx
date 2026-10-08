import { useId, useState } from "react";
import type { DateRange } from "../../../bindings/DateRange";
import type { SessionSummary } from "../../../bindings/SessionSummary";
import { tooltip } from "../../../components/ui/ChartTooltip";
import { dayLabel, usd } from "../../../lib/format";
import { sparkDays } from "../project-rows";

/**
 * Cost per day across the range, as tiny bars. Hover or focus shows the days with activity
 * only (sorted by date, scrolling past a fixed height), never every day of the range. The
 * tooltip is `fixed` so the table's scroll box cannot clip it.
 */
export function Sparkline({
  sessions,
  range,
}: {
  sessions: SessionSummary[];
  range: DateRange;
}) {
  const { dates, values, active } = sparkDays(sessions, range),
    max = Math.max(...values, 1),
    id = useId(),
    [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const open = (e: { currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt({ left: Math.min(r.left, innerWidth - 220), top: r.bottom });
  };
  return (
    <span
      className="inline-block align-middle"
      tabIndex={active.length ? 0 : undefined}
      aria-describedby={at ? id : undefined}
      onMouseEnter={active.length ? open : undefined}
      onFocus={active.length ? open : undefined}
      onMouseLeave={() => setAt(null)}
      onBlur={() => setAt(null)}
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        className="block"
        width="120"
        height="22"
        viewBox="0 0 120 22"
        role="img"
        aria-label={`Costo por día · ${active.length} días con actividad`}
      >
        {values.map((v, i) => (
          <rect
            key={dates[i]}
            x={(i * 120) / (values.length || 1)}
            y={21 - (20 * v) / max}
            width={Math.max(1, 120 / (values.length || 1) - 2)}
            height={Math.max(1, (20 * v) / max)}
            rx="1"
            className="fill-primary"
          />
        ))}
      </svg>
      {at && (
        <div
          id={id}
          role="tooltip"
          data-testid="sparkline-tooltip"
          className={tooltip + " fixed z-40 max-h-[180px] overflow-auto tabular-nums"}
          style={{ left: at.left, top: at.top }}
        >
          <div className="mb-1 text-ink-3">{active.length} días con actividad</div>
          {active.map(([d, v]) => (
            <div key={d} className="flex justify-between gap-4">
              <span>{dayLabel(d)}</span>
              <b>{usd(v)}</b>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}
