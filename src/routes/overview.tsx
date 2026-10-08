import { Dashboard } from "../features/overview/components/Dashboard";
import { useDashboardData } from "../features/overview/useDashboardData";

/**
 * Resumen (`/resumen` and `/`). The shell is on screen from the start; each section shows a
 * skeleton until its data is final, and later switches keep the previous data until the next
 * arrives (most of it already prefetched). The data and cross-filters are shared with the
 * project dashboard: see `useDashboardData`.
 */
export function Component() {
  return <Dashboard {...useDashboardData()} />;
}
