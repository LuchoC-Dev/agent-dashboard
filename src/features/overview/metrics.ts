import type { Metrics } from "../../bindings/Metrics";
import type { SessionDetail } from "../../bindings/SessionDetail";
import type { SessionSummary } from "../../bindings/SessionSummary";
import type { Usage } from "../../bindings/Usage";
import { dur, int, pct, tok, usd } from "../../lib/format";
import { allMessages, callsIn } from "../../lib/sessions";
import { tokensOf, type TokenKind } from "../../lib/filters";
import { tokenKinds, totalTok } from "../../lib/usage";

export type Metric =
  "cost" | "tokens" | "time" | "sessions" | "tools" | "messages";
export const metricOptions = [
  ["cost", "Costo"],
  ["tokens", "Tokens"],
  ["time", "Tiempo activo"],
  ["sessions", "Sesiones"],
  ["tools", "Herramientas"],
  ["messages", "Mensajes"],
] as const;
/** A session's value for a metric; tokens of one kind only when `tokenKind` is set. */
export const metricValue = (
  s: SessionSummary,
  m: Metric,
  tokenKind: TokenKind | null = null,
) =>
  ({
    cost: s.costUsd,
    tokens: tokensOf(s.usage, tokenKind),
    time: s.durationMs,
    sessions: 1,
    tools: s.toolCallCount,
    messages: s.messageCount,
  })[m];
export const formatMetric = (n: number, m: Metric) =>
  m === "cost"
    ? usd(n)
    : m === "tokens"
      ? tok(n)
      : m === "time"
        ? dur(n)
        : int(n);

/**
 * KPI tiles: [metric, label, value, footnote]. A session detail swaps a few footnotes; a
 * token-kind filter (whose totals already count only that kind, contract v2.4) names the kind
 * on the cost and token tiles and gives its share of every kind's tokens (`allUsage`); a tool
 * filter names the tool on the tool tile (its totals already count only that tool, contract
 * v2.6).
 */
export function kpiItems(
  t: Metrics["totals"],
  days: number,
  detail?: SessionDetail,
  tokenKind: TokenKind | null = null,
  tool: string | null = null,
  allUsage: Usage = t.usage,
) {
  const n = t.sessions || 1,
    all = totalTok(allUsage),
    kind = tokenKind && tokenKinds.find(([k]) => k === tokenKind)!;
  const items: [Metric, string, string, string][] = [
    [
      "cost",
      kind ? "Costo · " + kind[1] : "Costo estimado",
      usd(t.costUsd),
      `${usd(t.costUsd / n)} / sesión · ${usd(t.costUsd / days)} / día`,
    ],
    kind
      ? [
          "tokens",
          "Tokens · " + kind[1],
          tok(t.usage[kind[0]]),
          `${pct(t.usage[kind[0]] / (all || 1))} de ${tok(all)}`,
        ]
      : ["tokens", "Tokens", tok(all), `${pct(t.usage.cacheReadTokens / (all || 1))} de caché`],
    [
      "time",
      "Tiempo activo",
      dur(t.activeMs),
      `${dur(t.activeMs / n)} / sesión · ${dur(t.activeMs / days)} / día`,
    ],
    [
      "sessions",
      "Sesiones",
      int(t.sessions),
      `${int(t.messages)} mensajes · ${int(t.subagents)} subagentes`,
    ],
    [
      "tools",
      tool ? "Llamadas · " + tool : "Llamadas a herramientas",
      int(t.toolCalls),
      `⊗ ${int(t.toolErrors)} con error · ${pct(t.toolErrors / (t.toolCalls || 1))}`,
    ],
  ];
  if (detail) {
    const messages = allMessages(detail),
      subCost = detail.subagents.reduce((n, a) => n + a.costUsd, 0),
      toolTime = callsIn(messages).reduce((n, c) => n + (c.durationMs || 0), 0);
    items[0][3] = `${pct(subCost / (t.costUsd || 1))} en subagentes · ${usd(subCost)}`;
    items[2][1] = "Duración";
    items[2][3] = `${dur(toolTime)} en herramientas`;
    items[3] = [
      "messages",
      "Mensajes",
      int(t.messages),
      `${messages.filter((m) => m.role === "user").length} prompts · ${messages.filter((m) => m.role === "assistant").length} respuestas`,
    ];
  }
  return items;
}
