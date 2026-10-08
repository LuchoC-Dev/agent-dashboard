/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../../../bindings/SessionSummary";
import { palette } from "../../../lib/colors";
import { toolCounts, withToolCounts } from "../../../lib/sessions";
import { mock } from "../../../test/fixtures";
import { SessionsTable } from "./SessionsTable";

// Three sessions whose all-tools and one-tool orders disagree.
const [a, b, c] = mock.sessions;
const counts = [
  [a, 90, 3, 1, 0],
  [b, 10, 0, 7, 2],
  [c, 50, 1, 4, 1],
] as const;
const sessions = counts.map(
  ([s, calls, errors, filtered, filteredErrors], i): SessionSummary => ({
    ...s,
    title: "Sesión " + i,
    toolCallCount: calls,
    toolErrorCount: errors,
    filteredToolCalls: filtered,
    filteredToolErrors: filteredErrors,
  }),
);

function table(tool?: string) {
  render(
    <MemoryRouter>
      <SessionsTable sessions={sessions} colors={palette(mock.sessions)} tool={tool} />
    </MemoryRouter>,
  );
  const header = screen.getAllByRole("columnheader"),
    col = header.findIndex((h) => h.textContent!.startsWith(tool ?? "Herram."));
  const cells = () =>
    screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => [r.textContent!.match(/Sesión \d/)![0], within(r).getAllByRole("cell")[col].textContent]);
  return { header: header[col], cells };
}

describe("session tool column (contract v2.6.1)", () => {
  it("without a tool filter: every tool's calls, named Herram.", () => {
    const { header, cells } = table();
    expect(header.textContent).toBe("Herram.");
    fireEvent.click(within(header).getByRole("button"));
    expect(cells()).toEqual([
      ["Sesión 0", "90 · ⊗ 3"],
      ["Sesión 2", "50 · ⊗ 1"],
      ["Sesión 1", "10"],
    ]);
  });

  it("under a tool filter: that tool's calls and errors, sorted by them, named after it", () => {
    const { header, cells } = table("Bash");
    expect(header.textContent).toBe("Bash");
    expect(screen.queryByText("Herram.")).toBeNull();
    fireEvent.click(within(header).getByRole("button"));
    expect(cells()).toEqual([
      ["Sesión 1", "7 · ⊗ 2"],
      ["Sesión 2", "4 · ⊗ 1"],
      ["Sesión 0", "1"],
    ]);
    fireEvent.click(within(header).getByRole("button"));
    expect(cells().map(([t]) => t)).toEqual(["Sesión 0", "Sesión 2", "Sesión 1"]);
  });

  it("toolCounts falls back to zero when the list carries no filtered counts", () => {
    expect(toolCounts(a, "Bash")).toEqual({ calls: 0, errors: 0 });
    expect(toolCounts(a)).toEqual({ calls: a.toolCallCount, errors: a.toolErrorCount });
  });

  it("withToolCounts keeps the narrowed sessions, in order, with their filtered counts", () => {
    const narrowed = [sessions[2], sessions[0]];
    const out = withToolCounts([a, b, c], narrowed);
    expect(out.map((s) => s.id)).toEqual([a.id, c.id]);
    expect(out.map((s) => toolCounts(s, "Bash"))).toEqual([
      { calls: 1, errors: 0 },
      { calls: 4, errors: 1 },
    ]);
    // The rest of the session is the list's own (e.g. a model-sliced summary).
    expect(out[0].toolCallCount).toBe(a.toolCallCount);
    // A narrowing without a tool (a slot) keeps the sessions untouched.
    expect(withToolCounts([a, b], [a])).toEqual([a]);
  });
});
