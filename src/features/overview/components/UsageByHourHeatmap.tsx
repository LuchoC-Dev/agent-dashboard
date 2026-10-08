import { Fragment, memo, useMemo } from "react";
import type { HourlyActivity } from "../../../bindings/HourlyActivity";
import { Panel } from "../../../components/ui/Panel";
import { TZ } from "../../../lib/dates";
import { int } from "../../../lib/format";

export const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
export const hourLabel = (h: number) => String(h).padStart(2, "0") + ":00";

// Share the same perceptual scale between cells and legend. The square root
// gives sparse hours more of the range without weakening the maximum.
function heatmapColor(ratio: number) {
  const intensity = 100 * Math.sqrt(Math.min(1, Math.max(0, ratio)));
  return `color-mix(in oklch, var(--heatmap-max) ${intensity}%, var(--heatmap-empty))`;
}

const cellBase = "h-5 rounded-[2px] border-0 p-0 transition-opacity duration-150 motion-reduce:transition-none";
const labelButton =
  "cursor-pointer rounded-xs border-0 bg-transparent p-0 text-left font-[inherit] text-inherit hover:text-ink aria-pressed:font-semibold aria-pressed:text-accent";

/**
 * Weekday × hour activity in local time, from the metrics' compact counts (Resumen and the
 * project dashboard alike).
 *
 * With handlers (`onCell`) it is a cross-filter (contract v2.3): a cell filters by its weekday
 * and hour, a weekday label by the weekday, an hour label by the hour; again to clear. The
 * filter selects messages in that slot; the grid keeps showing the whole week (the dashboard
 * passes the activity without the slot filter) with the cells outside the selection dimmed.
 * Without handlers the cells only describe themselves on hover.
 */
export const UsageByHourHeatmap = memo(function UsageByHourHeatmap({
  activity,
  weekday = null,
  hour = null,
  onCell,
  onWeekday,
  onHour,
}: {
  activity?: HourlyActivity[];
  weekday?: number | null;
  hour?: number | null;
  onCell?: (weekday: number, hour: number) => void;
  onWeekday?: (weekday: number) => void;
  onHour?: (hour: number) => void;
}) {
  const cells = useMemo(
      () =>
        activity?.map(({ messages, sessions }) => ({ messages, sessions })) ??
        Array.from({ length: 168 }, () => ({ messages: 0, sessions: 0 })),
      [activity],
    ),
    max = Math.max(...cells.map((c) => c.messages), 1);
  const peak = cells.findIndex((c) => c.messages === max),
    dayTotals = WEEKDAYS.map((_, i) =>
      cells.slice(i * 24, i * 24 + 24).reduce((n, c) => n + c.messages, 0),
    ),
    topDay = dayTotals.indexOf(Math.max(...dayTotals));
  const filtering = weekday !== null || hour !== null,
    inSelection = (w: number, h: number) =>
      (weekday === null || weekday === w) && (hour === null || hour === h);
  const label = (i: number) =>
    `${WEEKDAYS[Math.floor(i / 24)]} ${i % 24}:00 · ${int(cells[i].messages)} mensajes · ${cells[i].sessions} sesiones`;
  const action = (w: number, h: number) =>
    weekday === w && hour === h ? "Quitar el filtro de día y hora" : "Filtrar el resumen por este día y hora";
  return (
    <Panel title="Uso por hora" sub={`Mensajes registrados · Hora local · ${TZ}`}>
      <div className="grid grid-cols-[30px_repeat(24,minmax(0,1fr))] gap-0.5 text-size-2xs text-ink-3 tabular-nums">
        <span />
        {Array.from({ length: 24 }, (_, h) => {
          // Every third hour shows its number, as before; as filters every hour is a target,
          // and the others show theirs on hover, on focus and while active.
          const text = String(h).padStart(2, "0"),
            quiet = h % 3 !== 0;
          return onHour ? (
            <button
              key={h}
              type="button"
              className={
                labelButton +
                " overflow-visible whitespace-nowrap" +
                (quiet ? " opacity-0 hover:opacity-100 focus-visible:opacity-100 aria-pressed:opacity-100" : "")
              }
              aria-pressed={hour === h}
              aria-label={`Filtrar por la hora ${hourLabel(h)}`}
              title={hour === h ? "Quitar el filtro de hora" : `Filtrar el resumen por las ${hourLabel(h)}`}
              onClick={() => onHour(h)}
            >
              {text}
            </button>
          ) : (
            <span key={h} className="overflow-visible whitespace-nowrap">
              {quiet ? "" : text}
            </span>
          );
        })}
        {WEEKDAYS.map((d, w) => (
          <Fragment key={d}>
            {onWeekday ? (
              <button
                type="button"
                className={labelButton + " flex items-center"}
                aria-pressed={weekday === w}
                title={weekday === w ? "Quitar el filtro de día" : `Filtrar el resumen por los ${d}`}
                onClick={() => onWeekday(w)}
              >
                {d}
              </button>
            ) : (
              <span className="flex items-center">{d}</span>
            )}
            {cells.slice(w * 24, w * 24 + 24).map((c, h) => {
              const index = w * 24 + h,
                style = { background: heatmapColor(c.messages / max) },
                dim = filtering && !inSelection(w, h) ? " opacity-35" : "";
              return onCell ? (
                <button
                  key={h}
                  type="button"
                  className={
                    cellBase +
                    " cursor-pointer hover:outline hover:outline-offset-0 hover:outline-ink aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-ink" +
                    dim
                  }
                  aria-pressed={weekday === w && hour === h}
                  aria-label={label(index)}
                  title={`${label(index)} · ${action(w, h)}`}
                  style={style}
                  onClick={() => onCell(w, h)}
                />
              ) : (
                <span key={h} className={cellBase + dim} title={label(index)} style={style} />
              );
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-size-xs text-ink-3">
        <span>
          Hora pico{" "}
          <b className="font-medium text-ink">
            {peak < 0 ? "—" : `${WEEKDAYS[Math.floor(peak / 24)]} ${peak % 24}:00`}
          </b>
        </span>
        <span>
          Día más activo <b className="font-medium text-ink">{peak < 0 ? "—" : WEEKDAYS[topDay]}</b>
        </span>
        <span className="ml-auto inline-flex items-center gap-[3px]">
          menos{" "}
          {[0, 0.0625, 0.25, 0.5625, 1].map((n) => (
            <i
              key={n}
              className="inline-block h-2.5 w-3 rounded-[2px]"
              style={{ background: heatmapColor(n) }}
            />
          ))}{" "}
          más
        </span>
      </div>
    </Panel>
  );
});
