import { useDashboard } from "../app/dashboard-context";
import { SessionsList } from "../features/sessions/components/SessionsList";

/** Sesiones (`/sesiones?q=&proyecto=&modelo=&herramienta=`). */
export function Component() {
  const { sessions, all, colors, resolvedRange, provider } = useDashboard();
  return (
    <SessionsList
      sessions={sessions}
      all={all}
      colors={colors}
      range={resolvedRange}
      provider={provider}
    />
  );
}
