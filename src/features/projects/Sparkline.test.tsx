/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { session } from "../../test/fixtures";
import { Sparkline } from "./components/Sparkline";
import { sparkDays } from "./project-rows";

const at = (startedAt: string, costUsd: number) => ({ ...session, startedAt, costUsd });
const range = { from: "2026-09-01", to: "2026-09-30" };
const sessions = [
  at("2026-09-20T12:00:00", 2),
  at("2026-09-03T12:00:00", 1),
  at("2026-09-20T15:00:00", 0.5),
  at("2026-08-31T12:00:00", 9), // outside the range
];

describe("project sparkline", () => {
  it("bars every day of the range, lists only the active ones by date", () => {
    const { dates, values, active } = sparkDays(sessions, range);
    expect(dates).toHaveLength(30);
    expect(values.filter(Boolean)).toEqual([1, 2.5]);
    expect(active).toEqual([
      ["2026-09-03", 1],
      ["2026-09-20", 2.5],
    ]);
  });

  it("shows a compact tooltip with the active days only", () => {
    const { container } = render(<Sparkline sessions={sessions} range={range} />);
    fireEvent.mouseEnter(container.firstElementChild!);
    const tip = screen.getByTestId("sparkline-tooltip");
    expect(tip.textContent).toContain("2 días con actividad");
    expect(tip.children).toHaveLength(3);
    expect(tip.className).toContain("max-h-");
    expect(tip.className).toContain("overflow-auto");
    fireEvent.mouseLeave(container.firstElementChild!);
    expect(screen.queryByTestId("sparkline-tooltip")).toBeNull();
  });
});
