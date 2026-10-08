/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../app/queries";
import { createRoutes } from "../../app/routes";

// The v2.3 filter audit: every clickable element of Resumen either applies a filter (in the
// URL, removable from a chip, cleared by clicking it again) or is not interactive.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

function renderAt(path: string) {
  const client = createQueryClient(),
    router = createMemoryRouter(createRoutes(client), { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
const RANGE = "?from=2026-09-01&to=2026-10-04";
const params = (router: ReturnType<typeof renderAt>) =>
  new URLSearchParams(router.state.location.search);
const ready = () => screen.findAllByText("Costo estimado", undefined, { timeout: 20_000 });
const panel = (title: string) => screen.getByRole("heading", { name: title }).closest("section")!;
/** The daily chart loads lazily, after the rest of the page. */
const chartPanel = async () =>
  within(
    (await screen.findByRole("heading", { name: "Por día" }, { timeout: 10_000 })).closest("section")!,
  );
const chip = (name: RegExp) =>
  screen.findByRole("button", { name }, { timeout: 10_000 });
/**
 * Waits until the page has settled on the URL: its weekday/hour chips match it, no section is
 * loading and nothing shows the previous filter's data (`data-stale`). React Router updates
 * `router.state` first and renders the new URL in a transition, so under load the DOM (and
 * the click handlers, which close over the rendered URL) lag behind it; and a slot filter
 * then loads its sessions, which may swap the page for the "no sessions" state. A click
 * before this acts on the previous URL (dropping the filter just applied) or on an element
 * about to be replaced.
 */
const slotShown = (router: ReturnType<typeof renderAt>) =>
  waitFor(
    () => {
      const p = params(router),
        has = (name: RegExp) => !!screen.queryByRole("button", { name });
      expect(has(/^Quitar filtro Día de semana/)).toBe(p.has("diasem"));
      expect(has(/^Quitar filtro Hora/)).toBe(p.has("hora"));
      expect(document.querySelector('[aria-busy="true"], [data-stale]')).toBeNull();
    },
    { timeout: 10_000 },
  );

describe("Resumen filter audit (v2.3)", { timeout: 30_000 }, () => {
  it("a heatmap cell filters by weekday and hour; again clears both", async () => {
    const router = renderAt("/resumen" + RANGE);
    await ready();
    const cell = within(panel("Uso por hora")).getByRole("button", { name: /^mar 12:00/ });
    fireEvent.click(cell);
    await waitFor(() => expect(params(router).get("diasem")).toBe("1"));
    expect(params(router).get("hora")).toBe("12");
    expect(await chip(/Quitar filtro Día de semana: mar/)).toBeTruthy();
    expect(await chip(/Quitar filtro Hora: 12:00/)).toBeTruthy();
    await waitFor(() =>
      expect(
        within(panel("Uso por hora"))
          .getByRole("button", { name: /^mar 12:00/ })
          .getAttribute("aria-pressed"),
      ).toBe("true"),
    );
    // The grid keeps the rest of the week to pick another slot from.
    await waitFor(() =>
      expect(
        within(panel("Uso por hora"))
          .getAllByRole("button", { name: / · [1-9][\d.]* mensajes/ }).length,
      ).toBeGreaterThan(1),
    );
    fireEvent.click(within(panel("Uso por hora")).getByRole("button", { name: /^mar 12:00/ }));
    await waitFor(() => expect(params(router).has("diasem")).toBe(false));
    expect(params(router).has("hora")).toBe(false);
  });

  it("weekday and hour labels filter by themselves", async () => {
    const router = renderAt("/resumen" + RANGE);
    await ready();
    const heat = within(panel("Uso por hora"));
    fireEvent.click(heat.getByRole("button", { name: "jue" }));
    await waitFor(() => expect(params(router).get("diasem")).toBe("3"));
    expect(params(router).has("hora")).toBe(false);
    await slotShown(router);
    fireEvent.click(heat.getByRole("button", { name: "Filtrar por la hora 15:00" }));
    await waitFor(() => expect(params(router).get("hora")).toBe("15"));
    expect(params(router).get("diasem")).toBe("3");
    await slotShown(router);
    // The chip removes one of them.
    fireEvent.click(await chip(/Quitar filtro Hora/));
    await waitFor(() => expect(params(router).has("hora")).toBe(false));
  });

  it("a tool row filters the whole page by its tool", async () => {
    const router = renderAt("/resumen" + RANGE);
    await ready();
    const row = within(panel("Herramientas más usadas")).getAllByRole("row")[1];
    const name = row.querySelector("a")!.textContent!;
    fireEvent.click(row);
    await waitFor(() => expect(params(router).get("herramienta")).toBe(name));
    expect(await screen.findByText("Llamadas · " + name)).toBeTruthy();
    // The table then holds only that tool's row (contract v2.6).
    await waitFor(() => expect(within(panel("Herramientas más usadas")).getAllByRole("row")).toHaveLength(2));
    // Its name still opens Herramientas instead of filtering.
    expect(row.querySelector("a")!.getAttribute("href")).toContain("/herramientas?tool=");
    fireEvent.click(await chip(/Quitar filtro Herramienta/));
    await waitFor(() => expect(params(router).has("herramienta")).toBe(false));
  });

  it("chart legend entries filter; the folded Resto is plain text", async () => {
    const router = renderAt("/resumen" + RANGE);
    await ready();
    const chart = await chartPanel();
    fireEvent.click(chart.getByRole("button", { name: "Por modelo", pressed: false }));
    // (The legend lays its entries out twice: a hidden copy measures them.)
    const rest = await chart.findAllByText(/^Resto · \d+ modelos$/);
    expect(rest.every((e) => !e.closest("button"))).toBe(true);
    fireEvent.click(chart.getByRole("button", { name: "Sol 5.6" }));
    await waitFor(() => expect(params(router).get("modelo")).toBe("gpt-5.6-sol"));
  });

  it("a Por proveedor legend entry filters by provider", async () => {
    const router = renderAt("/resumen" + RANGE);
    await ready();
    const chart = await chartPanel();
    // Por proveedor is the default with two providers.
    fireEvent.click(chart.getByRole("button", { name: "Codex" }));
    await waitFor(() => expect(params(router).get("proveedor")).toBe("codex"));
  });

  it("a Por modelo bar segment filters by its model", async () => {
    const router = renderAt("/resumen" + RANGE);
    await ready();
    const bar = panel("Por modelo").querySelector("[aria-label] > div")!;
    const segment = bar.children[0] as HTMLElement;
    fireEvent.mouseEnter(segment);
    const tip = await within(panel("Por modelo")).findByRole("tooltip");
    expect(tip.textContent).toMatch(/US\$/);
    expect(tip.textContent).toMatch(/filtrar el resumen por este modelo/);
    fireEvent.click(segment);
    await waitFor(() => expect(params(router).has("modelo")).toBe(true));
  });

  it("the project panel never folds projects into Resto", async () => {
    renderAt("/resumen" + RANGE);
    await ready();
    const rows = within(panel("Por proyecto")).getAllByRole("row").slice(1);
    // The sample has 5 projects; jsdom measures nothing, so every one is listed.
    expect(rows).toHaveLength(5);
    expect(within(panel("Por proyecto")).queryByText(/^Resto ·/)).toBeNull();
  });
});

describe("Back and forward", { timeout: 30_000 }, () => {
  it("are disabled at either end and restore the filters", async () => {
    const router = renderAt("/resumen" + RANGE);
    await ready();
    const back = screen.getByRole("button", { name: "Atrás" }),
      forward = screen.getByRole("button", { name: "Adelante" });
    expect(back).toHaveProperty("disabled", true);
    expect(forward).toHaveProperty("disabled", true);
    fireEvent.click(within(panel("Uso por hora")).getByRole("button", { name: "jue" }));
    await waitFor(() => expect(params(router).get("diasem")).toBe("3"));
    await waitFor(() => expect(back).toHaveProperty("disabled", false));
    fireEvent.click(back);
    await waitFor(() => expect(params(router).has("diasem")).toBe(false));
    await slotShown(router);
    await waitFor(() => expect(forward).toHaveProperty("disabled", false));
    expect(back).toHaveProperty("disabled", true);
    // Alt+→ goes forward again; Alt+← back.
    fireEvent.keyDown(window, { key: "ArrowRight", altKey: true });
    await waitFor(() => expect(params(router).get("diasem")).toBe("3"));
    await slotShown(router);
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    await waitFor(() => expect(params(router).has("diasem")).toBe(false));
    await slotShown(router);
    // The mouse's forward button (4) steps on release.
    fireEvent.mouseUp(window, { button: 4 });
    await waitFor(() => expect(params(router).get("diasem")).toBe("3"));
  });

  it("a new filter drops the forward entries", async () => {
    const router = renderAt("/resumen" + RANGE);
    await ready();
    const heat = () => within(panel("Uso por hora"));
    fireEvent.click(heat().getByRole("button", { name: "jue" }));
    await waitFor(() => expect(params(router).get("diasem")).toBe("3"));
    await slotShown(router);
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    await waitFor(() => expect(params(router).has("diasem")).toBe(false));
    await slotShown(router);
    fireEvent.click(heat().getByRole("button", { name: "vie" }));
    await waitFor(() => expect(params(router).get("diasem")).toBe("4"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Adelante" })).toHaveProperty("disabled", true),
    );
  });
});
