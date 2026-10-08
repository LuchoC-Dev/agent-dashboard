/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { describe, expect, it, vi } from "vitest";
import { getMetrics, getToolStats, listSessions } from "../../api";
import { createQueryClient } from "../../app/queries";
import { createRoutes } from "../../app/routes";
import type { DailySeries } from "../../bindings/DailySeries";
import { unpricedModels } from "../../lib/aggregate";
import { palette as paletteOf } from "../../lib/colors";
import { resolveRange } from "../../lib/dates";
import { kindArg, modelArgs, type TokenKind } from "../../lib/filters";
import { int } from "../../lib/format";
import { familyFilter, parseModel } from "../../lib/models";
import { dailySeries } from "../../lib/series";
import { allMessages } from "../../lib/sessions";
import { mock } from "../../test/fixtures";
import { sessionQueries } from "../sessions/queries";
import { toolQueries } from "../tools/queries";
import { dailyTrend, errorsKey, trendSum, type TrendGroup } from "./daily-trend";
import { overviewQueries } from "./queries";

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
// A tool some sessions called and others did not, so the scope really narrows.
const TOOL = [...new Set(details.flatMap((d) => allMessages(d).flatMap((m) => m.blocks)).flatMap((b) => (b.type === "toolCall" ? [b.name] : [])))]
  .map((name) => [name, callers(name).length] as const)
  .filter(([, n]) => n > 1 && n < mock.sessions.length)
  .sort((a, b) => b[1] - a[1])[0][0];

const model = mock.sessions.find((s) => s.provider === "claude" && s.models.length)!.models[0],
  family = familyFilter(parseModel(model).family!),
  projectKey = callers(TOOL)[0].projectKey;
type Combo = {
  name?: string;
  model?: string;
  models?: string[];
  weekday?: number;
  hour?: number;
  projectKey?: string;
  tokenKind?: TokenKind;
};
const COMBOS: Combo[] = [
  { name: "alone" },
  { name: "model", model },
  { name: "family", models: modelArgs(family, palette.models).models! },
  { name: "project", projectKey },
  { name: "weekday", weekday: 1 },
  { name: "weekday + hour", weekday: 1, hour: 10 },
  { name: "token kind", tokenKind: "outputTokens" },
];
const metricsOf = (c: Combo, tool?: string) =>
  getMetrics(
    range,
    undefined,
    undefined,
    c.model,
    c.weekday,
    c.hour,
    c.tokenKind && kindArg(c.tokenKind),
    c.projectKey,
    c.models,
    tool ? { tool } : undefined,
  );
const statsOf = (c: Combo, tool?: string) =>
  getToolStats(range, undefined, undefined, c.model, c.weekday, c.hour, c.projectKey, c.models, tool ? { tool } : undefined);
const errorsIn = (data: ReturnType<typeof dailyTrend>) =>
  data.data.reduce((n, r) => n + data.series.reduce((m, s) => m + Number(r[errorsKey(s.key)] || 0), 0), 0);

describe("tool filter (contract v2.6)", { timeout: 60_000 }, () => {
  it("every dashboard query key carries the tool", () => {
    const keys = [
      overviewQueries.metrics(range, null, null, { tool: "Bash" }).queryKey,
      toolQueries.stats(range, null, null, { tool: "Bash" }).queryKey,
      sessionQueries.slot(range, null, null, { tool: "Bash" }).queryKey,
    ];
    for (const key of keys) expect(key).toContain("Bash");
    // Without it the keys match the prefetched (unfiltered) ones.
    expect(overviewQueries.metrics(range, null, null, {}).queryKey).toEqual(
      overviewQueries.metrics(range, null, null, { tool: null }).queryKey,
    );
  });

  for (const c of COMBOS)
    it(`scopes every figure to the tool's sessions (${c.name})`, async () => {
      const [all, only, stats, listed] = await Promise.all([
        metricsOf(c),
        metricsOf(c, TOOL),
        statsOf(c, TOOL),
        listSessions({ ...range, tool: TOOL, model: c.model, models: c.models, weekday: c.weekday, hour: c.hour, projectKey: c.projectKey }),
      ]);
      // Tool figures count only that tool: its single row in the table.
      expect(stats.map((t) => t.name)).toEqual(only.totals.toolCalls ? [TOOL] : []);
      expect(only.totals.toolCalls).toBe(stats[0]?.calls ?? 0);
      expect(only.totals.toolErrors).toBe(stats[0]?.errors ?? 0);
      // The rest counts the sessions that called it: never more than without the filter.
      expect(only.totals.sessions).toBeLessThanOrEqual(all.totals.sessions);
      expect(only.totals.sessions).toBe(listed.length);
      if (!c.weekday && !c.model && !c.models) expect(only.totals.sessions).toBeLessThan(all.totals.sessions);
      // Herramientas in the daily chart: Total splits ok/error, groupings carry the errors.
      const total = dailyTrend(only, range, "total", "tools", palette);
      expect(total.series.map((s) => s.key)).toEqual(["ok", "error"]);
      expect(trendSum(total.data, total.series)).toBe(only.totals.toolCalls);
      expect(total.data.reduce((n, r) => n + Number(r.error || 0), 0)).toBe(only.totals.toolErrors);
      for (const group of ["provider", "project"] as TrendGroup[]) {
        const trend = dailyTrend(only, range, group, "tools", palette);
        expect(trendSum(trend.data, trend.series)).toBe(only.totals.toolCalls);
        expect(errorsIn(trend)).toBe(only.totals.toolErrors);
      }
      // Under a token kind the groupings count only that kind.
      if (c.tokenKind)
        for (const group of ["provider", "model", "project"] as TrendGroup[]) {
          const trend = dailyTrend(only, range, group, "tokens", palette, { tokenKind: c.tokenKind });
          expect(trendSum(trend.data, trend.series)).toBe(only.totals.usage[c.tokenKind]);
        }
    });

  it("without a tool, Herramientas still splits every day's calls into ok/error", async () => {
    const m = await metricsOf({});
    expect(m.totals.toolErrors).toBeGreaterThan(0);
    const total = dailyTrend(m, range, "total", "tools", palette);
    expect(total.data.reduce((n, r) => n + Number(r.error || 0), 0)).toBe(m.totals.toolErrors);
    for (const group of ["provider", "model", "project"] as TrendGroup[])
      expect(errorsIn(dailyTrend(m, range, group, "tools", palette))).toBe(m.totals.toolErrors);
  });

  it("a project's branch series keep only the tool's sessions and count only its calls", () => {
    const scoped = mock.sessions.filter((s) => s.projectKey === projectKey),
      unpriced = unpricedModels(details),
      sum = (list: DailySeries[], f: (p: DailySeries["points"][number]) => number) =>
        list.reduce((n, s) => n + s.points.reduce((m, p) => m + f(p), 0), 0);
    const branches = dailySeries(scoped, mock.details, range, { tool: TOOL }, unpriced).seriesByBranch;
    const calls = scoped
      .flatMap((s) => allMessages(mock.details[s.id]))
      .flatMap((m) => m.blocks)
      .filter((b) => b.type === "toolCall" && b.name === TOOL);
    expect(sum(branches, (p) => p.toolCalls)).toBe(calls.length);
    expect(sum(branches, (p) => p.toolErrors ?? 0)).toBe(
      calls.filter((b) => b.type === "toolCall" && b.isError).length,
    );
    const plain = dailySeries(scoped, mock.details, range, {}, unpriced).seriesByBranch;
    expect(sum(branches, (p) => p.messages)).toBeLessThanOrEqual(sum(plain, (p) => p.messages));
  });

  it("Resumen: chip, tool tile, one table row and the tool's sessions only", async () => {
    const client = createQueryClient(),
      router = createMemoryRouter(createRoutes(client), {
        initialEntries: [`/resumen?from=${range.from}&to=${range.to}&herramienta=${encodeURIComponent(TOOL)}`],
      });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findByRole("button", { name: `Quitar filtro Herramienta: ${TOOL}` }, { timeout: 20_000 });
    const m = await metricsOf({}, TOOL);
    const tile = (await screen.findByText("Llamadas · " + TOOL, undefined, { timeout: 20_000 })).closest(".kpi")!;
    expect(within(tile as HTMLElement).getByText(int(m.totals.toolCalls))).toBeTruthy();
    const panel = (title: string) => screen.getByRole("heading", { name: title }).closest("section")!;
    await waitFor(() => expect(within(panel("Herramientas más usadas")).getAllByRole("row")).toHaveLength(2));
    // The session table lists only sessions that called the tool.
    const ids = new Set(callers(TOOL).map((s) => s.title));
    await waitFor(() => {
      const rows = within(panel("Sesiones recientes")).getAllByRole("row").slice(1);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect([...ids].some((t) => !!t && row.textContent!.includes(t))).toBe(true);
    });
  });
});
