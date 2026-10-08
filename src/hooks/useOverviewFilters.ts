import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  clearFilters,
  readFilters,
  toggleFilter,
  toggleSlot as slotParams,
  type FilterKey,
} from "../lib/filters";

/**
 * Resumen's cross-filters, read from and written to the URL. Every change is a new history
 * entry, so Back (top bar, Alt+←, mouse button) restores the previous filters. The callbacks
 * keep their identity until the URL changes, so memoized panels do not re-render on hover or
 * on a metric switch.
 */
export function useOverviewFilters() {
  const { pathname, search } = useLocation(),
    navigate = useNavigate();
  const filters = useMemo(() => readFilters(new URLSearchParams(search)), [search]);
  const go = useCallback(
    (change: (p: URLSearchParams) => URLSearchParams) =>
      navigate({ pathname, search: change(new URLSearchParams(search)).toString() }),
    [navigate, pathname, search],
  );
  return {
    filters,
    /** Applies `value`, or clears the filter when it is already active. */
    toggle: useCallback(
      (key: FilterKey, value: string | null) => go((p) => toggleFilter(p, key, value)),
      [go],
    ),
    /** A heatmap cell: weekday and hour together (again to clear both). */
    toggleSlot: useCallback(
      (weekday: number, hour: number) => go((p) => slotParams(p, weekday, hour)),
      [go],
    ),
    clearAll: useCallback(() => go(clearFilters), [go]),
  };
}
