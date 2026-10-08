import { describe, expect, it, vi } from "vitest";
import mockData from "./mocks/mock-data.json";
import type { SessionDetail } from "./bindings/SessionDetail";
import { boundary, boundaryDay, useTimeZone, ZONES } from "./test/fixtures";
import { localDay } from "./lib/dates";

// Exercise the real mock API with an isolated midnight fixture; native calls must never happen.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));
vi.mock("./mocks/mock-data.json", async (importOriginal) => {
  const { default: data } = await importOriginal<{
    default: typeof mockData;
  }>();
  // Same shape as `boundary` from ./test/fixtures, which cannot be imported here
  // because it reads this very module.
  const details = data.details as unknown as Record<string, SessionDetail>;
  const boundary = {
    ...data.sessions[0],
    startedAt: "2026-10-06T01:30:00Z",
    endedAt: "2026-10-06T02:00:00Z",
  };
  const codex = data.sessions.find((s) => s.provider === "codex")!;
  return {
    default: {
      ...data,
      sessions: [boundary, codex],
      details: {
        [boundary.id]: { ...details[boundary.id], summary: boundary },
        [codex.id]: details[codex.id],
      },
    },
  };
});
vi.stubGlobal("location", { hash: "" });

const api = await import("./api");

describe.each(ZONES)("mock API in %s", (zone) => {
  useTimeZone(zone);

  it("filters sessions, metrics and tools by the local day", async () => {
    const day = boundaryDay(zone),
      range = { from: day, to: day };
    expect(await api.listSessions(range)).toHaveLength(1);
    expect((await api.getMetrics(range)).byDay[0].sessions).toBe(1);
    expect(
      (await api.getToolStats(range)).reduce((n, tool) => n + tool.calls, 0),
    ).toBe(boundary.toolCallCount);
    const otherDay = { from: "2026-10-07", to: "2026-10-07" };
    expect(await api.listSessions(otherDay)).toHaveLength(0);
    expect((await api.getMetrics(otherDay)).totals.sessions).toBe(0);
    expect(await api.getToolStats(otherDay)).toHaveLength(0);
  });

  it("filters mock metrics and tools by provider", async () => {
    const codex = await api.listSessions({ provider: "codex" });
    expect(codex).toHaveLength(1);
    expect((await api.getMetrics({}, "codex")).totals.sessions).toBe(
      codex.length,
    );
    expect(
      (await api.getToolStats({}, "codex")).reduce((n, tool) => n + tool.calls, 0),
    ).toBe(codex[0].toolCallCount);
  });

  it("applies project and per-message model filters to mock metrics and tools", async () => {
    const codex = (await api.listSessions({ provider: "codex" }))[0];
    const detail = await api.getSession(codex.id);
    const model = detail.messages.find((message) => message.model)?.model;
    if (!model) throw new Error("Codex fixture has no model-tagged message");
    const messages = [
      ...detail.messages,
      ...detail.subagents.flatMap((agent) => agent.messages),
    ].filter((message) => message.model === model);
    const expectedTools = messages.reduce(
      (count, message) =>
        count + message.blocks.filter((block) => block.type === "toolCall").length,
      0,
    );
    const day = localDay(codex.startedAt);
    const range = { from: day, to: day };
    const metrics = await api.getMetrics(
      range,
      "codex",
      codex.projectPath,
      model,
    );
    expect(metrics.totals.sessions).toBe(1);
    expect(metrics.totals.messages).toBe(messages.length);
    expect(metrics.hourlyActivity?.reduce((n, cell) => n + cell.messages, 0)).toBe(
      messages.length,
    );
    expect(
      (await api.getToolStats(range, "codex", codex.projectPath, model)).reduce(
        (n, tool) => n + tool.calls,
        0,
      ),
    ).toBe(expectedTools);
    expect(
      (await api.getMetrics(range, "codex", "__missing_project__", model)).totals
        .sessions,
    ).toBe(0);
    expect(
      await api.getToolStats(range, "codex", "__missing_project__", model),
    ).toEqual([]);
  });

  it("serves single-provider fixtures", async () => {
    location.hash = "#/resumen?estado=solo-codex";
    try {
      const sessions = await api.listSessions();
      expect(sessions.map((s) => s.provider)).toEqual(["codex"]);
      const report = await api.getScanReport();
      expect(report.sources?.find((s) => s.provider === "claude")?.available).toBe(false);
      expect((await api.getMetrics({})).byProvider).toBeUndefined();
    } finally {
      location.hash = "";
    }
  });

  it("returns compact hourly counts with metrics", async () => {
    const detail = await api.getSession(boundary.id);
    const metrics = await api.getMetrics(
      { from: boundaryDay(zone), to: boundaryDay(zone) },
      detail.summary.provider,
    );
    expect(metrics.hourlyActivity).toHaveLength(168);
    expect(metrics.hourlyActivity?.reduce((n, cell) => n + cell.messages, 0)).toBe(
      detail.messages.length +
        detail.subagents.reduce((n, subagent) => n + subagent.messages.length, 0),
    );
  });
});
