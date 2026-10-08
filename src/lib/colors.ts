import type { SessionSummary } from "../bindings/SessionSummary";
import { isAutoReview, modelOrder, parseModel, sessionModels } from "./models";
import { nameFromKey } from "./projects";
import { totalTok } from "./usage";

/** Slots of the categorical project palette (`--color-series-1` … `-16`): 8 hues × 2 lightness. */
export const PROJECT_SLOTS = 16;

/** Project keys by usage (tokens, then sessions), most used first; ties by key. */
function byUsage(sessions: SessionSummary[]) {
  const use = new Map<string, [number, number]>();
  for (const s of sessions) {
    const u = use.get(s.projectKey) || [0, 0];
    use.set(s.projectKey, [u[0] + totalTok(s.usage), u[1] + 1]);
  }
  return [...use.keys()].sort(
    (a, b) =>
      use.get(b)![0] - use.get(a)![0] ||
      use.get(b)![1] - use.get(a)![1] ||
      a.localeCompare(b),
  );
}

/** A stable slot for a key outside the data, so it still gets a color (never gray). */
const hashSlot = (p: string) =>
  [...p].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PROJECT_SLOTS;

/**
 * Model colors come from the whole dataset, so a filter never repaints a model: versions take
 * their family's steps (newest first). Project colors follow usage rank within the current
 * view (`view`: the sessions on screen), so the most used projects always get the first,
 * most distinct slots; the rest of the dataset follows, ranked the same way. With more
 * projects than slots the palette repeats; no project is ever gray or folded into "Otros".
 */
export function palette(all: SessionSummary[], view: SessionSummary[] = all) {
  const models = [...new Set(all.flatMap(sessionModels))].sort(modelOrder);
  const names = new Map<string, string>();
  for (const s of all) if (!names.has(s.projectKey)) names.set(s.projectKey, s.projectName);
  const projectName = (key: string) => names.get(key) || nameFromKey(key);
  const projects = [...names.keys()].sort(
    (a, b) => projectName(a).localeCompare(projectName(b)) || a.localeCompare(b),
  );
  const shown = byUsage(view),
    projectRank = [
      ...shown,
      ...byUsage(all).filter((p) => !shown.includes(p)),
    ];
  return {
    models,
    /** Every project key, alphabetical by name (filters, pickers). */
    projects,
    /** Every project key in color order: by usage in the view, then in the dataset. */
    projectRank,
    /** A project key's label: its sessions' `projectName`. */
    projectName,
    modelColor: (id: string) => {
      const f = parseModel(id).family;
      return isAutoReview(id)
        ? "var(--color-review)"
        : f === "other"
          ? "var(--color-family-other)"
          : `var(--color-${f}-${Math.min(3, Math.max(1, models.filter((m) => parseModel(m).family === f).indexOf(id) + 1))})`;
    },
    projectColor: (p: string) => {
      const i = projectRank.indexOf(p);
      return `var(--color-series-${(i >= 0 ? i % PROJECT_SLOTS : hashSlot(p)) + 1})`;
    },
  };
}
export type Palette = ReturnType<typeof palette>;
