import { describe, expect, it } from "vitest";
import { mock } from "../test/fixtures";
import { costOf, costSplit } from "./usage";

const cents = (n: number) => Math.round(n * 100);
const sum = (c: ReturnType<typeof costSplit>) => cents(costOf(c));

describe("cost split by token kind", () => {
  it("rounds every kind to cents and adds up to the total as shown", () => {
    const c = { input: 0.004, output: 0.004, cacheRead: 0.004, cacheWrite: 1.006 };
    const split = costSplit(c);
    expect(sum(split)).toBe(cents(costOf(c)));
    for (const k of Object.keys(c) as (keyof typeof c)[]) {
      expect(Math.abs(split[k] - c[k])).toBeLessThan(0.01 + 1e-9);
      expect(split[k] * 100).toBeCloseTo(cents(split[k]), 9);
    }
  });

  it("follows a given total that differs from the parts by float noise", () => {
    const c = { input: 0.335, output: 0.335, cacheRead: 0.335, cacheWrite: 0 };
    expect(sum(costSplit(c, 1.0049))).toBe(100);
    expect(sum(costSplit(c, 0.995))).toBe(100);
    expect(sum(costSplit(c, 0.994))).toBe(99);
  });

  it("matches every session and the totals of the mock fixture", () => {
    for (const s of mock.sessions) expect(sum(costSplit(s.costBreakdown, s.costUsd))).toBe(cents(s.costUsd));
    const t = mock.metrics.totals;
    expect(sum(costSplit(t.costBreakdown, t.costUsd))).toBe(cents(t.costUsd));
  });

  it("keeps an all-zero breakdown at zero", () => {
    expect(costSplit({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })).toEqual({
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0,
    });
  });
});
