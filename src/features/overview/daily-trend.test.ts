import { describe, expect, it } from "vitest";
import { aggregate, unpricedModels } from "../../lib/aggregate";
import { palette } from "../../lib/colors";
import { hasDate, resolveRange } from "../../lib/dates";
import type { DailySeries } from "../../bindings/DailySeries";
import type { DayPoint } from "../../bindings/DayPoint";
import { dailySeries } from "../../lib/series";
import { mock } from "../../test/fixtures";
import {
  dailyTrend,
  dataDays,
  trendSpan,
  peakDay,
  seriesTotal,
  trendSum,
  type TrendSource,
} from "./daily-trend";
import type { Metric } from "./metrics";

const sessions = mock.sessions.filter((s) => hasDate(s.startedAt)),
  colors = palette(mock.sessions),
  range = resolveRange({}, mock.sessions),
  details = Object.values(mock.details);
const source: TrendSource = {
  byDay: aggregate(sessions, range, details).byDay,
  ...dailySeries(sessions, mock.details, range, {}, unpricedModels(details)),
};
const metrics: Metric[] = ["cost", "tokens", "time", "sessions", "tools", "messages"];
const sumOf = (list: DailySeries[] | undefined, m: Metric) =>
  (list ?? []).reduce((n, s) => n + seriesTotal(s, m), 0);

describe("daily trend from the precomputed series", () => {
  it("has one row per day of the range, counting sessions per day", () => {
    const { data } = dailyTrend(source, range, "total", "cost", colors);
    expect(data[0].date).toBe(range.from);
    expect(data[data.length - 1].date).toBe(range.to);
    expect(data.reduce((n, d) => n + Number(d.count), 0)).toBe(sumOf(source.seriesByProvider, "sessions"));
  });

  it.each(["total", "provider", "model", "project"] as const)(
    "stacks series that add up to the metric (%s)",
    (group) => {
      for (const metric of metrics) {
        const { data, series } = dailyTrend(source, range, group, metric, colors);
        const list = group === "model" ? source.seriesByModel : source.seriesByProvider;
        // Total tokens stack the per-kind buckets, which hold the same tokens.
        expect(trendSum(data, series), `${group} ${metric}`).toBeCloseTo(sumOf(list, metric), 6);
      }
    },
  );

  it("groups Por modelo by the model series; automatic reviews keep their own label", () => {
    const { series } = dailyTrend(source, range, "model", "cost", colors, { top: 100 });
    expect(series.some((s) => s.label.startsWith("Sol"))).toBe(true);
    const reviews = series.find((s) => s.label === "Revisiones automáticas");
    expect(reviews?.value).toBe("codex-auto-review");
    expect(series[series.length - 1]).toBe(reviews);
  });

  it("shows only the filtered model when the series hold only it", () => {
    const only = { ...source, seriesByModel: source.seriesByModel!.filter((s) => s.key === "gpt-5.6-sol") };
    const { series } = dailyTrend(only, range, "model", "cost", colors);
    expect(series.map((s) => s.value)).toEqual(["gpt-5.6-sol"]);
  });

  it("picks the day with the highest stacked total", () => {
    const { data, series } = dailyTrend(source, range, "total", "cost", colors);
    expect(Math.max(...data.map((d) => Number(d.total || 0)))).toBe(peakDay(data, series)!.total);
  });

  it("draws every project as its own segment, with its total for the legend", () => {
    const point = (n: number): DayPoint => ({
      date: range.from!, costUsd: n, tokens: n, activeMs: n, sessions: 1, toolCalls: n, messages: n,
    });
    const projects = [50, 30, 10, 4, 2, 1, 1, 1, 1].map((n, i) => ({
      key: "p" + i, label: "P" + i, points: [point(n)],
    }));
    const t = dailyTrend({ ...source, seriesByProject: projects }, range, "project", "cost", colors);
    expect(t.series).toHaveLength(9);
    expect(t.series.some((s) => s.rest)).toBe(false);
    expect(trendSum(t.data, t.series)).toBe(100);
    expect(t.series.find((s) => s.value === "p0")!.total).toBe(50);
    // 60 projects: still no Resto in the chart.
    const many = Array.from({ length: 60 }, (_, i) => ({ key: "q" + i, label: "Q" + i, points: [point(1)] }));
    expect(dailyTrend({ ...source, seriesByProject: many }, range, "project", "cost", colors).series).toHaveLength(60);
  });

  it("folds other groupings past the top", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      key: "b" + i, label: "b" + i, points: [{ date: range.from!, costUsd: i + 1, tokens: 0, activeMs: 0, sessions: 1, toolCalls: 0, messages: 1 }],
    }));
    const t = dailyTrend({ ...source, seriesByBranch: many }, range, "branch", "cost", colors, { top: 8 });
    expect(t.series).toHaveLength(9);
    expect(t.series[8].label).toBe("Resto · 4 ramas");
  });

  it("counts only the filtered token kind in Total", () => {
    const { data, series } = dailyTrend(source, range, "total", "tokens", colors, { tokenKind: "outputTokens" });
    expect(series.map((s) => s.key)).toEqual(["outputTokens"]);
    expect(trendSum(data, series)).toBe(source.byDay.reduce((n, d) => n + d.usage.outputTokens, 0));
  });

  it("leaves empty segments out, so no rectangle is drawn for them", () => {
    const { data } = dailyTrend(source, range, "provider", "cost", colors);
    expect(data.some((d) => !("s0" in d) || !("s1" in d))).toBe(true);
  });

  it("falls back to the per-day buckets for Total without series", () => {
    const { data, series } = dailyTrend({ byDay: source.byDay }, range, "total", "cost", colors);
    expect(trendSum(data, series)).toBeCloseTo(source.byDay.reduce((n, d) => n + d.costUsd, 0), 6);
  });
});

describe("the chart's span", () => {
  const point = (date: string, costUsd = 1) => ({
    date, costUsd, tokens: costUsd, activeMs: 0, sessions: costUsd ? 1 : 0, toolCalls: 0, messages: costUsd ? 1 : 0,
  });
  const empty = (date: string) => ({ ...source.byDay[0], date, sessions: 0, toolCalls: 0, costUsd: 0,
    usage: { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 } });
  // A project whose first session is 13 Sept in an app whose first day is 14 Jun.
  const scoped: TrendSource = {
    byDay: [empty("2026-06-14"), empty("2026-09-12")],
    seriesByProvider: [{ key: "claude", label: "Claude", points: [point("2026-09-12", 0), point("2026-09-13"), point("2026-09-20")] }],
  };
  const global = { from: "2026-06-14", to: "2026-09-30" };

  it("finds the first day with data, ignoring empty points and buckets", () => {
    expect(dataDays(scoped)).toEqual({ first: "2026-09-13", last: "2026-09-20" });
    expect(dataDays({ byDay: [empty("2026-06-14")] })).toEqual({});
  });

  it("spans Todo from the scope's first to its last day with data", () => {
    expect(trendSpan(scoped, {}, global)).toEqual({ from: "2026-09-13", to: "2026-09-20" });
    const t = dailyTrend(scoped, trendSpan(scoped, {}, global), "total", "cost", colors);
    expect(t.data[0].date).toBe("2026-09-13");
    expect(t.data[t.data.length - 1].date).toBe("2026-09-20");
  });

  it("keeps an explicit range whole, and falls back without data", () => {
    const last30 = { from: "2026-09-01", to: "2026-09-30" };
    expect(trendSpan(scoped, last30, last30)).toEqual(last30);
    expect(trendSpan(undefined, {}, global)).toEqual(global);
    expect(trendSpan({ byDay: [] }, {}, global).from).toBe("2026-06-14");
  });
});
