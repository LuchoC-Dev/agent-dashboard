import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "./Popover";
import { Swatch } from "./Swatch";

export type LegendEntry = {
  key: string;
  label: ReactNode;
  color: string;
  /** Plain-text name, for the item's title. */
  title?: string;
  /** Shown as pressed: it is the active filter. */
  pressed?: boolean;
  /** Not a filter (a folded "Resto"): plain text even with `onItem`. */
  inert?: boolean;
};

const GAP = 14; // gap-x-3.5
const item =
  "inline-flex h-[18px] max-w-[260px] min-w-0 items-center gap-1.5 whitespace-nowrap rounded-xs";
const action =
  " cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-inherit hover:text-ink aria-pressed:font-semibold aria-pressed:text-ink";

/**
 * A chart legend that never takes more than two lines: what does not fit becomes a "+N más"
 * button that lists the rest in a popover. The space is reserved even when the legend is
 * empty, so switching series never resizes the chart's box. With `onItem` every entry but
 * the `inert` ones is a button (a cross-filter).
 */
export function OverflowLegend({
  items,
  onItem,
}: {
  items: LegendEntry[];
  onItem?: (key: string) => void;
}) {
  const probe = useRef<HTMLDivElement>(null),
    [fit, setFit] = useState(items.length);
  // Lay every item out in an invisible copy, then keep those on the first two lines, minus
  // as many as needed for the "+N más" button to fit at the end of the second one.
  useLayoutEffect(() => {
    const box = probe.current;
    if (!box) return;
    const measure = () => {
      const els = [...box.children] as HTMLElement[],
        more = els.pop()!,
        lines = [...new Set(els.map((e) => e.offsetTop))].sort((a, b) => a - b);
      if (lines.length <= 2) return setFit(els.length);
      let n = els.filter((e) => e.offsetTop <= lines[1]).length;
      while (n > 0) {
        const last = els[n - 1],
          right = last.offsetTop === lines[1] ? last.offsetLeft + last.offsetWidth : 0;
        if (right + GAP + more.offsetWidth <= box.clientWidth) break;
        n--;
      }
      setFit(n);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [items]);
  const entry = (s: LegendEntry, inMenu = false) =>
    onItem && !s.inert ? (
      <button
        key={s.key}
        type="button"
        className={item + action + (inMenu ? " w-full px-1.5 py-1 h-auto" : "")}
        title={s.title}
        aria-pressed={!!s.pressed}
        onClick={() => onItem(s.key)}
      >
        <Swatch color={s.color} />
        <span className="min-w-0 truncate">{s.label}</span>
      </button>
    ) : (
      <span
        key={s.key}
        className={item + (inMenu ? " px-1.5 py-1 h-auto" : "")}
        title={s.title}
      >
        <Swatch color={s.color} />
        <span className="min-w-0 truncate">{s.label}</span>
      </span>
    );
  const hidden = items.slice(fit);
  return (
    <div className="relative h-10 text-size-xs text-ink-2 tabular-nums">
      <div
        ref={probe}
        className="invisible absolute inset-x-0 top-0 flex flex-wrap gap-x-3.5 gap-y-1"
        aria-hidden="true"
      >
        {items.map((s) => (
          <span key={s.key} className={item}>
            <Swatch color={s.color} />
            <span className="min-w-0 truncate">{s.label}</span>
          </span>
        ))}
        <span className={item + " font-medium"}>+{items.length} más</span>
      </div>
      <div className="flex flex-wrap gap-x-3.5 gap-y-1">
        {items.slice(0, fit).map((s) => entry(s))}
        {hidden.length > 0 && (
          <Popover
            label={`+${hidden.length} más`}
            title="Más series"
            buttonClassName={item + action + " font-medium text-accent"}
          >
            {() => hidden.map((s) => entry(s, true))}
          </Popover>
        )}
      </div>
    </div>
  );
}
