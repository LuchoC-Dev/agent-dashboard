import { Rectangle, type BarShapeProps } from "recharts";
import type { TrendRow, TrendSeries } from "../daily-trend";

/** The data key of each day's stacked total: the one Recharts bar the chart draws. */
export const SUM_KEY = "_sum";

/** The rows with their stacked total under `SUM_KEY`, for the single bar and the Y domain. */
export const withSums = (data: TrendRow[], series: TrendSeries[]) =>
  data.map((r) => ({ ...r, [SUM_KEY]: series.reduce((n, s) => n + Number(r[s.key] || 0), 0) }));

const segClass = "seg transition-opacity duration-150 ease-out motion-reduce:transition-none";

/**
 * One day's whole stack, drawn as plain SVG inside the shape of a single Recharts bar (the
 * day's total). Recharts then lays out one series instead of one per project, model or
 * kind, so a grouping with dozens of series costs about what a single one does. Segments
 * stack bottom → top in series order, split the bar's height by their value, carry their
 * series (`k-…`) and day (`d-…`) classes for the hover and day-filter rules, and skip empty
 * values (no rectangle).
 */
export function DayStack({
  props,
  series,
  onEnter,
  onSelect,
  clickable,
}: {
  props: BarShapeProps;
  series: TrendSeries[];
  onEnter: (key: string, index: number) => void;
  onSelect: (s: TrendSeries, index: number) => void;
  clickable: (s: TrendSeries) => boolean;
}) {
  const { x, y, width, height, index, payload } = props,
    total = Number(payload?.[SUM_KEY] || 0);
  if (!(total > 0) || !(height > 0)) return null;
  const drawn = series.filter((s) => Number(payload[s.key] || 0) > 0),
    top = drawn[drawn.length - 1];
  let bottom = y + height;
  return (
    <g>
      {drawn.map((s) => {
        const h = (height * Number(payload[s.key])) / total;
        bottom -= h;
        const common = {
          className: `${segClass} k-${s.key} d-${index}${clickable(s) ? " cursor-pointer" : ""}`,
          fill: s.color,
          stroke: "var(--color-surface)",
          strokeWidth: 2,
          onMouseEnter: () => onEnter(s.key, index),
          onClick: () => onSelect(s, index),
        };
        return s === top ? (
          <Rectangle key={s.key} {...common} x={x} y={bottom} width={width} height={h} radius={[2, 2, 0, 0]} />
        ) : (
          <rect key={s.key} {...common} x={x} y={bottom} width={width} height={h} />
        );
      })}
    </g>
  );
}
