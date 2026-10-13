import type { CostBreakdown } from "../bindings/CostBreakdown";
import type { Usage } from "../bindings/Usage";
import { int } from "./format";

export const zeroUsage = (): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
});
export const zeroCost = (): CostBreakdown => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});
export function addCost(a: CostBreakdown, b: CostBreakdown) {
  for (const k of Object.keys(a) as (keyof CostBreakdown)[]) a[k] += b[k];
  return a;
}
export const totalTok = (u: Usage) =>
  u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens;
export function addUsage(a: Usage, b: Usage) {
  a.inputTokens += b.inputTokens;
  a.outputTokens += b.outputTokens;
  a.cacheReadTokens += b.cacheReadTokens;
  a.cacheCreationTokens += b.cacheCreationTokens;
  if (a.reasoningTokens !== undefined || b.reasoningTokens !== undefined)
    a.reasoningTokens = (a.reasoningTokens ?? 0) + (b.reasoningTokens ?? 0);
  return a;
}
/** Token kinds in stack order, bottom → top: usage key, label, color token, cost key. */
export const tokenKinds = [
  [
    "cacheReadTokens",
    "Lectura de caché",
    "var(--color-tok-cache-read)",
    "cacheRead",
  ],
  ["outputTokens", "Salida", "var(--color-tok-output)", "output"],
  [
    "cacheCreationTokens",
    "Escritura de caché",
    "var(--color-tok-cache-write)",
    "cacheWrite",
  ],
  ["inputTokens", "Entrada", "var(--color-tok-input)", "input"],
] as const;
export const tokenTitle = (u: Usage) =>
  tokenKinds.map(([k, l]) => `${l}: ${int(u[k])}`).join("\n");
export const costOf = (c: CostBreakdown) =>
  c.input + c.output + c.cacheRead + c.cacheWrite;
/**
 * Each kind's cost rounded to whole cents so the parts add up to `total` as shown (rounded
 * to cents): largest remainder, so a kind never moves more than one cent from its own value.
 */
export function costSplit(c: CostBreakdown, total = costOf(c)): CostBreakdown {
  const keys = Object.keys(c) as (keyof CostBreakdown)[],
    cents = keys.map((k) => Math.max(0, c[k]) * 100),
    out = cents.map(Math.floor);
  let diff = Math.round(total * 100) - out.reduce((n, v) => n + v, 0);
  const order = keys
    .map((_, i) => i)
    .sort((a, b) => cents[b] - out[b] - (cents[a] - out[a]) || cents[b] - cents[a]);
  // Add the missing cents to the largest remainders; drop extra ones from the smallest.
  for (let i = 0; diff > 0; i = (i + 1) % order.length, diff--) out[order[i]]++;
  for (let i = order.length - 1; diff < 0 && i >= 0; i--)
    if (out[order[i]] > 0) {
      out[order[i]]--;
      diff++;
    }
  return Object.fromEntries(keys.map((k, i) => [k, out[i] / 100])) as CostBreakdown;
}
