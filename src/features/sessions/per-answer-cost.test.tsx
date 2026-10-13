/** @vitest-environment jsdom */
import { act, fireEvent, render, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ChartTooltip } from "../../components/ui/ChartTooltip";
import type { Message } from "../../bindings/Message";
import { usd } from "../../lib/format";
import { costOf, tokenKinds } from "../../lib/usage";
import { mock } from "../../test/fixtures";
import { dashboardReady, panelOf, renderApp } from "../../test/render";
import { answerRow, chartAnswers } from "./answers";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

// jsdom has no layout: give the chart a width so Recharts draws.
let width: PropertyDescriptor | undefined;
beforeAll(() => {
  width = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
});
afterAll(() => {
  if (width) Object.defineProperty(HTMLElement.prototype, "clientWidth", width);
});

const answer = (extra: Partial<Message>): Message => ({
  id: "m1",
  role: "assistant",
  timestamp: "2026-10-05T12:00:00Z",
  model: "claude-opus-4-1",
  blocks: [],
  usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheCreationTokens: 40 },
  ...extra,
});
const sumOf = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);

describe("per-answer cost (v2.9)", { timeout: 30_000 }, () => {
  it("an answer's row carries its cost by kind and its unpriced tokens", () => {
    const costBreakdown = { input: 0.1, output: 0.2, cacheRead: 0.03, cacheWrite: 0.4 };
    const row = answerRow(answer({ costUsd: 0.73, costBreakdown, unpricedTokens: 5 }));
    expect(row.cost).toEqual(costBreakdown);
    expect(row.unpriced).toBe(5);
    // Without usage (or a price) there is nothing to stack.
    const bare = answerRow(answer({ usage: null }));
    expect(costOf(bare.cost)).toBe(0);
    expect(bare.unpriced).toBe(0);
  });

  it("the tooltip marks the total of an answer with unpriced tokens, before the amount", () => {
    const payload = [{ name: "Salida", dataKey: "cost.output", value: 1.5 }];
    const { container, rerender } = render(
      <ChartTooltip active label="12:00" payload={payload} format={usd} unpriced={7} />,
    );
    const total = container.querySelector("strong")!;
    expect(total.firstElementChild?.hasAttribute("data-unpriced")).toBe(true);
    expect(total.textContent).toBe("*" + usd(1.5));
    rerender(<ChartTooltip active label="12:00" payload={payload} format={usd} />);
    expect(container.querySelector("[data-unpriced]")).toBeNull();
  });

  it("the per-answer costs add up to the session's cost tile", () => {
    const sessions = mock.sessions.filter((s) => mock.details[s.id]);
    // Sessions with discarded Codex rollback branches are covered too.
    expect(sessions.some((s) => mock.details[s.id].messages.some((m) => m.branch))).toBe(true);
    for (const s of sessions) {
      const d = mock.details[s.id];
      // The chart's answers plus the subagents' (shown apart, "en subagentes") make the tile.
      const main = chartAnswers(d.messages).map(answerRow),
        sub = d.subagents.flatMap((a) => chartAnswers(a.messages)).map(answerRow),
        rows = [...main, ...sub];
      expect(main.every((r) => !d.messages.find((m) => m.id === r.id)?.branch)).toBe(true);
      expect(usd(sumOf(rows, (r) => costOf(r.cost))), s.id).toBe(usd(s.costUsd));
      for (const [, , , ck] of tokenKinds)
        expect(sumOf(rows, (r) => r.cost[ck]), `${s.id} ${ck}`).toBeCloseTo(s.costBreakdown[ck], 6);
      expect(sumOf(rows, (r) => r.unpriced), s.id).toBe(s.unpricedTokens ?? 0);
      if (!d.subagents.length) expect(usd(sumOf(main, (r) => costOf(r.cost)))).toBe(usd(s.costUsd));
    }
  });

  it("discarded rollback branches stay out of the chart in every metric", () => {
    const d = Object.values(mock.details).find((x) => x.messages.some((m) => m.branch && m.role === "assistant"))!;
    const ids = new Set(chartAnswers(d.messages).map((m) => m.id));
    for (const m of d.messages.filter((x) => x.branch)) expect(ids.has(m.id)).toBe(false);
    // Tokens follow the same rows: the chart's tokens are the main history's.
    const main = d.messages.filter((m) => m.role === "assistant" && !m.branch);
    expect(ids.size).toBe(main.length);
  });

  it("Por respuesta offers Costo, stacked by token kind with the same legend", async () => {
    const s = mock.sessions.find((x) => x.costUsd > 0)!;
    renderApp("/sesion/" + s.id);
    await dashboardReady();
    const chart = panelOf("Por respuesta");
    await act(async () => {
      fireEvent.click(within(chart).getByRole("button", { name: "Costo" }));
    });
    expect(within(chart).getByRole("button", { name: "Costo" }).getAttribute("aria-pressed")).toBe("true");
    for (const [, l] of tokenKinds) expect(within(chart).getAllByText(l).length).toBeGreaterThan(0);
  });
});
