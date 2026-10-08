/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupBucket } from "../../../bindings/GroupBucket";
import { palette } from "../../../lib/colors";
import { mock } from "../../../test/fixtures";
import { fitRows, ProjectsBreakdown, rankProjects } from "./ProjectsBreakdown";

const group = (key: string, costUsd: number) =>
  ({ ...mock.metrics.byProject[0], key, label: key.toUpperCase(), costUsd }) as GroupBucket;
const groups = Array.from({ length: 30 }, (_, i) => group("p" + i, 30 - i));

describe("fitRows", () => {
  it("fits whole rows below the chrome, between one and every row", () => {
    expect(fitRows(467, 80, 30, 50)).toBe(12);
    expect(fitRows(467, 80, 30, 5)).toBe(5);
    expect(fitRows(60, 80, 30, 5)).toBe(1);
    // Nothing measured yet: every row.
    expect(fitRows(0, 0, 0, 7)).toBe(7);
  });
});

describe("rankProjects", () => {
  it("orders by the selected metric's series, else by cost", () => {
    const series = [
      { key: "p0", label: "P0", points: [] },
      { key: "p1", label: "P1", points: [{ date: "2026-10-01", costUsd: 0, tokens: 9, activeMs: 0, sessions: 1, toolCalls: 0, messages: 1 }] },
    ];
    expect(rankProjects(groups.slice(0, 2), series, "tokens")[0].key).toBe("p1");
    expect(rankProjects(groups.slice(0, 2), undefined, "tokens")[0].key).toBe("p0");
  });
});

/** Lays out the panel like a browser: a 40 px header + table head, 30 px rows, 8 px below. */
function fakeLayout(matchHeight: number) {
  const rect = (top: number, height: number) =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.dataset.match) return rect(0, matchHeight);
    const rows = this.closest("section")?.querySelectorAll("tbody tr").length ?? 0;
    if (this.tagName === "TBODY") return rect(40, rows * 30);
    if (this.tagName === "SECTION") return rect(0, 40 + rows * 30 + 8);
    return rect(0, 40 + rows * 30 + 8); // the content block
  });
}

function renderPanel(match: HTMLElement | null) {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <ProjectsBreakdown groups={groups} colors={palette(mock.sessions)} match={match} />,
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("ProjectsBreakdown", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows as many projects as fit beside Por modelo, largest first, without Resto", () => {
    fakeLayout(40 + 10 * 30 + 8);
    const match = document.createElement("div");
    match.dataset.match = "1";
    renderPanel(match);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(10);
    expect(within(rows[0]).getByText("P0")).toBeTruthy();
    expect(within(rows[9]).getByText("P9")).toBeTruthy();
    expect(screen.queryByText(/Resto/)).toBeNull();
    expect(screen.getByRole("link", { name: "Ver todos (30) →" })).toBeTruthy();
  });

  it("follows the neighbour when it grows (rows expanded, a resize)", () => {
    fakeLayout(40 + 4 * 30 + 8);
    const match = document.createElement("div");
    match.dataset.match = "1";
    const { rerender } = renderPanel(match);
    expect(screen.getAllByRole("row")).toHaveLength(5);
    fakeLayout(40 + 15 * 30 + 8);
    const grown = document.createElement("div");
    grown.dataset.match = "1";
    rerender(
      <RouterProvider
        router={createMemoryRouter(
          [{ path: "/", element: <ProjectsBreakdown groups={groups} colors={palette(mock.sessions)} match={grown} /> }],
          { initialEntries: ["/"] },
        )}
      />,
    );
    expect(screen.getAllByRole("row")).toHaveLength(16);
  });

  it("shows every project when there is no neighbour to match", () => {
    renderPanel(null);
    expect(screen.getAllByRole("row")).toHaveLength(31);
  });
});
