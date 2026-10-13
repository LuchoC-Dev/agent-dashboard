import { expect, it, vi } from "vitest";
import mockData from "./mocks/mock-data.json";
import type { SessionDetail } from "./bindings/SessionDetail";
import type { SessionSummary } from "./bindings/SessionSummary";
import { aggregate } from "./lib/aggregate";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));
vi.stubGlobal("location", { hash: "" });

const api = await import("./api");

it("keeps every mock session total aligned with main-history message costs", async () => {
  const metrics = aggregate(
    mockData.sessions as unknown as SessionSummary[],
    mockData.metrics.range,
    Object.values(mockData.details) as unknown as SessionDetail[],
  );
  expect(metrics.totals.costUsd).toBeCloseTo(mockData.metrics.totals.costUsd, 10);
  expect(metrics.totals.unpricedTokens).toBe(mockData.metrics.totals.unpricedTokens);
  let sessionsWithBranches = 0;
  for (const expected of mockData.sessions) {
    const detail = await api.getSession(expected.id);
    const messages = [
      ...detail.messages,
      ...detail.subagents.flatMap((agent) => agent.messages),
    ];
    const mainHistory = messages.filter((message) => message.branch == null);
    const breakdown = mainHistory.reduce(
      (sum, message) => ({
        input: sum.input + (message.costBreakdown?.input ?? 0),
        output: sum.output + (message.costBreakdown?.output ?? 0),
        cacheRead: sum.cacheRead + (message.costBreakdown?.cacheRead ?? 0),
        cacheWrite: sum.cacheWrite + (message.costBreakdown?.cacheWrite ?? 0),
      }),
      { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    );
    const cost = mainHistory.reduce((sum, message) => sum + (message.costUsd ?? 0), 0);
    const unpriced = mainHistory.reduce(
      (sum, message) => sum + (message.unpricedTokens ?? 0),
      0,
    );

    expect(detail.summary.costUsd).toBeCloseTo(expected.costUsd, 10);
    expect(cost).toBeCloseTo(detail.summary.costUsd, 10);
    expect(breakdown.input).toBeCloseTo(detail.summary.costBreakdown.input, 10);
    expect(breakdown.output).toBeCloseTo(detail.summary.costBreakdown.output, 10);
    expect(breakdown.cacheRead).toBeCloseTo(detail.summary.costBreakdown.cacheRead, 10);
    expect(breakdown.cacheWrite).toBeCloseTo(detail.summary.costBreakdown.cacheWrite, 10);
    expect(unpriced).toBe(detail.summary.unpricedTokens ?? 0);

    const branchMessages = messages.filter((message) => message.branch != null);
    if (branchMessages.length) sessionsWithBranches++;
    for (const message of branchMessages) {
      expect(message.costUsd).toBeUndefined();
      expect(message.costBreakdown).toBeUndefined();
      expect(message.unpricedTokens).toBeUndefined();
    }
  }
  expect(sessionsWithBranches).toBeGreaterThan(0);
});
