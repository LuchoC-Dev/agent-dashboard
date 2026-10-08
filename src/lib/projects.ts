import type { SessionSummary } from "../bindings/SessionSummary";

/**
 * Projects are grouped by `projectKey` (contract v2.5): `git:<identity>` for every working
 * copy of one repository (clones with the same origin, worktrees), `path:<cwd>` outside git.
 * The key is what URLs, filters, colors and links use; `projectName` is only the label.
 */
export const isProjectKey = (v: string) => /^(git|path):/.test(v);

/** The project page of a key. */
export const projectHref = (key: string) => "/proyecto/" + encodeURIComponent(key);

/** A readable name for a key without sessions to label it: the last segment of its identity. */
export const nameFromKey = (key: string) =>
  key
    .replace(/^(git|path):/, "")
    .replace(/\.git$/i, "")
    .split(/[\\/:]/)
    .filter(Boolean)
    .pop() || "Sin proyecto";

/**
 * The key of a pre-v2.5 project URL (a `projectPath`), when some session ran there; the
 * value itself when it already is a key; null when nothing matches.
 */
export function keyOfPath(value: string, sessions: SessionSummary[]) {
  if (isProjectKey(value)) return value;
  return sessions.find((s) => folderId(s.projectPath) === folderId(value))?.projectKey ?? null;
}

/**
 * One folder however it was spelled: Windows paths (drive letter or UNC) are
 * case-insensitive, so `C:\Users\me\Desktop\app` and `c:\users\me\desktop\app` are one.
 */
export const folderId = (path: string) => {
  const p = path.replace(/[\\/]+$/, "");
  return /^([a-z]:|\\\\)/i.test(p) ? p.replace(/\//g, "\\").toLowerCase() : p;
};

export type WorkingCopy = { path: string; sessions: number; last: string };

/**
 * The working copies of a project (its distinct folders: the main checkout, other clones,
 * worktrees) with their session count and last activity, most recent first. Spellings of
 * one folder count as one copy, shown as its most used spelling.
 */
export function workingCopies(sessions: SessionSummary[]): WorkingCopy[] {
  const byFolder = new Map<string, WorkingCopy & { spellings: Map<string, number> }>();
  for (const s of sessions) {
    const id = folderId(s.projectPath),
      c = byFolder.get(id) ?? { path: s.projectPath, sessions: 0, last: "", spellings: new Map() };
    c.sessions++;
    if (s.endedAt > c.last) c.last = s.endedAt;
    c.spellings.set(s.projectPath, (c.spellings.get(s.projectPath) ?? 0) + 1);
    byFolder.set(id, c);
  }
  return [...byFolder.values()]
    .map(({ spellings, ...c }) => ({
      ...c,
      path: [...spellings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }))
    .sort((a, b) => b.last.localeCompare(a.last) || a.path.localeCompare(b.path));
}
