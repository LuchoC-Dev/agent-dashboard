import type { CostBreakdown } from "../bindings/CostBreakdown";
import type { DailySeries } from "../bindings/DailySeries";
import type { DateRange } from "../bindings/DateRange";
import type { DayPoint } from "../bindings/DayPoint";
import type { Message } from "../bindings/Message";
import type { Metrics } from "../bindings/Metrics";
import type { SessionDetail } from "../bindings/SessionDetail";
import type { SessionSummary } from "../bindings/SessionSummary";
import type { Usage } from "../bindings/Usage";
import { localDay, matchesDays } from "./dates";
import { tokensOf, type TokenKind } from "./filters";
import { AUTO_REVIEW_LABEL, isAutoReview, parseModel, sessionModels } from "./models";
import { providerLabel } from "./providers";
import { addCost, addUsage, costOf, tokenKinds, totalTok, zeroCost, zeroUsage } from "./usage";

type SeriesFields = Pick<Metrics, "seriesByProvider" | "seriesByModel" | "seriesByProject">;

/** The series key of automatic reviews: never a model series (contract v2.3). */
export const AUTO_REVIEW_KEY = "auto-review";

/**
 * Message-level filters: a model, or any of several models (a family, contract v2.5), and a
 * local weekday (0 = Monday) and/or hour. A token kind (series only) counts just that kind's
 * tokens and cost; a tool (series only, contract v2.6) keeps the sessions with a call to it
 * among those messages and counts only its calls and errors.
 */
export type MessageFilter = {
  model?: string | null;
  models?: string[] | null;
  weekday?: number | null;
  hour?: number | null;
  tokenKind?: TokenKind | null;
  tool?: string | null;
};
export const hasSlot = (f: MessageFilter) => f.weekday != null || f.hour != null;

/** Local weekday (0 = Monday … 6 = Sunday) and hour of a timestamp. */
export function localSlot(iso: string): [weekday: number, hour: number] {
  const d = new Date(iso);
  return [(d.getDay() + 6) % 7, d.getHours()];
}

/** One message with its share of the session's cost. */
export type MessageFact = {
  message: Message;
  day: string;
  weekday: number;
  hour: number;
  cost: CostBreakdown;
  toolCalls: number;
  toolErrors: number;
  /** Index of the sub-agent that holds it; -1 for the main conversation. */
  subagent: number;
};

/**
 * Every message of a session with its cost: each scope's (main or sub-agent) cost per token
 * kind is split across its priced messages by their tokens of that kind. Models without a
 * price (`unpriced`) get no cost.
 */
export function messageFacts(detail: SessionDetail, unpriced: Set<string>): MessageFact[] {
  const facts: MessageFact[] = [];
  const scope = (messages: Message[], cost: CostBreakdown, subagent: number) => {
    const priced = (m: Message) => !!m.model && !!m.usage && !unpriced.has(m.model);
    const sums = zeroUsage(),
      count = messages.filter(priced).length;
    for (const m of messages) if (priced(m)) addUsage(sums, m.usage!);
    for (const m of messages) {
      const share = zeroCost();
      if (priced(m))
        for (const [kind, , , ck] of tokenKinds)
          share[ck] = cost[ck] * (sums[kind] ? m.usage![kind] / sums[kind] : 1 / count);
      const calls = m.blocks.filter((b) => b.type === "toolCall");
      const [weekday, hour] = localSlot(m.timestamp);
      facts.push({
        message: m,
        day: localDay(m.timestamp),
        weekday,
        hour,
        cost: share,
        toolCalls: calls.length,
        toolErrors: calls.filter((b) => b.type === "toolCall" && b.isError).length,
        subagent,
      });
    }
  };
  const main = { ...detail.summary.costBreakdown };
  detail.subagents.forEach((a, i) => {
    for (const k of Object.keys(main) as (keyof CostBreakdown)[]) main[k] -= a.costBreakdown[k];
    scope(a.messages, a.costBreakdown, i);
  });
  scope(detail.messages, main, -1);
  return facts;
}

/** Whether a message's model passes the model filters (`model` and/or `models`). */
export const keepModel = (f: MessageFilter, model: string | null) =>
  (!f.model || model === f.model) && (!f.models || (!!model && f.models.includes(model)));

export const keepMessage = (f: MessageFilter, m: MessageFact) =>
  keepModel(f, m.message.model) &&
  (f.weekday == null || m.weekday === f.weekday) &&
  (f.hour == null || m.hour === f.hour);

/**
 * The sessions (and details) reduced to their messages that pass `filter`: usage, cost,
 * messages and tool calls are those messages' own. Sessions without one are dropped.
 */
export function sliceSessions(
  sessions: SessionSummary[],
  details: Record<string, SessionDetail>,
  filter: MessageFilter,
  unpriced: Set<string>,
) {
  const out: { sessions: SessionSummary[]; details: SessionDetail[] } = {
    sessions: [],
    details: [],
  };
  for (const s of sessions) {
    const detail = details[s.id];
    if (!detail) continue;
    const kept = messageFacts(detail, unpriced).filter((m) => keepMessage(filter, m));
    if (!kept.length) continue;
    const sum = (facts: MessageFact[]) => {
      const usage = zeroUsage(),
        cost = zeroCost();
      for (const f of facts) {
        if (f.message.usage) addUsage(usage, f.message.usage);
        addCost(cost, f.cost);
      }
      return { usage, cost };
    };
    const all = sum(kept);
    const summary: SessionSummary = {
      ...s,
      models: [...new Set(kept.flatMap((f) => (f.message.model ? [f.message.model] : [])))],
      messageCount: kept.length,
      toolCallCount: kept.reduce((n, f) => n + f.toolCalls, 0),
      toolErrorCount: kept.reduce((n, f) => n + f.toolErrors, 0),
      subagentCount: new Set(kept.filter((f) => f.subagent >= 0).map((f) => f.subagent)).size,
      usage: all.usage,
      costBreakdown: all.cost,
      costUsd: costOf(all.cost),
      unpricedTokens: kept
        .filter((f) => f.message.model && unpriced.has(f.message.model))
        .reduce((n, f) => n + totalTok(f.message.usage!), 0) || undefined,
    };
    out.sessions.push(summary);
    out.details.push({
      ...detail,
      summary,
      messages: kept.filter((f) => f.subagent < 0).map((f) => f.message),
      subagents: detail.subagents.flatMap((a, i) => {
        const own = kept.filter((f) => f.subagent === i);
        if (!own.length) return [];
        const { usage, cost } = sum(own);
        return [{ ...a, messages: own.map((f) => f.message), usage, costBreakdown: cost, costUsd: costOf(cost) }];
      }),
    });
  }
  return out;
}

type Group = "provider" | "model" | "project" | "branch";

/**
 * Per-day series by provider, model, project and branch, attributed per message (contract
 * v2.3): cost, tokens, messages and tool calls go to the model that produced each message; a
 * session counts under every series it has a message in that day; active time goes to the
 * session's main model (or the filtered one) on the day it started. Automatic reviews are one
 * `auto-review` series. Only messages that pass `filter` and fall in `range` count; under a
 * tool, only the sessions that called it, and only its calls and errors. Each list
 * is sorted by total cost, descending. Sessions without details count whole on their start day.
 */
export function dailySeries(
  sessions: SessionSummary[],
  details: Record<string, SessionDetail>,
  range: DateRange,
  filter: MessageFilter,
  unpriced: Set<string>,
): Required<SeriesFields> & { seriesByBranch: DailySeries[] } {
  const maps: Record<Group, Map<string, { label: string; days: Map<string, DayPoint & { ids: Set<string> }> }>> = {
    provider: new Map(),
    model: new Map(),
    project: new Map(),
    branch: new Map(),
  };
  const point = (group: Group, key: string, label: string, day: string) => {
    const series = maps[group].get(key) ?? maps[group].set(key, { label, days: new Map() }).get(key)!;
    return (
      series.days.get(day) ??
      series.days
        .set(day, { date: day, costUsd: 0, tokens: 0, activeMs: 0, sessions: 0, toolCalls: 0, toolErrors: 0, messages: 0, ids: new Set() })
        .get(day)!
    );
  };
  const modelKey = (id: string) => (isAutoReview(id) ? AUTO_REVIEW_KEY : id),
    modelLabel = (id: string) => (isAutoReview(id) ? AUTO_REVIEW_LABEL : parseModel(id).name);
  const inRange = (day: string) => matchesDays(day + "T12:00:00", range);
  const kind = filter.tokenKind ? tokenKinds.find(([k]) => k === filter.tokenKind)! : null,
    costIn = (c: CostBreakdown) => (kind ? c[kind[3]] : costOf(c)),
    tokensIn = (u: Usage | null) => (u ? tokensOf(u, filter.tokenKind ?? null) : 0);
  const callsOf = (m: Message) =>
    m.blocks.filter((b) => b.type === "toolCall" && (!filter.tool || b.name === filter.tool));
  for (const s of sessions) {
    const detail = details[s.id];
    const facts: {
      day: string;
      model: string | null;
      usage: Usage | null;
      cost: number;
      calls: number;
      errors: number;
      branch: string;
    }[] =
      detail
        ? messageFacts(detail, unpriced)
            .filter((f) => keepMessage(filter, f) && inRange(f.day))
            .map((f) => {
              const calls = callsOf(f.message);
              return {
                day: f.day,
                model: f.message.model,
                usage: f.message.usage,
                cost: costIn(f.cost),
                calls: calls.length,
                errors: calls.filter((b) => b.type === "toolCall" && b.isError).length,
                branch: f.message.branch ?? s.gitBranch ?? "Sin rama",
              };
            })
: !filter.weekday && !filter.hour && !filter.tool && (s.models.some((m) => keepModel(filter, m)) || (!filter.model && !filter.models)) &&
            inRange(localDay(s.startedAt))
          ? [{ day: localDay(s.startedAt), model: s.models[0] ?? null, usage: s.usage, cost: costIn(s.costBreakdown), calls: s.toolCallCount, errors: s.toolErrorCount, branch: s.gitBranch ?? "Sin rama" }]
          : [];
    // A tool keeps the session only when it called it among the kept messages.
    if (!facts.length || (filter.tool && !facts.some((f) => f.calls))) continue;
    const targets = (f: (typeof facts)[number]): [Group, string, string][] => [
      ["provider", s.provider, providerLabel(s.provider)],
      ["project", s.projectKey, s.projectName],
      ["branch", f.branch, f.branch],
      ...(f.model ? ([["model", modelKey(f.model), modelLabel(f.model)]] as [Group, string, string][]) : []),
    ];
    for (const f of facts)
      for (const [group, key, label] of targets(f)) {
        const p = point(group, key, label, f.day);
        p.costUsd += f.cost;
        p.tokens += tokensIn(f.usage);
        p.toolCalls += f.calls;
        p.toolErrors = (p.toolErrors ?? 0) + f.errors;
        p.messages += 1;
        if (!p.ids.has(s.id)) {
          p.ids.add(s.id);
          p.sessions += 1;
        }
      }
    const start = localDay(s.startedAt);
    if (inRange(start)) {
      const main =
        filter.model ?? sessionModels(s).find((m) => keepModel(filter, m)) ?? sessionModels(s)[0] ?? s.models[0];
      point("provider", s.provider, providerLabel(s.provider), start).activeMs += s.durationMs;
      point("project", s.projectKey, s.projectName, start).activeMs += s.durationMs;
      point("branch", facts[0].branch, facts[0].branch, start).activeMs += s.durationMs;
      // Under a model or family filter, active time never goes to a model outside it.
      if (main && keepModel(filter, main))
        point("model", modelKey(main), modelLabel(main), start).activeMs += s.durationMs;
    }
  }
  const list = (group: Group): DailySeries[] =>
    [...maps[group]]
      .map(([key, { label, days }]) => ({
        key,
        label,
        points: [...days.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(({ ids: _, ...p }) => p),
      }))
      .map((s) => ({ s, cost: s.points.reduce((n, p) => n + p.costUsd, 0) }))
      .sort((a, b) => b.cost - a.cost || a.s.key.localeCompare(b.s.key))
      .map(({ s }) => s);
  return {
    seriesByProvider: list("provider"),
    seriesByModel: list("model"),
    seriesByProject: list("project"),
    seriesByBranch: list("branch"),
  };
}
