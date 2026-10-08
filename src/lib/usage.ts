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
