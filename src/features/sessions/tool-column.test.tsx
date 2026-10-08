/** @vitest-environment jsdom */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { listSessions } from "../../api";
import type { SessionSummary } from "../../bindings/SessionSummary";
import { palette as paletteOf } from "../../lib/colors";
import { resolveRange } from "../../lib/dates";
import { modelArgs } from "../../lib/filters";
import { int } from "../../lib/format";
import { familyFilter, parseModel } from "../../lib/models";
import { projectHref } from "../../lib/projects";
import { allMessages, toolCounts } from "../../lib/sessions";
import { mock } from "../../test/fixtures";
import { dashboardReady, panelOf, renderApp } from "../../test/render";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

const range = resolveRange({}, mock.sessions),
  palette = paletteOf(mock.sessions),
  details = Object.values(mock.details);
const callers = (tool: string) =>
  mock.sessions.filter((s) =>
    allMessages(mock.details[s.id]).some((m) => m.blocks.some((b) => b.type === "toolCall" && b.name === tool)),
  );
// A tool some sessions called and others did not, so the lists really narrow.
const TOOL = [...new Set(details.flatMap((d) => allMessages(d).flatMap((m) => m.blocks)).flatMap((b) => (b.type === "toolCall" ? [b.name] : [])))]
  .map((name) => [name, callers(name).length] as const)
  .filter(([, n]) => n > 1 && n < mock.sessions.length)
  .sort((a, b) => b[1] - a[1])[0][0];
const model = callers(TOOL).find((s) => s.provider === "claude" && s.models.length)!.models[0],
  family = familyFilter(parseModel(model).family!),
  projectKey = callers(TOOL)[0].projectKey;

type Combo = { name: string; modelo?: string; proyecto?: string };
const COMBOS: Combo[] = [
  { name: "alone" },
  { name: "model", modelo: model },
  { name: "family", modelo: family },
  { name: "project", proyecto: projectKey },
  { name: "family + project", modelo: family, proyecto: projectKey },
];

const shown = ({ calls, errors }: { calls: number; errors: number }) =>
  int(calls) + (errors > 0 ? " · ⊗ " + int(errors) : "");
/** What the backend's list says for these filters, by session id. */
async function expected(c: Combo, tool: string | null) {
  const { model, models } = tool && c.modelo ? modelArgs(c.modelo, palette.models) : { model: null, models: null };
  const listed = await listSessions({
    ...range,
    ...(model ? { model } : {}),
    ...(models ? { models } : {}),
    ...(tool ? { tool } : {}),
    ...(c.proyecto ? { projectKey: c.proyecto } : {}),
  });
  // Under a tool every listed session called it, so it carries a positive count.
  if (tool) expect(listed.every((s) => toolCounts(s, tool).calls > 0)).toBe(true);
  return new Map(listed.map((s: SessionSummary) => [s.id, shown(toolCounts(s, tool))]));
}
const url = (path: string, c: Combo, tool: string | null) => {
  const q = new URLSearchParams({ from: range.from!, to: range.to! });
  if (c.modelo) q.set("modelo", c.modelo);
  if (c.proyecto) q.set("proyecto", c.proyecto);
  if (tool) q.set("herramienta", tool);
  return path + "?" + q;
};
/** The tool column of `table`: its header and each row's session id and cell text. */
function toolColumn(table: HTMLElement, tool: string | null) {
  const headers = within(table).getAllByRole("columnheader"),
    col = headers.findIndex((h) => h.textContent!.replace(/[▲▼]/, "") === (tool ?? "Herram."));
  expect(col).toBeGreaterThan(-1);
  const rows = within(table)
    .getAllByRole("row")
    .slice(1)
    .map((r) => {
      const href = r.querySelector("a[href*='/sesion/']")!.getAttribute("href")!;
      return [decodeURIComponent(href.match(/\/sesion\/([^?#]+)/)![1]), within(r).getAllByRole("cell")[col].textContent!] as const;
    });
  return { header: headers[col], rows };
}
/** Waits for `toolColumn` to hold: the table may still be the previous page's, or loading. */
const findToolColumn = (table: () => HTMLElement, tool: string | null) =>
  waitFor(() => toolColumn(table(), tool), { timeout: 20_000 });
const sessionsTable = () => screen.getAllByRole("table")[0];
const sessionsLoaded = () =>
  waitFor(() => expect(within(sessionsTable()).getAllByRole("row").length).toBeGreaterThan(1), { timeout: 20_000 });

describe("session tool column (contract v2.6.1)", { timeout: 60_000 }, () => {
  for (const c of COMBOS)
    for (const tool of [TOOL, null])
      it(`Resumen and Sesiones (${c.name}, ${tool ? "tool" : "no tool"})`, async () => {
        const want = await expected(c, tool);
        renderApp(url("/resumen", c, tool));
        await dashboardReady();
        await waitFor(
          () => {
            const { rows } = toolColumn(within(panelOf("Sesiones recientes")).getByRole("table"), tool);
            expect(rows.length).toBeGreaterThan(0);
            for (const [id, text] of rows) expect([id, text]).toEqual([id, want.get(id)]);
          },
          { timeout: 20_000 },
        );
        document.body.innerHTML = "";

        renderApp(url("/sesiones", c, tool));
        await sessionsLoaded();
        const { header } = await waitFor(
          () => {
            const column = toolColumn(sessionsTable(), tool);
            // Without a tool the model narrows the page on its own; the backend's list has every model.
            if (tool || !c.modelo) expect(column.rows.length).toBe(Math.min(want.size, 50));
            for (const [id, text] of column.rows) expect([id, text]).toEqual([id, want.get(id)]);
            return column;
          },
          { timeout: 20_000 },
        );
        // Sorting by the column follows the counts it shows.
        fireEvent.click(within(header).getByRole("button"));
        await waitFor(() => {
          const sorted = toolColumn(sessionsTable(), tool).rows.map(([, t]) => Number(t.split(" ")[0].replace(/\D/g, "")));
          expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
        });
      });

  it("a project's sessions follow the tool too", async () => {
    const want = await expected({ name: "project", proyecto: projectKey }, TOOL);
    renderApp(projectHref(projectKey) + "?" + new URLSearchParams({ from: range.from!, to: range.to!, herramienta: TOOL }));
    await dashboardReady();
    await waitFor(
      () => {
        const { rows } = toolColumn(within(panelOf("Sesiones del proyecto")).getByRole("table"), TOOL);
        expect(rows.map(([id]) => id).sort()).toEqual([...want.keys()].slice(0, 50).sort());
        for (const [id, text] of rows) expect([id, text]).toEqual([id, want.get(id)]);
      },
      { timeout: 20_000 },
    );
  });

  it("Ver todas carries the tool into Sesiones, where its chip removes it", async () => {
    const router = renderApp(url("/resumen", { name: "tool" }, TOOL));
    await dashboardReady();
    fireEvent.click(await within(panelOf("Sesiones recientes")).findByText(/Ver todas/, undefined, { timeout: 20_000 }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/sesiones"));
    expect(new URLSearchParams(router.state.location.search).get("herramienta")).toBe(TOOL);
    await sessionsLoaded();
    expect((await findToolColumn(sessionsTable, TOOL)).header).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: `Herramienta: ${TOOL} ✕` }));
    expect((await findToolColumn(sessionsTable, null)).header).toBeTruthy();
  });
});
