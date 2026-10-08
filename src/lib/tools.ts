import type { SessionDetail } from "../bindings/SessionDetail";
import type { ToolStat } from "../bindings/ToolStat";
import type { Message } from "../bindings/Message";
import { localDay } from "./dates";
import { hasSlot, keepModel, localSlot, type MessageFilter } from "./series";
import { allMessages, callsIn } from "./sessions";

/** Same shape as the backend's `get_tool_stats`, computed from loaded session details. */
export function toolsFromDetails(details: SessionDetail[]): ToolStat[] {
  const map = new Map<
    string,
    {
      calls: number;
      errors: number;
      durations: number[];
      projects: Map<string, { label: string; count: number }>;
    }
  >();
  for (const d of details)
    for (const c of callsIn(allMessages(d))) {
      const t = map.get(c.name) ?? {
        calls: 0,
        errors: 0,
        durations: [] as number[],
        projects: new Map<string, { label: string; count: number }>(),
      };
      t.calls++;
      t.errors += Number(c.isError);
      if (c.durationMs !== null) t.durations.push(c.durationMs);
      const project = t.projects.get(d.summary.projectKey) ?? { label: d.summary.projectName, count: 0 };
      project.count++;
      t.projects.set(d.summary.projectKey, project);
      map.set(c.name, t);
    }
  return [...map]
    .map(([name, t]) => ({
      name,
      calls: t.calls,
      errors: t.errors,
      errorRate: t.errors / t.calls,
      avgDurationMs: t.durations.length
        ? t.durations.reduce((a, b) => a + b, 0) / t.durations.length
        : null,
      byProject: [...t.projects]
        .map(([key, { label, count }]) => ({ key, label, count }))
        .sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => b.calls - a.calls);
}
export type FileTouch = ReturnType<typeof filesTouched>[number];

/** What "Archivos más tocados" counts: the message filters of the dashboard, plus one day. */
export type FileFilter = MessageFilter & { day?: string | null };

/** Whether a message passes the dashboard's message-level filters. */
const keepFile = (f: FileFilter, m: Message) => {
  if (!keepModel(f, m.model)) return false;
  if (f.day && localDay(m.timestamp) !== f.day) return false;
  if (!hasSlot(f)) return true;
  const [weekday, hour] = localSlot(m.timestamp);
  return (f.weekday == null || weekday === f.weekday) && (f.hour == null || hour === f.hour);
};

/**
 * Files read, edited or written, counted from the calls of the messages that pass `filter`
 * (model or family, weekday/hour, day), so the panel follows every active filter.
 */
export function filesTouched(details: SessionDetail[], filter: FileFilter = {}) {
  const map = new Map<
    string,
    {
      path: string;
      reads: number;
      edits: number;
      writes: number;
      total: number;
    }
  >();
  for (const d of details)
    for (const c of callsIn(allMessages(d).filter((m) => keepFile(filter, m)))) {
      if (
        !["Read", "Edit", "Write"].includes(c.name) ||
        !c.input ||
        typeof c.input !== "object" ||
        Array.isArray(c.input) ||
        typeof c.input.file_path !== "string"
      )
        continue;
      const path = c.input.file_path,
        f = map.get(path) ?? { path, reads: 0, edits: 0, writes: 0, total: 0 };
      f[c.name === "Read" ? "reads" : c.name === "Edit" ? "edits" : "writes"]++;
      f.total++;
      map.set(path, f);
    }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
