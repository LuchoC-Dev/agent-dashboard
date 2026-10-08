import { Navigate, useLocation, useParams } from "react-router";
import { useDashboard } from "../app/dashboard-context";
import { ProjectDashboard } from "../features/projects/components/ProjectDashboard";
import { isProjectKey, keyOfPath, projectHref } from "../lib/projects";

/**
 * Proyecto (`/proyecto/:key`): the Resumen dashboard scoped to one project (`projectKey`,
 * contract v2.5). A pre-v2.5 URL holds a working-copy path: it redirects to its project.
 */
export function Component() {
  const { key = "" } = useParams(),
    { search } = useLocation(),
    { all, everything, colors } = useDashboard();
  if (!isProjectKey(key)) {
    const target = keyOfPath(key, everything);
    if (target) return <Navigate replace to={projectHref(target) + search} />;
  }
  return <ProjectDashboard key={key} projectKey={key} all={all} colors={colors} />;
}
