import { useDashboard } from "../app/dashboard-context";
import { ProjectsList } from "../features/projects/components/ProjectsList";

/** Proyectos (`/proyectos?q=`). */
export function Component() {
  const { sessions, colors, resolvedRange } = useDashboard();
  return (
    <ProjectsList sessions={sessions} colors={colors} range={resolvedRange} />
  );
}
