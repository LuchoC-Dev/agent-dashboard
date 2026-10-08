/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { describe, expect, it, vi } from "vitest";
import { getMetrics } from "../../api";
import { createQueryClient } from "../../app/queries";
import { createRoutes } from "../../app/routes";
import { unpricedModels } from "../../lib/aggregate";
import { resolveRange } from "../../lib/dates";
import { kindArg } from "../../lib/filters";
import { usd } from "../../lib/format";
import { dailySeries } from "../../lib/series";
import { costOf, tokenKinds, totalTok } from "../../lib/usage";
import { mock } from "../../test/fixtures";
import { palette as paletteOf } from "../../lib/colors";
import { dailyTrend, seriesTotal, trendSum } from "./daily-trend";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

const range = resolveRange({}, mock.sessions),
  palette = paletteOf(mock.sessions);
const panel = (title: string) => screen.getByRole("heading", { name: title }).closest("section")!;

describe("token-kind filter (contract v2.4)", { timeout: 30_000 }, () => {
  it("maps the URL kinds to the command's", () => {
    expect(tokenKinds.map(([k]) => kindArg(k))).toEqual(["cacheRead", "output", "cacheWrite", "input"]);
  });

  it("per-branch series count only the kind's tokens and cost", () => {
    const details = Object.values(mock.details),
      unpriced = unpricedModels(details),
      all = dailySeries(mock.sessions, mock.details, range, {}, unpriced).seriesByBranch;
    const total = (list: typeof all, m: "tokens" | "cost") => list.reduce((n, s) => n + seriesTotal(s, m), 0);
    let tokens = 0,
      cost = 0;
    for (const [kind] of tokenKinds) {
      const only = dailySeries(mock.sessions, mock.details, range, { tokenKind: kind }, unpriced).seriesByBranch;
      tokens += total(only, "tokens");
      cost += total(only, "cost");
    }
    // The four kinds add up to the unfiltered figures.
    expect(tokens).toBe(total(all, "tokens"));
    expect(cost).toBeCloseTo(total(all, "cost"), 6);
    expect(total(all, "tokens")).toBeGreaterThan(0);
  });

  it("Por proveedor/modelo/proyecto count only the kind, also under a model filter", async () => {
    const model = mock.sessions.find((s) => s.models.length)!.models[0];
    for (const filter of [{}, { model }]) {
      const plain = await getMetrics(range, undefined, undefined, filter.model);
      for (const [key] of tokenKinds) {
        const kinded = await getMetrics(range, undefined, undefined, filter.model, undefined, undefined, kindArg(key));
        for (const group of ["provider", "model", "project"] as const) {
          const trend = dailyTrend(kinded, range, group, "tokens", palette, { tokenKind: key });
          expect(trendSum(trend.data, trend.series)).toBe(kinded.totals.usage[key]);
          expect(trendSum(trend.data, trend.series)).toBe(plain.totals.usage[key]);
        }
      }
    }
  });

  it("every token and cost figure of Resumen follows the kind; a note explains the rest", async () => {
    const client = createQueryClient(),
      router = createMemoryRouter(createRoutes(client), {
        initialEntries: [`/resumen?from=${range.from}&to=${range.to}&tokens=cacheReadTokens`],
      });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await screen.findAllByText("Costo · Lectura de caché", undefined, { timeout: 20_000 });
    const [kinded, plain] = await Promise.all([
      getMetrics(range, undefined, undefined, undefined, undefined, undefined, "cacheRead"),
      getMetrics(range),
    ]);
    expect(kinded.totals.costUsd).toBeCloseTo(plain.totals.costBreakdown.cacheRead, 6);
    expect(kinded.totals.costUsd).toBeLessThan(costOf(plain.totals.costBreakdown));
    expect(screen.getAllByText(usd(kinded.totals.costUsd)).length).toBeGreaterThan(0);
    expect(screen.getByText(/Costo y tokens cuentan solo lectura de caché/)).toBeTruthy();
    // Sessions keep their count.
    expect(kinded.totals.sessions).toBe(plain.totals.sessions);
    // The token bar keeps every kind, to switch between them.
    expect(screen.getAllByRole("button", { name: /^Salida / }).length).toBeGreaterThan(0);
    // Por proyecto: the top project's cost is its cache-read cost.
    const top = kinded.byProject[0];
    expect(within(panel("Por proyecto")).getAllByText(usd(top.costUsd)).length).toBeGreaterThan(0);
    expect(totalTok(top.usage)).toBe(top.usage.cacheReadTokens);
  });
});
