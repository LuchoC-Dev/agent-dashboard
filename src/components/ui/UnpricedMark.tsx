import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { int } from "../../lib/format";
import { tooltip } from "./ChartTooltip";

/**
 * Flags a cost that excludes tokens of models with no known price (decision D2): the mark
 * alone, the explanation in a tooltip on hover or focus. Screen readers get it as the mark's
 * label. Inside a button or link the mark is not a tab stop: focusing that control shows it.
 * The tooltip is portaled with fixed coordinates so table scrollers never clip it.
 */
export function UnpricedMark({ tokens }: { tokens: number | undefined }) {
  const ref = useRef<HTMLSpanElement>(null),
    id = useId(),
    [nested, setNested] = useState(false),
    [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const mark = ref.current;
    if (!mark) return;
    const control = mark.parentElement?.closest<HTMLElement>("button, a");
    setNested(!!control);
    const show = () => {
        const r = mark.getBoundingClientRect();
        setAt({ x: r.left + r.width / 2, y: r.bottom });
      },
      hide = () => setAt(null);
    // A control may hold several marks (a KPI tile: total and per provider). Keyboard focus on
    // the control opens only its first mark; a click focuses the control too, but the pointer
    // already opened the mark under it, so it must not open the others.
    let pointer = false;
    const press = () => (pointer = true),
      focusControl = () => {
        if (!pointer && control?.querySelector("[data-unpriced]") === mark) show();
        pointer = false;
      };
    mark.addEventListener("focus", show);
    mark.addEventListener("blur", hide);
    mark.addEventListener("mouseenter", show);
    mark.addEventListener("mouseleave", hide);
    control?.addEventListener("pointerdown", press);
    control?.addEventListener("focus", focusControl);
    control?.addEventListener("blur", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      mark.removeEventListener("focus", show);
      mark.removeEventListener("blur", hide);
      mark.removeEventListener("mouseenter", show);
      mark.removeEventListener("mouseleave", hide);
      control?.removeEventListener("pointerdown", press);
      control?.removeEventListener("focus", focusControl);
      control?.removeEventListener("blur", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [tokens]);
  if (!tokens) return null;
  const text = `Incluye ${int(tokens)} tokens sin precio: el costo no los cuenta`;
  return (
    <>
      <span
        ref={ref}
        data-unpriced
        className="ml-1 inline-block cursor-help align-baseline text-size-xs leading-none font-semibold text-warn focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-accent"
        role="img"
        aria-label={text}
        aria-describedby={at ? id : undefined}
        tabIndex={nested ? undefined : 0}
      >
        *
      </span>
      {at &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className={
              tooltip +
              " pointer-events-none fixed z-50 block max-w-[min(260px,calc(100vw-16px))] -translate-x-1/2 font-normal text-ink-2 normal-case"
            }
            style={{
              left: Math.min(Math.max(at.x, 138), window.innerWidth - 138),
              top: at.y + 6,
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}

/** A cost followed by the unpriced mark when it applies. */
export function CostWithMark({
  text,
  tokens,
}: {
  text: string;
  tokens: number | undefined;
}) {
  return (
    <>
      {text}
      <UnpricedMark tokens={tokens} />
    </>
  );
}
