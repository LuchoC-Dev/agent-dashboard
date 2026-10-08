/** @vitest-environment jsdom */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { palette } from "../../lib/colors";
import { addDays } from "../../lib/dates";
import { mock } from "../../test/fixtures";
import { DailyTrendChart } from "./components/DailyTrendChart";

// jsdom has no layout: give the plot a width so Recharts draws.
let width: PropertyDescriptor | undefined;
beforeAll(() => {
  width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
});
afterAll(() => {
  if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
});

const from = "2026-09-08",
  days = Array.from({ length: 30 }, (_, i) => addDays(from, i)),
  range = { from, to: days[29] };
const series = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({
    key: `/${prefix}/${i}`,
    label: `${prefix}-${i}`,
    // Every other day; project i costs i + 1 per day, so the last one is the largest.
    points: days
      .filter((_, d) => (d + i) % 2 === 0)
      .map((date) => ({ date, costUsd: i + 1, tokens: 10, activeMs: 10, sessions: 1, toolCalls: 1, messages: 1 })),
  }));

describe("Por proyecto in the daily chart", () => {
  it("draws every project, without Resto, with the legend largest first", async () => {
    const onFilter = vi.fn();
    const source = { byDay: [], seriesByProvider: series(2, "prov"), seriesByModel: [], seriesByProject: series(40, "proj") };
    const { container } = render(
      <MemoryRouter>
        <DailyTrendChart
          source={source}
          range={range}
          colors={palette(mock.sessions)}
          metric="cost"
          onMetric={() => {}}
          onFilter={onFilter}
        />
      </MemoryRouter>,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Por proyecto" }));
    });
    // 40 projects × 15 days each: one rectangle per non-empty segment.
    expect(container.querySelectorAll(".seg")).toHaveLength(600);
    expect(container.textContent).not.toMatch(/Resto/);
    const legend = [...container.querySelectorAll("button[aria-pressed]")].filter((b) =>
      /^proj-/.test(b.textContent!),
    );
    expect(legend[0].textContent).toBe("proj-39");
    // Each segment's height is its share of the day's bar.
    const day0 = [...container.querySelectorAll(".d-0")] as SVGElement[];
    const heights = day0.map((r) => Number(r.getAttribute("height")) || 0);
    expect(heights.filter((h) => h > 0).length).toBeGreaterThan(1);
    // A click on a segment filters by its project.
    fireEvent.click(day0[0]);
    expect(onFilter).toHaveBeenCalledWith("project", expect.stringMatching(/^\/proj\//));
  });
});
