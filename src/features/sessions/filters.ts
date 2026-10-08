import type { SessionSummary } from "../../bindings/SessionSummary";
import { matchesModel } from "../../lib/models";

/**
 * Sesiones filters: free text over title/prompt/project, exact project (`projectKey`), and a
 * model or a whole family (`familia:opus`).
 */
export function filterSessions(
  sessions: SessionSummary[],
  { q, project, model }: { q: string; project: string; model: string },
) {
  return sessions.filter(
    (s) =>
      (!q ||
        [s.title, s.firstPrompt, s.projectName, s.projectPath].some((v) =>
          v?.toLowerCase().includes(q.toLowerCase()),
        )) &&
      (!project || s.projectKey === project) &&
      (!model || s.models.some((m) => matchesModel(m, model))),
  );
}
