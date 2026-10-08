import { useEffect, useState, type ReactNode } from "react";
import { Chevron } from "./blocks";

/**
 * Messages of a discarded branch (a Codex rollback): part of the history and of the
 * totals (D4), collapsed into one dashed group. Opens when it holds the focus target.
 */
export function BranchGroup({
  count,
  focused,
  expandAll,
  children,
}: {
  count: number;
  focused: boolean;
  expandAll: boolean | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(focused);
  useEffect(() => {
    if (expandAll !== null) setOpen(expandAll);
  }, [expandAll]);
  useEffect(() => {
    if (focused) setOpen(true);
  }, [focused]);
  return (
    <section
      className="my-1 mr-4 ml-[70px] rounded-md border border-dashed border-line-strong phone:ml-2"
      aria-label="Rama descartada"
    >
      <button
        className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-2.5 py-1.5 text-left text-size-xs text-ink-2 hover:bg-sunken"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Chevron open={open} />
        <b className="font-semibold text-ink">Rama descartada</b>
        <span className="tabular-nums">
          {count} {count === 1 ? "mensaje" : "mensajes"}
        </span>
        <span className="text-ink-3">· se deshizo con un rollback</span>
      </button>
      {open && <div className="-ml-[70px] phone:-ml-2">{children}</div>}
    </section>
  );
}
