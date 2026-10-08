/** @vitest-environment jsdom */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getMetrics } from "../../api";
import { palette } from "../../lib/colors";
import { resolveRange } from "../../lib/dates";
import { modelArgs } from "../../lib/filters";
import { usd } from "../../lib/format";
import { familyFilter, parseModel } from "../../lib/models";
import { mock } from "../../test/fixtures";
import { dashboardReady, panelOf, renderApp, searchOf } from "../../test/render";
import type { TrendSeries } from "./daily-trend";
import { withFamilies } from "./components/DailyTrendChart";

// Contract v2.5: a family click filters by every version of it (`models`), a version keeps `model`.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

const colors = palette(mock.sessions),
  opus = colors.models.filter((m) => parseModel(m).family === "opus");

describe("model family click-to-filter", { timeout: 30_000 }, () => {
  it("a family value becomes every version of it for the commands", () => {
    expect(opus.length).toBeGreaterThan(1);
    expect(modelArgs(familyFilter("opus"), colors.models)).toEqual({ model: null, models: opus });
    expect(modelArgs(opus[0], colors.models)).toEqual({ model: opus[0], models: null });
    expect(modelArgs(null, colors.models)).toEqual({ model: null, models: null });
  });

  it("the chart legend puts a family entry before its first version", () => {
    const series = colors.models.map((m) => ({ key: m, label: m, color: "", value: m }) as TrendSeries);
    const entries = withFamilies(
      series.map((s) => ({ key: s.key, label: s.label, color: s.color })),
      series,
      colors,
      familyFilter("opus"),
    );
    const at = entries.findIndex((e) => e.key === familyFilter("opus"));
    expect(entries[at]).toMatchObject({ label: "Opus (todas)", pressed: true });
    expect(entries[at + 1].key).toBe(opus[0]);
    expect(entries.filter((e) => e.key.startsWith("familia:")).length).toBeGreaterThan(0);
  });

  it("a family row filters Resumen by the whole family; the chip reads Familia: Opus", async () => {
    const router = renderApp("/resumen");
    await dashboardReady();
    const row = within(panelOf("Por modelo")).getByTitle("Filtrar el resumen por toda la familia Opus");
    fireEvent.click(row);
    await waitFor(() => expect(searchOf(router).get("modelo")).toBe("familia:opus"), { timeout: 10_000 });
    const chip = await screen.findByRole("button", { name: "Quitar filtro Familia: Opus" }, { timeout: 10_000 });
    const expected = await getMetrics(
      resolveRange({}, mock.sessions),
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, opus,
    );
    await waitFor(() => expect(screen.getAllByText(usd(expected.totals.costUsd)).length).toBeGreaterThan(0), {
      timeout: 10_000,
    });
    fireEvent.click(chip);
    await waitFor(() => expect(searchOf(router).has("modelo")).toBe(false));
  });

  it("the family's expander still only expands it", async () => {
    const router = renderApp("/resumen");
    await dashboardReady();
    const row = within(panelOf("Por modelo")).getByTitle("Filtrar el resumen por toda la familia Opus");
    fireEvent.click(within(row).getByRole("button", { expanded: false }));
    expect(within(row).getByRole("button", { expanded: true })).toBeTruthy();
    expect(searchOf(router).has("modelo")).toBe(false);
  });

  it("the chart legend's family entry filters by the family", async () => {
    const router = renderApp("/resumen");
    await dashboardReady();
    const chart = within(panelOf("Por día"));
    fireEvent.click(chart.getByRole("button", { name: "Por modelo" }));
    fireEvent.click(await chart.findByRole("button", { name: "Opus (todas)" }, { timeout: 10_000 }));
    await waitFor(() => expect(searchOf(router).get("modelo")).toBe("familia:opus"));
  });

  it("a single version keeps the model filter", async () => {
    const router = renderApp("/resumen?modelo=" + encodeURIComponent(opus[0]));
    await dashboardReady();
    expect(
      await screen.findByRole("button", { name: `Quitar filtro Modelo: ${parseModel(opus[0]).name}` }, { timeout: 10_000 }),
    ).toBeTruthy();
    expect(searchOf(router).get("modelo")).toBe(opus[0]);
  });
});
