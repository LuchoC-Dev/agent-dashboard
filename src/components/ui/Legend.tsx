import type { ReactNode } from "react";
import { Swatch } from "./Swatch";

export type LegendItem = {
  key: string;
  label: ReactNode;
  color: string;
  /** The active filter (with `onItem`). */
  pressed?: boolean;
  title?: string;
};

/**
 * Series key. `compact` tightens it for a KPI tile: items wrap onto new lines, and an item
 * wider than the tile wraps its own text, so nothing is ever clipped. With `onItem` each
 * item is a button (a cross-filter), pressed while its filter is active.
 */
export function Legend({
  items,
  compact = false,
  onItem,
}: {
  items: LegendItem[];
  compact?: boolean;
  onItem?: (key: string) => void;
}) {
  const itemClass =
    "inline-flex items-center gap-1.5" +
    (compact ? " max-w-full min-w-0" : " whitespace-nowrap");
  return (
    <div
      className={
        "flex flex-wrap text-size-xs text-ink-2 tabular-nums " +
        (compact ? "gap-x-3 gap-y-[3px]" : "gap-x-3.5 gap-y-1")
      }
    >
      {items.map((s) =>
        onItem ? (
          <button
            key={s.key}
            type="button"
            className={
              itemClass +
              " relative z-[1] -mx-1 cursor-pointer rounded-xs border-0 bg-transparent px-1 text-left font-[inherit] text-inherit hover:bg-sunken hover:text-ink aria-pressed:bg-accent-wash aria-pressed:font-semibold aria-pressed:text-ink"
            }
            aria-pressed={!!s.pressed}
            title={s.title}
            onClick={() => onItem(s.key)}
          >
            <Swatch color={s.color} />
            <span className="min-w-0">{s.label}</span>
          </button>
        ) : (
          <span key={s.key} className={itemClass} title={s.title}>
            <Swatch color={s.color} />
            <span className="min-w-0">{s.label}</span>
          </span>
        ),
      )}
    </div>
  );
}
