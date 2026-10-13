/** @vitest-environment jsdom */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getMetrics } from "../../api";
import { resolveRange } from "../../lib/dates";
import { usd } from "../../lib/format";
import { tokenKinds } from "../../lib/usage";
import { mock } from "../../test/fixtures";
import { dashboardReady, panelOf, renderApp, searchOf } from "../../test/render";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

// jsdom has no layout: give the chart a width so Recharts draws.
let width: PropertyDescriptor | undefined;
beforeAll(() => {
  width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
});
afterAll(() => {
  if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
});

const range = resolveRange({}, mock.sessions),
  all = `?from=${range.from}&to=${range.to}`,
  labels = tokenKinds.map(([, l]) => l);
/** "US$ 1.234,56" → 123456 cents. */
const cents = (text: string) => Number(text.replace(/[^\d]/g, ""));
/** The cost tile: its shown total and each kind's legend entry. */
function costTile() {
  const tile = screen.getAllByText(/^Costo /)[0].closest(".kpi") as HTMLElement;
  const total = tile.querySelector(".kpi-main")!.children[1].textContent!.replace("*", "").trim();
  const entries = labels.map(
    (l) => [...tile.querySelectorAll("button, span")].find((e) => e.textContent!.startsWith(l + " US$"))!,
  );
  return { tile, total, entries, parts: entries.map((e) => cents(e.textContent!.slice(e.textContent!.indexOf("US$")))) };
}
const sum = (parts: number[]) => parts.reduce((n, p) => n + p, 0);

describe("cost split by token kind (v2.8)", { timeout: 30_000 }, () => {
  it("Resumen: the cost tile splits its total by kind, summing to it; providers stay", async () => {
    renderApp("/resumen" + all);
    await dashboardReady();
    const plain = await getMetrics(range);
    const { tile, total, entries, parts } = costTile();
    expect(total).toBe(usd(plain.totals.costUsd));
    expect(entries.every(Boolean)).toBe(true);
    expect(sum(parts)).toBe(cents(total));
    // Same order and colors as the token bar.
    expect(tile.querySelector('[aria-label^="Lectura"]')?.getAttribute("aria-label")).toMatch(
      /^Lectura de caché: US\$ .*, Salida: .*, Escritura de caché: .*, Entrada: /,
    );
    // The provider split is still there.
    expect(within(tile).getByRole("button", { name: /^Claude US\$/ })).toBeTruthy();
  });

  it("Resumen: a kind in the cost tile applies the token-kind filter", async () => {
    const router = renderApp("/resumen" + all);
    await dashboardReady();
    fireEvent.click(within(costTile().tile).getByRole("button", { name: /^Salida US\$/ }));
    await waitFor(() => expect(searchOf(router).get("tokens")).toBe("outputTokens"));
  });

  it("Resumen: under a kind the bar keeps every kind, the selected one marked", async () => {
    const router = renderApp("/resumen" + all + "&tokens=cacheReadTokens");
    await screen.findAllByText("Costo · Lectura de caché", undefined, { timeout: 20_000 });
    const [kinded, plain] = await Promise.all([getMetrics(range, undefined, undefined, undefined, undefined, undefined, "cacheRead"), getMetrics(range)]);
    let tile!: ReturnType<typeof costTile>;
    await waitFor(() => {
      tile = costTile();
      expect(tile.entries.every(Boolean)).toBe(true);
    });
    expect(tile.total).toBe(usd(kinded.totals.costUsd));
    expect(tile.entries.map((e) => e.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false"]);
    // Every kind's cost, adding up to the unfiltered total.
    expect(sum(tile.parts)).toBe(cents(usd(plain.totals.costUsd)));
    // Clicking the active kind clears it.
    fireEvent.click(tile.entries[0]);
    await waitFor(() => expect(searchOf(router).get("tokens")).toBeNull());
  });

  it("the project page reuses the cost tile and its filter", async () => {
    const project = mock.sessions.find((s) => s.subagentCount > 0)!.projectKey;
    const router = renderApp("/proyecto/" + encodeURIComponent(project) + all);
    await dashboardReady();
    const { total, parts, entries } = costTile();
    expect(sum(parts)).toBe(cents(total));
    fireEvent.click(entries[3]);
    await waitFor(() => expect(searchOf(router).get("tokens")).toBe("inputTokens"));
    expect(router.state.location.pathname).toBe("/proyecto/" + encodeURIComponent(project));
  });

  it("Por día, Costo · Total stacks the kinds; a legend entry filters by its kind", async () => {
    const router = renderApp("/resumen" + all);
    await dashboardReady();
    const chart = await waitFor(() => panelOf("Por día"));
    await act(async () => {
      fireEvent.click(within(chart).getByRole("button", { name: "Total" }));
    });
    const legend = labels.map((l) => within(chart).getByRole("button", { name: l }));
    expect(legend).toHaveLength(4);
    fireEvent.click(legend[2]);
    await waitFor(() => expect(searchOf(router).get("tokens")).toBe("cacheCreationTokens"));
  });

  it("session detail: the cost tile splits the session (main + subagents) the same way", async () => {
    const s = [...mock.sessions].sort((a, b) => b.costUsd - a.costUsd).find((x) => x.subagentCount > 0)!;
    renderApp("/sesion/" + s.id);
    await dashboardReady();
    const { total, parts, entries } = costTile();
    expect(total).toBe(usd(s.costUsd));
    expect(sum(parts)).toBe(cents(total));
    // Not a filter there: plain legend entries.
    expect(entries.every((e) => e.tagName === "SPAN")).toBe(true);
  });
});
