import { describe, expect, it } from "vitest";
import { mock } from "../test/fixtures";
import { aggregate } from "./aggregate";
import { toolsFromDetails } from "./tools";

const details = Object.values(mock.details);
const near = (a: number, b: number, tolerance = 1e-8) =>
  expect(Math.abs(a - b)).toBeLessThan(tolerance);

describe("aggregate against the mock fixture", () => {
  const result = aggregate(mock.sessions, mock.metrics.range, details);

  it("matches the generated totals", () => {
    near(result.totals.costUsd, mock.metrics.totals.costUsd);
    expect(result.totals.messages).toBe(mock.metrics.totals.messages);
    expect(result.totals.toolCalls).toBe(mock.metrics.totals.toolCalls);
    expect(result.totals.subagents).toBe(mock.metrics.totals.subagents);
    for (const kind of ["input", "output", "cacheRead", "cacheWrite"] as const)
      near(
        result.totals.costBreakdown[kind],
        mock.metrics.totals.costBreakdown[kind],
      );
  });

  it("apportions model costs by recorded usage", () => {
    for (const expected of mock.metrics.byModel) {
      const actual = result.byModel.find((g) => g.key === expected.key);
      expect(actual, expected.key).toBeTruthy();
      // Summary/subagent costs are rounded to four decimals by the fixture generator,
      // while its model buckets retain unrounded per-message prices.
      near(actual!.costUsd, expected.costUsd, 0.002);
      expect(actual!.usage).toEqual(expected.usage);
    }
  });

  it("keeps day and model buckets consistent with the total", () => {
    near(
      result.byDay.reduce((n, d) => n + d.costUsd, 0),
      result.totals.costUsd,
    );
    near(
      result.byModel.reduce((n, d) => n + d.costUsd, 0),
      result.totals.costUsd,
    );
  });

  it("agrees with the tool statistics", () => {
    const tools = toolsFromDetails(details);
    expect(tools.reduce((n, t) => n + t.calls, 0)).toBe(
      result.totals.toolCalls,
    );
    expect(tools.reduce((n, t) => n + t.errors, 0)).toBe(
      result.totals.toolErrors,
    );
  });

  it("counts unpriced tokens and leaves unpriced models at no cost", () => {
    expect(result.totals.unpricedTokens).toBe(mock.metrics.totals.unpricedTokens);
    expect(result.totals.unpricedTokens).toBeGreaterThan(0);
    const review = result.byModel.find((g) => g.key === "codex-auto-review")!;
    expect(review.costUsd).toBe(0);
    expect(review.unpricedTokens).toBe(
      mock.metrics.byModel.find((g) => g.key === "codex-auto-review")!.unpricedTokens,
    );
    expect(result.byDay.reduce((n, d) => n + (d.unpricedTokens ?? 0), 0)).toBe(
      result.totals.unpricedTokens,
    );
  });

  it("splits totals by provider only when more than one has data", () => {
    const split = result.byProvider!;
    expect(split.map((g) => g.key).sort()).toEqual(["claude", "codex"]);
    near(
      split.reduce((n, g) => n + g.costUsd, 0),
      result.totals.costUsd,
    );
    expect(split.reduce((n, g) => n + g.sessions, 0)).toBe(result.totals.sessions);
    const claude = mock.sessions.filter((s) => s.provider === "claude");
    expect(aggregate(claude, mock.metrics.range, details).byProvider).toBeUndefined();
  });

  it("builds compact daily series and keeps automatic reviews out of model ids", () => {
    const series = result.seriesByModel!;
    expect(series.some((entry) => entry.key === "codex-auto-review")).toBe(false);
    const review = series.find((entry) => entry.key === "auto-review")!;
    expect(review.label).toBe("Revisiones automáticas");
    for (const entry of [...result.seriesByProvider!, ...series, ...result.seriesByProject!]) {
      expect(entry.points.every((point, index) => index === 0 || entry.points[index - 1].date < point.date)).toBe(true);
      expect(entry.points.every((point) => point.sessions >= 0 && (
        point.messages > 0 || point.toolCalls > 0 || point.tokens > 0 || point.costUsd > 0 || point.activeMs > 0
      ))).toBe(true);
    }
  });

  it("filters KPI and every series to only the requested model", () => {
    const model = result.byModel.find((entry) => entry.key === "gpt-5.6-sol")!;
    const filtered = aggregate(mock.sessions, mock.metrics.range, details, model.key);
    near(filtered.totals.costUsd, model.costUsd);
    expect(filtered.totals.usage).toEqual(model.usage);
    expect(filtered.seriesByModel?.map((entry) => entry.key)).toEqual([model.key]);
    expect(filtered.seriesByProvider?.every((entry) => entry.points.every((point) => point.messages > 0))).toBe(true);
    const review = aggregate(mock.sessions, mock.metrics.range, details, "codex-auto-review");
    expect(review.seriesByModel?.map((entry) => entry.key)).toEqual(["auto-review"]);
  });

  it("fills empty ranges with zero days", () => {
    const empty = aggregate([], { from: "2026-10-01", to: "2026-10-03" });
    expect(empty.byDay).toHaveLength(3);
    expect(empty.totals.sessions).toBe(0);
  });
});
