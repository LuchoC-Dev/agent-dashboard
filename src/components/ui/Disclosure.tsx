import type { ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * A row header that expands or collapses the rows below it: a real button (Enter/Space,
 * `aria-expanded`), with a chevron that turns when open.
 */
export function Disclosure({
  open,
  onToggle,
  controls,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** Id of the element (or first row) it shows and hides. */
  controls?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-left font-[inherit] text-inherit focus-visible:rounded-xs"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      <Icon
        name="chevron"
        className={
          "size-3.5 text-ink-3 transition-transform duration-150 motion-reduce:transition-none" +
          (open ? " rotate-90" : "")
        }
      />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}
