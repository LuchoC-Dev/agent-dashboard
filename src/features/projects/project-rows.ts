import type { SessionSummary } from "../../bindings/SessionSummary";
import type { DateRange } from "../../bindings/DateRange";
import { addDays, localDay } from "../../lib/dates";
import { sessionModels } from "../../lib/models";
import { nameFromKey, workingCopies } from "../../lib/projects";
import { totalTok } from "../../lib/usage";

export type ProjectRow = ReturnType<typeof projectRows>[number];

/**
 * One row per project (`projectKey`) with sessions in range, matching `q` on its name or any
 * of its working-copy paths.
 */
export function projectRows(
  projects: string[],
  sessions: SessionSummary[],
  q: string,
) {
  return projects
    .map((key) => {
      const ss = sessions.filter((s) => s.projectKey === key);
      return {
        key,
        name: ss[0]?.projectName || nameFromKey(key),
        /** Distinct working copies (main checkout, clones, worktrees). */
        paths: workingCopies(ss).map((c) => c.path),
        ss,
        cost: ss.reduce((n, s) => n + s.costUsd, 0),
        unpriced: ss.reduce((n, s) => n + (s.unpricedTokens ?? 0), 0),
        last:
          ss
            .map((s) => s.endedAt)
            .sort()
            .reverse()[0] || "",
        branches: [...new Set(ss.map((s) => s.gitBranch).filter(Boolean))],
        models: [...new Set(ss.flatMap(sessionModels))],
        duration: ss.reduce((n, s) => n + s.durationMs, 0),
        calls: ss.reduce((n, s) => n + s.toolCallCount, 0),
        errors: ss.reduce((n, s) => n + s.toolErrorCount, 0),
        tokens: ss.reduce((n, s) => n + totalTok(s.usage), 0),
      };
    })
    .filter(
      (p) =>
        p.ss.length &&
        (!q ||
          [p.name, ...p.ss.map((s) => s.projectPath)].some((v) =>
            v.toLowerCase().includes(q.toLowerCase()),
          )),
    );
}

/**
 * A project's cost per local day of the range (`dates`/`values`, for the bars) and the days
 * with at least one session, sorted by date (`active`, for the tooltip).
 */
export function sparkDays(sessions: SessionSummary[], range: DateRange) {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    const d = localDay(s.startedAt);
    if (d) byDay.set(d, (byDay.get(d) ?? 0) + s.costUsd);
  }
  const dates: string[] = [];
  if (range.from && range.to)
    for (let d = range.from; d <= range.to; d = addDays(d, 1)) dates.push(d);
  const inRange = (d: string) => (!range.from || d >= range.from) && (!range.to || d <= range.to);
  return {
    dates,
    values: dates.map((d) => byDay.get(d) ?? 0),
    active: [...byDay].filter(([d]) => inRange(d)).sort(([a], [b]) => a.localeCompare(b)),
  };
}
