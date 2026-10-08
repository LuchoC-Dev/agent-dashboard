import { describe, expect, it, vi } from "vitest";
import mockData from "./mocks/mock-data.json";
import type { Message } from "./bindings/Message";
import type { SessionDetail } from "./bindings/SessionDetail";
import type { SessionSummary } from "./bindings/SessionSummary";

// Contract v2.2 filters, served by the mock API; native calls must never happen.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));
vi.stubGlobal("location", { hash: "" });

const api = await import("./api");
const sessions = mockData.sessions as unknown as SessionSummary[];
const details = mockData.details as unknown as Record<string, SessionDetail>;
const all = { from: "2000-01-01", to: "2100-01-01" };
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe("mock metrics filters (contract v2.2)", () => {
  it("without the new args the result is unchanged", async () => {
    expect(await api.getMetrics(all, undefined, undefined, undefined)).toEqual(
      await api.getMetrics(all),
    );
  });

  it("projectPath keeps only that project's sessions", async () => {
    const path = sessions[0].projectPath,
      m = await api.getMetrics(all, undefined, path);
    // Groups are keyed by project (contract v2.5), the path filter still narrows by cwd.
    expect(m.byProject.map((g) => g.key)).toEqual([sessions[0].projectKey]);
    expect(m.totals.sessions).toBe(sessions.filter((s) => s.projectPath === path).length);
    const tools = await api.getToolStats(all, undefined, path);
    expect(tools.length).toBeGreaterThan(0);
  });

  it("model keeps only that model's share of usage and cost", async () => {
    const whole = await api.getMetrics(all),
      top = whole.byModel[0],
      m = await api.getMetrics(all, undefined, undefined, top.key);
    expect(m.byModel.map((g) => g.key)).toEqual([top.key]);
    close(m.totals.costUsd, top.costUsd);
    expect(m.totals.sessions).toBe(top.sessions);
    expect(m.totals.costUsd).toBeLessThanOrEqual(whole.totals.costUsd);
    const hourly = m.hourlyActivity!.reduce((n, c) => n + c.messages, 0);
    expect(hourly).toBe(m.totals.messages);
  });

  it("filters combine (AND)", async () => {
    const s = sessions.find((x) => x.provider === "codex")!,
      m = await api.getMetrics(all, "codex", s.projectPath, s.models[0]);
    expect(m.totals.sessions).toBeGreaterThan(0);
    expect(m.byProvider).toBeUndefined();
    expect(m.byProject.map((g) => g.key)).toEqual([s.projectKey]);
    const none = await api.getMetrics(all, "claude", s.projectPath, s.models[0]);
    expect(none.totals.sessions).toBe(0);
  });
});

function messagesFor(session: SessionSummary) {
  const detail = details[session.id];
  return [...detail.messages, ...detail.subagents.flatMap((agent) => agent.messages)];
}
function inSlot(message: Message, weekday?: number, hour?: number) {
  const time = Date.parse(message.timestamp);
  if (!Number.isFinite(time)) return false;
  const date = new Date(time);
  return (
    (weekday == null || (date.getDay() + 6) % 7 === weekday) &&
    (hour == null || date.getHours() === hour)
  );
}

describe("weekday and hour filters (contract v2.3)", () => {
  it("weekday alone filters sessions, messages, tools, and local daily series", async () => {
    const weekday = 0;
    const expected = sessions
      .map((session) => ({ session, messages: messagesFor(session).filter((message) => inSlot(message, weekday)) }))
      .filter((entry) => entry.messages.length > 0);
    const rows = await api.listSessions({ weekday });
    const metrics = await api.getMetrics(all, undefined, undefined, undefined, weekday);
    const tools = await api.getToolStats(all, undefined, undefined, undefined, weekday);
    expect(rows.map((row) => row.id).sort()).toEqual(expected.map((entry) => entry.session.id).sort());
    expect(metrics.totals.sessions).toBe(expected.length);
    expect(metrics.totals.messages).toBe(expected.reduce((sum, entry) => sum + entry.messages.length, 0));
    expect(tools.reduce((sum, tool) => sum + tool.calls, 0)).toBe(metrics.totals.toolCalls);
    expect(metrics.seriesByProvider).toBeDefined();
    expect(metrics.seriesByModel).toBeDefined();
    expect(metrics.seriesByProject).toBeDefined();
  });

  it("hour alone and every cross-filter combine with weekday/hour", async () => {
    const session = sessions.find((entry) => entry.provider === "codex" && entry.models.length > 0)!;
    const message = messagesFor(session).find((entry) => entry.model != null)!;
    const time = new Date(message.timestamp);
    const weekday = (time.getDay() + 6) % 7;
    const hour = time.getHours();
    const hourOnly = await api.getMetrics(all, undefined, undefined, undefined, undefined, hour);
    const hourRows = await api.listSessions({ hour });
    expect(hourRows.length).toBeGreaterThan(0);
    expect(hourOnly.totals.sessions).toBe(hourRows.length);

    const selected = sessions
      .filter((candidate) => candidate.provider === session.provider && candidate.projectPath === session.projectPath)
      .flatMap((candidate) => messagesFor(candidate)
        .filter((entry) => entry.model === message.model && inSlot(entry, weekday, hour)));
    const crossRows = await api.listSessions({
      from: all.from, to: all.to, provider: session.provider, projectPath: session.projectPath,
      model: message.model!, weekday, hour,
    });
    const crossMetrics = await api.getMetrics(
      all, session.provider, session.projectPath, message.model!, weekday, hour,
    );
    const crossTools = await api.getToolStats(
      all, session.provider, session.projectPath, message.model!, weekday, hour,
    );
    expect(crossRows.map((row) => row.id).sort()).toEqual(
      sessions
        .filter((candidate) => candidate.provider === session.provider && candidate.projectPath === session.projectPath)
        .filter((candidate) => messagesFor(candidate).some((entry) => entry.model === message.model && inSlot(entry, weekday, hour)))
        .map((candidate) => candidate.id).sort(),
    );
    expect(crossMetrics.totals.sessions).toBe(crossRows.length);
    expect(crossMetrics.totals.messages).toBe(selected.length);
    expect(crossMetrics.byModel.map((group) => group.key)).toEqual([message.model]);
    expect(crossMetrics.seriesByProvider?.length).toBe(1);
    expect(crossMetrics.seriesByProject?.map((series) => series.key)).toEqual([session.projectKey]);
    expect(crossTools.reduce((sum, tool) => sum + tool.calls, 0)).toBe(crossMetrics.totals.toolCalls);
  });
});

describe("project key and models filters (contract v2.5)", () => {
  const metrics = (f: { projectKey?: string; models?: string[]; model?: string; provider?: "claude" | "codex" }) =>
    api.getMetrics(all, f.provider, undefined, f.model, undefined, undefined, undefined, f.projectKey, f.models);

  it("a project key covers every working copy of the repository", async () => {
    const key = sessions.find((s) => sessions.some((o) => o.projectKey === s.projectKey && o.projectPath !== s.projectPath))!
      .projectKey;
    const own = sessions.filter((s) => s.projectKey === key);
    expect(new Set(own.map((s) => s.projectPath)).size).toBeGreaterThan(1);
    const m = await metrics({ projectKey: key });
    expect(m.byProject.map((g) => g.key)).toEqual([key]);
    expect(m.totals.sessions).toBe(own.length);
    expect((await api.listSessions({ projectKey: key })).length).toBe(own.length);
    const tools = await api.getToolStats(all, undefined, undefined, undefined, undefined, undefined, key);
    expect(tools.every((t) => t.byProject.every((g) => g.key === key))).toBe(true);
  });

  it("models keeps every message of any of them, like the sum of each model", async () => {
    const whole = await api.getMetrics(all),
      family = whole.byModel.map((g) => g.key).filter((k) => k.startsWith("claude-opus"));
    expect(family.length).toBeGreaterThan(1);
    const m = await metrics({ models: family });
    expect(m.byModel.map((g) => g.key).sort()).toEqual([...family].sort());
    let cost = 0,
      messages = 0;
    for (const id of family) {
      const one = await metrics({ model: id });
      cost += one.totals.costUsd;
      messages += one.totals.messages;
    }
    close(m.totals.costUsd, cost);
    expect(m.totals.messages).toBe(messages);
    const rows = await api.listSessions({ models: family });
    expect(rows.map((s) => s.id).sort()).toEqual(
      sessions.filter((s) => s.models.some((id) => family.includes(id))).map((s) => s.id).sort(),
    );
  });
});

describe("tool filters (contract v2.6)", () => {
  it("scopes sessions by exact tool and filters every tool count", async () => {
    const candidate = sessions
      .flatMap((session) =>
        messagesFor(session).flatMap((message) =>
          message.blocks
            .filter((block) => block.type === "toolCall")
            .map((block) => ({ session, message, tool: block.name })),
        ),
      )
      .find(({ message }) => message.model != null)!;
    const time = new Date(candidate.message.timestamp);
    const weekday = (time.getDay() + 6) % 7;
    const hour = time.getHours();
    const selected = sessions.flatMap((session) => {
      const messages = messagesFor(session).filter(
        (message) => message.model === candidate.message.model && inSlot(message, weekday, hour),
      );
      return messages.length ? [{ session, messages }] : [];
    });
    const expected = selected.filter(({ messages }) =>
      messages.some((message) =>
        message.blocks.some((block) => block.type === "toolCall" && block.name === candidate.tool),
      ),
    );
    const calls = expected.flatMap(({ messages }) => messages.flatMap((message) => message.blocks))
      .filter((block) => block.type === "toolCall" && block.name === candidate.tool);
    const rows = await api.listSessions({
      ...all,
      model: candidate.message.model!,
      weekday,
      hour,
      tool: candidate.tool,
    });
    const metrics = await api.getMetrics(
      all,
      undefined,
      undefined,
      candidate.message.model!,
      weekday,
      hour,
      "output",
      undefined,
      undefined,
      { tool: candidate.tool },
    );
    const stats = await api.getToolStats(
      all,
      undefined,
      undefined,
      candidate.message.model!,
      weekday,
      hour,
      undefined,
      undefined,
      { tool: candidate.tool },
    );
    expect(rows.map((row) => row.id).sort()).toEqual(expected.map(({ session }) => session.id).sort());
    expect(metrics.totals.sessions).toBe(expected.length);
    expect(metrics.totals.toolCalls).toBe(calls.length);
    expect(metrics.totals.toolErrors).toBe(
      calls.filter((block) => block.type === "toolCall" && block.isError).length,
    );
    expect(metrics.totals.usage.inputTokens).toBe(0);
    expect(metrics.byDay.reduce((sum, day) => sum + (day.toolErrors ?? 0), 0)).toBe(metrics.totals.toolErrors);
    expect(stats.map((row) => row.name)).toEqual([candidate.tool]);
    expect(stats[0].calls).toBe(calls.length);
    expect(stats[0].errors).toBe(metrics.totals.toolErrors);
    expect((await api.listSessions({ tool: "__unknown_tool__" })).length).toBe(0);
  });
});
