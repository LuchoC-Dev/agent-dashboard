import { useMemo } from "react";
import type { SessionSummary } from "../../bindings/SessionSummary";
import { palette } from "../../lib/colors";

/** Model colors from the whole dataset; project colors by usage rank in `view` (on screen). */
export function usePalette(
  all: SessionSummary[] | undefined,
  view: SessionSummary[] | undefined,
) {
  return useMemo(() => palette(all || [], view || all || []), [all, view]);
}
