/** @vitest-environment jsdom */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { projectHref, workingCopies } from "../../lib/projects";
import { mock } from "../../test/fixtures";
import { dashboardReady, panelOf, renderApp, searchOf } from "../../test/render";
import { projectRows } from "./project-rows";

// Contract v2.5: projects are grouped and linked by `projectKey`, labeled by `projectName`.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

/** The mock repository with a worktree: one key, two working copies. */
const repo = mock.sessions.find((s) =>
  mock.sessions.some((o) => o.projectKey === s.projectKey && o.projectPath !== s.projectPath),
)!.projectKey;
const own = mock.sessions.filter((s) => s.projectKey === repo),
  paths = [...new Set(own.map((s) => s.projectPath))];

describe("projects by git key", { timeout: 30_000 }, () => {
  it("the mock has a repository with two working copies", () => {
    expect(paths).toHaveLength(2);
    const copies = workingCopies(own);
    expect(copies.map((c) => c.path).sort()).toEqual([...paths].sort());
    expect(copies.reduce((n, c) => n + c.sessions, 0)).toBe(own.length);
    expect(copies[0].last >= copies[1].last).toBe(true);
  });

  it("Proyectos has one row per key, searchable by any working-copy path", () => {
    const keys = [...new Set(mock.sessions.map((s) => s.projectKey))];
    const rows = projectRows(keys, mock.sessions, "");
    expect(rows).toHaveLength(keys.length);
    const row = rows.find((r) => r.key === repo)!;
    expect(row.ss).toHaveLength(own.length);
    expect(row.paths.sort()).toEqual([...paths].sort());
    // The worktree folder ("frontend") finds its repository.
    const worktree = paths.find((p) => p.includes("workspaces"))!;
    expect(projectRows(keys, mock.sessions, worktree.slice(-12)).map((r) => r.key)).toEqual([repo]);
  });

  it("Proyectos links the row to the key and counts its copies", async () => {
    renderApp("/proyectos");
    const link = await screen.findByRole("link", { name: /dashboard-v1/ }, { timeout: 20_000 });
    expect(link.getAttribute("href")).toBe(projectHref(repo));
    expect(link.textContent).toContain("2 copias");
  });

  it("the project page shows every working copy with its sessions and last activity", async () => {
    renderApp(projectHref(repo));
    await dashboardReady();
    const copies = screen.getByRole("region", { name: "Copias de trabajo" });
    expect(copies.textContent).toContain("Copias de trabajo · 2");
    for (const c of workingCopies(own)) {
      const item = within(copies).getByTitle(c.path).closest("li")!;
      expect(item.textContent).toContain(`${c.sessions} ${c.sessions === 1 ? "sesión" : "sesiones"}`);
    }
    // Every session of the repository, from both copies.
    expect(screen.getByText(`${own.length} sesiones en total`)).toBeTruthy();
  });

  it("a Por proyecto row filters Resumen by key; the chip shows the repository name", async () => {
    const router = renderApp("/resumen");
    await dashboardReady();
    const row = within(panelOf("Por proyecto"))
      .getAllByRole("row")
      .find((r) => r.textContent?.includes("dashboard-v1"))!;
    fireEvent.click(row);
    await waitFor(() => expect(searchOf(router).get("proyecto")).toBe(repo));
    const chip = await screen.findByRole(
      "button",
      { name: "Quitar filtro Proyecto: dashboard-v1" },
      { timeout: 10_000 },
    );
    expect(chip).toBeTruthy();
  });

  it("Sesiones offers one option per key and filters both working copies", async () => {
    renderApp("/sesiones?proyecto=" + encodeURIComponent(repo));
    const select = (await screen.findByRole("combobox", { name: "Proyecto" }, { timeout: 20_000 })) as HTMLSelectElement;
    expect(select.value).toBe(repo);
    expect([...select.options].filter((o) => o.textContent === "dashboard-v1")).toHaveLength(1);
    expect(await screen.findByText(String(own.length), undefined, { timeout: 10_000 })).toBeTruthy();
  });

  it("a pre-v2.5 Sesiones link with a path selects that path's project", async () => {
    renderApp("/sesiones?proyecto=" + encodeURIComponent(paths[0]));
    const select = (await screen.findByRole("combobox", { name: "Proyecto" }, { timeout: 20_000 })) as HTMLSelectElement;
    expect(select.value).toBe(repo);
  });
});
