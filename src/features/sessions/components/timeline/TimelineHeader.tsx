import type { ReactNode } from "react";
import { button } from "../../../../components/ui/styles";
import { int } from "../../../../lib/format";

const ghost = button({ size: "sm", ghost: true });

/** Sticky toolbar of the conversation: counts, error navigation and bulk toggles. */
export function TimelineHeader({
  messages,
  calls,
  errors,
  subagents,
  branches,
  hideBranches,
  onHideBranches,
  onNextError,
  onBulk,
  actions,
}: {
  messages: number;
  calls: number;
  errors: number;
  subagents: number;
  /** Discarded branches in the conversation. */
  branches: number;
  hideBranches: boolean;
  onHideBranches: (hide: boolean) => void;
  onNextError: () => void;
  onBulk: (expand: boolean) => void;
  actions?: ReactNode;
}) {
  return (
    <div className="sticky -top-5 z-[2] flex flex-wrap items-center gap-2 rounded-t-md border-b border-line bg-surface px-4 py-2.5">
      <h2 className="text-size-sm font-semibold">Conversación</h2>
      <span className="text-size-xs text-ink-3 tabular-nums">
        {int(messages)} mensajes · {int(calls)} llamadas · ⊗ {errors} con error
        · {subagents} subagentes
      </span>
      <span className="flex-1" />
      {actions}
      {branches > 0 && (
        <button
          className={ghost}
          aria-pressed={hideBranches}
          onClick={() => onHideBranches(!hideBranches)}
        >
          {hideBranches ? "Mostrar" : "Ocultar"} ramas descartadas ({branches})
        </button>
      )}
      <button className={ghost} disabled={!errors} onClick={onNextError}>
        Siguiente error
      </button>
      <button className={ghost} onClick={() => onBulk(true)}>
        Expandir todo
      </button>
      <button className={ghost} onClick={() => onBulk(false)}>
        Contraer
      </button>
    </div>
  );
}
