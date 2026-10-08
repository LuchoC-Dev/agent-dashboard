/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/queries";
import { createRoutes } from "../../app/routes";
import { mock } from "../../test/fixtures";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

function renderResumen(search = "") {
  const client = createQueryClient(),
    router = createMemoryRouter(createRoutes(client), {
      initialEntries: ["/resumen" + search],
    });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
const params = (router: ReturnType<typeof renderResumen>) =>
  new URLSearchParams(router.state.location.search);
const ready = () => screen.findAllByText("Costo estimado", undefined, { timeout: 20_000 });
const panel = (title: string) =>
  screen.getByRole("heading", { name: title }).closest("section")!;

describe("Resumen cross-filtering", { timeout: 30_000 }, () => {
  it("a project row filters the page via the URL; clicking it again clears it", async () => {
    const router = renderResumen();
    await ready();
    const row = within(panel("Por proyecto")).getAllByRole("row")[1];
    fireEvent.click(row);
    await waitFor(() => expect(params(router).get("proyecto")).toBeTruthy());
    const chips = await screen.findByRole("region", { name: "Filtros activos" }, { timeout: 10_000 });
    expect(within(chips).getByRole("button", { name: /Quitar filtro Proyecto/ })).toBeTruthy();
    // Only that project is left in the table, marked as the active filter.
    // Previous data stays on screen until the filtered metrics arrive.
    await waitFor(
      () => expect(within(panel("Por proyecto")).getAllByRole("row")).toHaveLength(2),
      { timeout: 10_000 },
    );
    const filteredRows = within(panel("Por proyecto")).getAllByRole("row");
    expect(filteredRows[1].hasAttribute("data-selected")).toBe(true);
    fireEvent.click(filteredRows[1]);
    await waitFor(() => expect(params(router).has("proyecto")).toBe(false));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Filtros activos" })).toBeNull(),
    );
  });

  it("rows are keyboard-activatable", async () => {
    const router = renderResumen();
    await ready();
    const row = within(panel("Por proyecto")).getAllByRole("row")[1];
    expect(row.tabIndex).toBe(0);
    fireEvent.keyDown(row, { key: "Enter" });
    await waitFor(() => expect(params(router).has("proyecto")).toBe(true));
  });

  it("a KPI provider line filters by provider, and is not nested in the tile's button", async () => {
    const router = renderResumen();
    await ready();
    const line = screen.getAllByRole("button", { name: /^Codex US\$/ })[0];
    expect(line.parentElement!.closest("button")).toBeNull();
    fireEvent.click(line);
    await waitFor(() => expect(params(router).get("proveedor")).toBe("codex"));
  });

  it("a token kind counts only those tokens; the chip removes it", async () => {
    const router = renderResumen();
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: /^Salida / })[0]);
    await waitFor(() => expect(params(router).get("tokens")).toBe("outputTokens"));
    expect(await screen.findByText("Tokens · Salida", undefined, { timeout: 10_000 })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Quitar filtro Tokens: Salida/ }));
    await waitFor(() => expect(params(router).has("tokens")).toBe(false));
  });

  it("a model row filters by model and opens its family", async () => {
    const model = mock.sessions.find((s) => s.provider === "claude")!.models[0];
    const router = renderResumen("?modelo=" + encodeURIComponent(model));
    await ready();
    const row = (await within(panel("Por modelo")).findAllByRole("row")).find((r) =>
      r.hasAttribute("data-selected"),
    )!;
    expect(row).toBeTruthy();
    fireEvent.click(row);
    await waitFor(() => expect(params(router).has("modelo")).toBe(false));
  });

  it("a day filter keeps the range for the chart and is cleared with the range", async () => {
    const day = mock.sessions.map((s) => s.startedAt).sort()[0].slice(0, 10);
    const router = renderResumen("?dia=" + day);
    await ready();
    expect(screen.getByRole("button", { name: /Quitar filtro Día/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "7 días" }));
    await waitFor(() => expect(params(router).has("dia")).toBe(false));
  });
});
