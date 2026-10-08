/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { describe, expect, it, vi } from "vitest";
import { getMetrics } from "../../api";
import { createQueryClient } from "../../app/queries";
import { createRoutes } from "../../app/routes";
import type { DateRange } from "../../bindings/DateRange";
import { dayCount, localDay, resolveRange } from "../../lib/dates";
import { dayLabel, usd } from "../../lib/format";
import { mock } from "../../test/fixtures";

// The project dashboard is Resumen scoped to one project: same components, same filters.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

const project = mock.sessions.find((s) => s.subagentCount > 0)!.projectKey;
/** The metrics of one project (contract v2.5 `projectKey`). */
const projectMetrics = (range: DateRange, key: string) =>
  getMetrics(range, undefined, undefined, undefined, undefined, undefined, undefined, key);
function renderProject(search = "", path = "/proyecto/" + encodeURIComponent(project)) {
  const client = createQueryClient(),
    router = createMemoryRouter(createRoutes(client), {
      initialEntries: [path + search],
    });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
const params = (router: ReturnType<typeof renderProject>) =>
  new URLSearchParams(router.state.location.search);
const ready = () => screen.findAllByText("Costo estimado", undefined, { timeout: 20_000 });
const panel = (title: string) => screen.getByRole("heading", { name: title }).closest("section")!;

describe("Proyecto reuses the Resumen dashboard", { timeout: 30_000 }, () => {
  it("reads the backend metrics scoped to the project", async () => {
    renderProject();
    await ready();
    const range = resolveRange({}, mock.sessions),
      expected = await projectMetrics(range, project);
    expect(screen.getAllByText(usd(expected.totals.costUsd)).length).toBeGreaterThan(0);
    // The project is the scope, not a removable filter.
    expect(screen.queryByRole("region", { name: "Filtros activos" })).toBeNull();
    expect(await screen.findByText("Archivos más tocados", undefined, { timeout: 10_000 })).toBeTruthy();
  });

  it("a model row filters the project page; the chip removes it", async () => {
    const model = mock.sessions.find((s) => s.projectKey === project)!.models[0];
    const router = renderProject("?modelo=" + encodeURIComponent(model));
    await ready();
    const row = (await within(panel("Por modelo")).findAllByRole("row")).find((r) =>
      r.hasAttribute("data-selected"),
    )!;
    expect(row).toBeTruthy();
    const chip = await screen.findByRole("button", { name: /Quitar filtro Modelo/ }, { timeout: 10_000 });
    fireEvent.click(chip);
    await waitFor(() => expect(params(router).has("modelo")).toBe(false));
    expect(router.state.location.pathname).toBe("/proyecto/" + encodeURIComponent(project));
  });

  it("heatmap cells and token kinds are cross-filters too", async () => {
    const router = renderProject();
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: /^Salida / })[0]);
    await waitFor(() => expect(params(router).get("tokens")).toBe("outputTokens"));
    const cell = within(panel("Uso por hora")).getAllByRole("button", { name: /^lun 0?\d/ })[0];
    fireEvent.click(cell);
    await waitFor(() => expect(params(router).get("diasem")).toBe("0"));
    expect(screen.queryByRole("button", { name: /Quitar filtro Proyecto/ })).toBeNull();
  });

  it("groups the daily chart by branch instead of by project", async () => {
    renderProject();
    await ready();
    const chart = within(
      (await screen.findByRole("heading", { name: "Por día" }, { timeout: 10_000 })).closest("section")!,
    );
    expect(chart.getByRole("button", { name: "Por rama" })).toBeTruthy();
    expect(chart.queryByRole("button", { name: "Por proyecto" })).toBeNull();
  });
});

describe("Todo on a project with little history", { timeout: 30_000 }, () => {
  // Its first session comes days after the app's first recorded day.
  const late = mock.sessions
    .filter((s) => s.projectKey !== project)
    .map((s) => s.projectKey)
    .find((p) => {
      const first = (q: string) =>
        mock.sessions.filter((s) => !q || s.projectKey === q).map((s) => localDay(s.startedAt)).sort()[0];
      return first(p) > first("");
    })!;

  it("spans the chart and the per-day averages over the project's days with data", async () => {
    const client = createQueryClient(),
      router = createMemoryRouter(createRoutes(client), {
        initialEntries: ["/proyecto/" + encodeURIComponent(late)],
      });
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await ready();
    const metrics = await projectMetrics(resolveRange({}, mock.sessions), late);
    const active = metrics.byDay.filter((d) => d.sessions || d.costUsd).map((d) => d.date),
      [first, last] = [active[0], active[active.length - 1]];
    const chart = within(
      (await screen.findByRole("heading", { name: "Por día" }, { timeout: 10_000 })).closest("section")!,
    );
    fireEvent.click(chart.getByRole("button", { name: "Días ▾" }));
    const days = within(await screen.findByRole("dialog", { name: "Días del rango" })).getAllByRole("button");
    expect(days[0].textContent).toContain(dayLabel(last));
    expect(days[days.length - 1].textContent).toContain(dayLabel(first));
    const perDay = usd(metrics.totals.costUsd / dayCount({ from: first, to: last }));
    expect(screen.getAllByText((text) => text.includes(`${perDay} / día`)).length).toBeGreaterThan(0);
  });
});
