import type { ReactNode } from "react";
import { button } from "./styles";

export const paginationBar =
  "flex items-center justify-center gap-3 border-t border-line px-4 py-3 text-size-xs text-ink-3";

export function Pagination({
  label,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
}: {
  label: ReactNode;
  onPrevious: () => void;
  onNext: () => void;
  hasPrevious: boolean;
  hasNext: boolean;
}) {
  return (
    <div className={paginationBar}>
      <button
        className={button({ size: "sm" })}
        disabled={!hasPrevious}
        onClick={onPrevious}
      >
        Anterior
      </button>
      <span>{label}</span>
      <button
        className={button({ size: "sm" })}
        disabled={!hasNext}
        onClick={onNext}
      >
        Siguiente
      </button>
    </div>
  );
}
