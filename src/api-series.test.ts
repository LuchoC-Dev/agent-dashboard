import { describe, expect, it, vi } from "vitest";
import mockData from "./mocks/mock-data.json";
import type { SessionDetail } from "./bindings/SessionDetail";
import type { SessionSummary } from "./bindings/SessionSummary";
import { unpricedModels } from "./lib/aggregate";
import { allMessages } from "./lib/sessions";
import type { DailySeries } from "./bindings/DailySeries";
import { AUTO_REVIEW_KEY, dailySeries, localSlot } from "./lib/series";

// Contract v2.3 (daily series, weekday/hour filter), served by the mock API.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));
vi.stubGlobal("location", { hash: "" });

const api = await import("./api");
const sessions = mockData.sessions as unknown as SessionSummary[],
  details = mockData.details as unknown as Record<string, SessionDetail>;
const all = { from: "2000-01-01", to: "2100-01-01" };
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);
const total = (list: DailySeries[] | undefined, f: "costUsd" | "tokens" | "messages" | "toolCalls") =>
  (list ?? []).reduce((n, s) => n + s.points.reduce((m, p) => m + p[f], 0), 0);

describe("mock daily series (contract v2.3)", () => {
  it("adds up to the totals in every grouping", async () => {
    const m = await api.getMetrics(all);
    for (const list of [m.seriesByProvider, m.seriesByModel, m.seriesByProject]) {
      close(total(list, "costUsd"), m.totals.costUsd);
      expect(total(list, "toolCalls")).toBe(m.totals.toolCalls);
    }
    expect(total(m.seriesByProvider, "messages")).toBe(m.totals.messages);
  });

  it("sorts by cost, keeps points by date and only days with data", async () => {
    const m = await api.getMetrics(all);
    const costs = m.seriesByProject!.map((s) => s.points.reduce((n, p) => n + p.costUsd, 0));
    expect(costs).toEqual([...costs].sort((a, b) => b - a));
    for (const s of m.seriesByModel!) {
      const dates = s.points.map((p) => p.date);
      expect(dates).toEqual([...dates].sort());
      expect(s.points.every((p) => p.messages > 0)).toBe(true);
    }
  });

  it("puts automatic reviews in their own series, never a model", async () => {
    const m = await api.getMetrics(all);
    expect(m.seriesByModel!.some((s) => s.key.startsWith("codex-auto-review"))).toBe(false);
    expect(m.seriesByModel!.find((s) => s.key === AUTO_REVIEW_KEY)?.label).toBe(
      "Revisiones automáticas",
    );
  });

  it("splits a mixed session between its models, per message", () => {
    // A Codex session whose messages alternate Sol 5.6 and Terra 5.6.
    const base = details[sessions.find((s) => s.provider === "codex")!.id];
    let n = 0;
    const messages = base.messages.map((m) =>
      m.model ? { ...m, model: n++ % 2 ? "gpt-5.6-terra" : "gpt-5.6-sol" } : m,
    );
    const mixed: SessionDetail = {
      ...base,
      summary: { ...base.summary, models: ["gpt-5.6-sol", "gpt-5.6-terra"] },
      messages,
      subagents: [],
    };
    mixed.summary.costBreakdown = { ...base.summary.costBreakdown };
    for (const a of base.subagents)
      for (const k of Object.keys(a.costBreakdown) as (keyof typeof a.costBreakdown)[])
        mixed.summary.costBreakdown[k] -= a.costBreakdown[k];
    const map = { [mixed.summary.id]: mixed },
      none = new Set<string>();
    const both = dailySeries([mixed.summary], map, all, {}, none);
    expect(both.seriesByModel.map((s) => s.key).sort()).toEqual(["gpt-5.6-sol", "gpt-5.6-terra"]);
    const sol = dailySeries([mixed.summary], map, all, { model: "gpt-5.6-sol" }, none);
    // Only Sol's numbers, everywhere.
    expect(sol.seriesByModel.map((s) => s.key)).toEqual(["gpt-5.6-sol"]);
    const solCost = total(both.seriesByModel.filter((s) => s.key === "gpt-5.6-sol"), "costUsd");
    close(total(sol.seriesByProvider, "costUsd"), solCost);
    close(total(sol.seriesByProject, "costUsd"), solCost);
    expect(total(sol.seriesByProvider, "messages")).toBe(
      messages.filter((m) => m.model === "gpt-5.6-sol").length,
    );
    expect(solCost).toBeLessThan(total(both.seriesByProvider, "costUsd"));
  });

  it("with a model filter returns only that model's series", async () => {
    const model = "gpt-5.6-sol",
      m = await api.getMetrics(all, undefined, undefined, model);
    expect(m.seriesByModel!.map((s) => s.key)).toEqual([model]);
    close(total(m.seriesByProvider, "costUsd"), total(m.seriesByModel, "costUsd"));
  });
});

describe("weekday/hour filter (contract v2.3)", () => {
  const slotOf = (d: SessionDetail) => allMessages(d).map((m) => localSlot(m.timestamp));
  // The busiest slot of the sample.
  const counts = new Map<string, number>();
  for (const d of Object.values(details))
    for (const [w, h] of slotOf(d)) counts.set(`${w}-${h}`, (counts.get(`${w}-${h}`) || 0) + 1);
  const [weekday, hour] = [...counts].sort((a, b) => b[1] - a[1])[0][0].split("-").map(Number);

  it("selects the messages in that local slot", async () => {
    const m = await api.getMetrics(all, undefined, undefined, undefined, weekday, hour);
    expect(m.totals.messages).toBe(counts.get(`${weekday}-${hour}`));
    const cells = m.hourlyActivity!.filter((c) => c.messages > 0);
    expect(cells.map((c) => [c.weekday, c.hour])).toEqual([[weekday, hour]]);
    expect(total(m.seriesByProvider, "messages")).toBe(m.totals.messages);
    close(total(m.seriesByProvider, "costUsd"), m.totals.costUsd);
  });

  it("keeps the sessions with a message there, alone or combined", async () => {
    const listed = await api.listSessions({ ...all, weekday, hour });
    const expected = sessions.filter((s) =>
      slotOf(details[s.id]).some(([w, h]) => w === weekday && h === hour),
    );
    expect(listed.map((s) => s.id).sort()).toEqual(expected.map((s) => s.id).sort());
    const day = await api.getMetrics(all, undefined, undefined, undefined, weekday);
    expect(day.totals.messages).toBeGreaterThanOrEqual(counts.get(`${weekday}-${hour}`)!);
    const hourOnly = await api.listSessions({ ...all, hour });
    expect(hourOnly.length).toBeGreaterThanOrEqual(listed.length);
    const provider = expected[0].provider,
      both = await api.getMetrics(all, provider, undefined, undefined, weekday, hour);
    expect(both.seriesByProvider!.map((s) => s.key)).toEqual([provider]);
  });

  it("narrows the tool statistics to that slot", async () => {
    const tools = await api.getToolStats(all, undefined, undefined, undefined, weekday, hour),
      m = await api.getMetrics(all, undefined, undefined, undefined, weekday, hour);
    expect(tools.reduce((n, t) => n + t.calls, 0)).toBe(m.totals.toolCalls);
  });

  it("finds the unpriced models over every detail", () => {
    expect(unpricedModels(Object.values(details)).has("codex-auto-review")).toBe(true);
  });
});

describe("token-kind filter (contract v2.4)", () => {
  it("splits usage and cost while preserving the other metrics", async () => {
    const allMetrics = await api.getMetrics(all);
    const kinds = ["input", "output", "cacheRead", "cacheWrite"] as const;
    const filtered = await Promise.all(kinds.map((kind) => api.getMetrics(all, undefined, undefined, undefined, undefined, undefined, kind)));
    const sum = (select: (m: (typeof filtered)[number]) => number) => filtered.reduce((n, metric) => n + select(metric), 0);
    for (const kindMetrics of filtered) {
      expect(kindMetrics.totals.sessions).toBe(allMetrics.totals.sessions);
      expect(kindMetrics.totals.messages).toBe(allMetrics.totals.messages);
      expect(kindMetrics.totals.toolCalls).toBe(allMetrics.totals.toolCalls);
      expect(kindMetrics.totals.activeMs).toBe(allMetrics.totals.activeMs);
      expect(kindMetrics.hourlyActivity).toEqual(allMetrics.hourlyActivity);
      close(total(kindMetrics.seriesByProvider, "costUsd"), kindMetrics.totals.costUsd);
    }
    for (const key of ["inputTokens", "outputTokens", "cacheReadTokens", "cacheCreationTokens"] as const)
      expect(sum((m) => m.totals.usage[key])).toBe(allMetrics.totals.usage[key]);
    close(sum((m) => m.totals.costUsd), allMetrics.totals.costUsd);
    for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const)
      close(sum((m) => m.totals.costBreakdown[key]), allMetrics.totals.costBreakdown[key]);
  });

  it("combines with provider, project, model, weekday, and hour", async () => {
    const example = sessions.find((session) => details[session.id].messages.some((message) => message.model && message.usage));
    expect(example).toBeDefined();
    const message = details[example!.id].messages.find((entry) => entry.model && entry.usage)!;
    const [weekday, hour] = localSlot(message.timestamp);
    const metrics = await api.getMetrics(all, example!.provider, example!.projectPath, message.model!, weekday, hour, "output");
    expect(metrics.totals.messages).toBeGreaterThan(0);
    expect(metrics.totals.usage.inputTokens).toBe(0);
    expect(metrics.totals.usage.cacheReadTokens).toBe(0);
    expect(metrics.totals.usage.cacheCreationTokens).toBe(0);
    expect(metrics.totals.usage.outputTokens).toBeGreaterThanOrEqual(message.usage!.outputTokens);
    expect(metrics.seriesByModel!.every((series) => series.key === message.model)).toBe(true);
    close(total(metrics.seriesByProject, "costUsd"), metrics.totals.costUsd);
  });
});
