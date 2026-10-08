/** @vitest-environment jsdom */
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { projectHref } from "../../lib/projects";
import { localSlot } from "../../lib/series";
import { allMessages } from "../../lib/sessions";
import { filesTouched, type FileFilter } from "../../lib/tools";
import { mock } from "../../test/fixtures";
import { dashboardReady, panelOf, renderApp } from "../../test/render";

// "Archivos más tocados" follows every active filter, not only the date range (v2.5).
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

const sessions = mock.sessions.filter((s) => s.startedAt);

/** The files a project page should list under `filter` (sessions of `provider`, if any). */
function expected(key: string, filter: FileFilter, provider?: string) {
  const details = sessions
    .filter((s) => s.projectKey === key && (!provider || s.provider === provider))
    .map((s) => mock.details[s.id]);
  return filesTouched(details, filter);
}
const shownFiles = () =>
  within(panelOf("Archivos más tocados"))
    .queryAllByRole("row")
    .slice(1)
    .map((r) => r.querySelector(".file-path")?.textContent ?? "")
    .filter(Boolean)
    .sort();

/** A project, model and slot whose filtered files are fewer than the unfiltered (one page). */
function pickCase() {
  for (const key of new Set(sessions.map((s) => s.projectKey))) {
    const all = expected(key, {});
    for (const s of sessions.filter((x) => x.projectKey === key))
      for (const m of allMessages(mock.details[s.id])) {
        if (!m.model) continue;
        const [weekday, hour] = localSlot(m.timestamp);
        const files = expected(key, { model: m.model, weekday, hour });
        if (files.length && files.length < all.length && files.length <= 15)
          return { key, model: m.model, weekday, hour, files };
      }
  }
  throw Error("no case in the mock");
}

describe("Archivos más tocados honors every filter", { timeout: 30_000 }, () => {
  it("model and weekday/hour narrow the files to those messages' calls", async () => {
    const c = pickCase();
    renderApp(
      projectHref(c.key) +
        `?modelo=${encodeURIComponent(c.model)}&diasem=${c.weekday}&hora=${c.hour}`,
    );
    await dashboardReady();
    await waitFor(() => expect(shownFiles()).toEqual(c.files.map((f) => f.path).sort()), {
      timeout: 15_000,
    });
  });

  it("the provider narrows them too", async () => {
    const key = sessions.find(
      (s) => s.provider === "codex" && sessions.some((o) => o.projectKey === s.projectKey && o.provider === "claude"),
    )!.projectKey;
    const files = expected(key, {}, "codex");
    expect(files.length).toBeLessThan(expected(key, {}).length);
    renderApp(projectHref(key) + "?proveedor=codex");
    await dashboardReady();
    // One page of the provider's files: none from the other provider's sessions.
    const own = new Set(files.map((f) => f.path));
    await waitFor(() => expect(shownFiles()).toHaveLength(Math.min(15, files.length)), { timeout: 15_000 });
    expect(shownFiles().every((p) => own.has(p))).toBe(true);
    expect(screen.getByRole("heading", { name: "Archivos más tocados" })).toBeTruthy();
  });
});
