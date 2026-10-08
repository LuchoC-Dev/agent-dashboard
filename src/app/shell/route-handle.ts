import { useMatches } from "react-router";

/**
 * Route `handle`: breadcrumb title, whether it is a detail page (no range control), and whether
 * the screen shows its own per-section loading state instead of DataGate's.
 */
export type RouteHandle = { title?: string; detail?: boolean; sections?: boolean };

export function useRouteHandle(): RouteHandle {
  const matches = useMatches();
  return (
    [...matches].reverse().find((m) => (m.handle as RouteHandle)?.title)
      ?.handle ?? { title: "Resumen" }
  ) as RouteHandle;
}
