import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../bindings/SessionSummary";
import { mock } from "../test/fixtures";
import { palette, PROJECT_SLOTS } from "./colors";

/** A session of `project` with `tokens` of input. */
const session = (project: string, tokens: number, i = 0): SessionSummary => ({
  ...mock.sessions[0],
  id: `${project}-${i}`,
  projectPath: "/p/" + project,
  projectKey: "path:/p/" + project,
  projectName: project,
  usage: { inputTokens: tokens, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
});
const slot = (color: string) => Number(/series-(\d+)/.exec(color)![1]);

describe("project colors", () => {
  it("follow usage rank in the view, most used first", () => {
    const all = [session("a", 10), session("b", 300), session("c", 20)],
      colors = palette(all);
    expect(colors.projectRank).toEqual(["path:/p/b", "path:/p/c", "path:/p/a"]);
    expect(colors.projectColor("path:/p/b")).toBe("var(--color-series-1)");
    expect(colors.projectColor("path:/p/c")).toBe("var(--color-series-2)");
    expect(colors.projectColor("path:/p/a")).toBe("var(--color-series-3)");
  });

  it("re-rank with the view, then place the rest of the dataset after it", () => {
    const all = [session("a", 10), session("b", 300), session("c", 20)],
      colors = palette(all, [session("a", 10), session("c", 5)]);
    expect(colors.projectRank).toEqual(["path:/p/a", "path:/p/c", "path:/p/b"]);
    expect(colors.projectColor("path:/p/a")).toBe("var(--color-series-1)");
    expect(colors.projectColor("path:/p/b")).toBe("var(--color-series-3)");
  });

  it("break usage ties by session count, then path", () => {
    const colors = palette([session("z", 5), session("y", 5), session("x", 2, 1), session("x", 3, 2)]);
    expect(colors.projectRank).toEqual(["path:/p/x", "path:/p/y", "path:/p/z"]);
  });

  it("never fold into a gray bucket: every project gets a series slot", () => {
    const all = Array.from({ length: 40 }, (_, i) => session("p" + i, 1000 - i)),
      colors = palette(all);
    const slots = all.map((s) => colors.projectColor(s.projectKey));
    expect(slots.every((c) => /^var\(--color-series-\d+\)$/.test(c))).toBe(true);
    expect(slots.some((c) => c.includes("other"))).toBe(false);
    // The first PROJECT_SLOTS projects get distinct slots; later ones repeat them in order.
    expect(new Set(slots.slice(0, PROJECT_SLOTS)).size).toBe(PROJECT_SLOTS);
    expect(slot(slots[PROJECT_SLOTS])).toBe(1);
    expect(slot(colors.projectColor("/not/in/data"))).toBeGreaterThanOrEqual(1);
  });

  it("give every working copy of a repository one project and one color", () => {
    const main = { ...session("app", 10), projectKey: "git:github.com/me/app" },
      worktree = { ...session("app-wt", 20, 1), projectKey: "git:github.com/me/app", projectName: "app" },
      other = { ...session("app", 5, 2), projectKey: "git:github.com/you/app" },
      colors = palette([main, worktree, other]);
    expect(colors.projects).toEqual(["git:github.com/me/app", "git:github.com/you/app"]);
    expect(colors.projectName("git:github.com/me/app")).toBe("app");
    expect(colors.projectColor(main.projectKey)).toBe(colors.projectColor(worktree.projectKey));
    // Two repositories with the same folder name stay two projects with two colors.
    expect(colors.projectColor(other.projectKey)).not.toBe(colors.projectColor(main.projectKey));
    expect(colors.projectName("git:github.com/nobody/thing.git")).toBe("thing");
  });

  it("colors every mock project", () => {
    const colors = palette(mock.sessions);
    for (const p of colors.projects) expect(colors.projectColor(p)).toMatch(/series-\d+/);
  });
});
