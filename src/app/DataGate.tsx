import { Outlet } from "react-router";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui/states";
import { sourceDirs } from "../lib/scan";
import type { DashboardContext } from "./dashboard-context";
import { useShell } from "./shell/context";
import { useRouteHandle } from "./shell/route-handle";

/**
 * Pathless layout for the list and dashboard screens, which share the same loading, error and
 * empty states. A screen with per-section skeletons (`handle.sections`, Resumen) renders while
 * the scope is still loading, with `ready: false` and empty data.
 */
export function DataGate() {
  const { data, colors, refresh } = useShell(),
    { sections = false } = useRouteHandle();
  if (data.error) return <ErrorState error={data.error} onRetry={refresh} />;
  if ((data.loading || !data.tools.data) && !sections) return <LoadingState />;
  if (data.ready && !data.all.data?.length)
    return <EmptyState paths={sourceDirs(data.report.data)} onRefresh={refresh} />;
  return (
    <Outlet
      context={
        {
          ready: data.ready,
          all: data.scoped ?? [],
          sessions: data.sessions ?? [],
          tools: data.tools.data ?? [],
          everything: data.all.data ?? [],
          report: data.report.data,
          range: data.range,
          resolvedRange: data.resolvedRange,
          setRange: data.setRange,
          provider: data.provider,
          providers: data.providers,
          colors,
        } satisfies DashboardContext
      }
    />
  );
}
