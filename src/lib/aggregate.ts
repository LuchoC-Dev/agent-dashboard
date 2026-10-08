import type { CostBreakdown } from "../bindings/CostBreakdown";
import type { DailySeries } from "../bindings/DailySeries";
import type { DateRange } from "../bindings/DateRange";
import type { GroupBucket } from "../bindings/GroupBucket";
import type { HourlyActivity } from "../bindings/HourlyActivity";
import type { Message } from "../bindings/Message";
import type { Metrics } from "../bindings/Metrics";
import type { SessionDetail } from "../bindings/SessionDetail";
import type { SessionSummary } from "../bindings/SessionSummary";
import type { Usage } from "../bindings/Usage";
import { addDays, hasDate, localDay, matchesDays, today } from "./dates";
import { hourCells, sessionActivity } from "./activity";
import { parseModel } from "./models";
import { PROVIDERS, providerLabel } from "./providers";
import {
  addCost,
  addUsage,
  costOf,
  tokenKinds,
  totalTok,
  zeroCost,
  zeroUsage,
} from "./usage";

/**
 * Models with no price, inferred from the details: a single-model scope (main session or
 * sub-agent) that used tokens but cost nothing. Their cost share is 0 and their tokens unpriced.
 */
export function unpricedModels(details: SessionDetail[]) {
  const ids = new Set<string>();
  const check = (messages: Message[], costUsd: number, unpriced = 0) => {
    const models = new Set(messages.flatMap((m) => (m.usage && m.model ? [m.model] : [])));
    if (models.size === 1 && costUsd < 1e-9 && unpriced > 0) ids.add([...models][0]);
  };
  for (const d of details) {
    for (const a of d.subagents) check(a.messages, a.costUsd, a.unpricedTokens);
    check(
      d.messages,
      d.summary.costUsd - d.subagents.reduce((n, a) => n + a.costUsd, 0),
      (d.summary.unpricedTokens ?? 0) -
        d.subagents.reduce((n, a) => n + (a.unpricedTokens ?? 0), 0),
    );
  }
  return ids;
}

/** Used for project dashboards and mock range filtering; model shares use recorded message usage. */
export function aggregate(
  sessions: SessionSummary[],
  range: DateRange,
  details: SessionDetail[] = [],
  model?: string,
  weekday?: number,
  hour?: number,
): Metrics {
  if (model) return aggregateForModel(sessions, range, details, model, weekday, hour);
  if (weekday != null || hour != null)
    return aggregateForFilter(sessions, range, details, undefined, weekday, hour);
  sessions = sessions.filter(
    (s) => hasDate(s.startedAt) && matchesDays(s.startedAt, range),
  );
  const unpricedIds = unpricedModels(details);
  const totals = {
    sessions: sessions.length,
    messages: 0,
    toolCalls: 0,
    toolErrors: 0,
    subagents: 0,
    usage: zeroUsage(),
    costUsd: 0,
    costBreakdown: zeroCost(),
    activeMs: 0,
    unpricedTokens: 0,
  };
  const projects: GroupBucket[] = [],
    models: GroupBucket[] = [],
    providers: GroupBucket[] = [],
    byDay: Metrics["byDay"] = [];
  const sortedDays = sessions.map((s) => localDay(s.startedAt)).sort();
  const from = range.from || sortedDays[0] || today(),
    to = range.to || sortedDays[sortedDays.length - 1] || from;
  for (let day = from; day <= to; day = addDays(day, 1))
    byDay.push({
      date: day,
      sessions: 0,
      toolCalls: 0,
      usage: zeroUsage(),
      costUsd: 0,
      costBreakdown: zeroCost(),
      unpricedTokens: 0,
    });
  const bump = (
    groups: GroupBucket[],
    key: string,
    label: string,
    usage: Usage,
    breakdown: CostBreakdown,
    unpriced: number,
  ) => {
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = {
        key,
        label,
        sessions: 0,
        usage: zeroUsage(),
        costUsd: 0,
        costBreakdown: zeroCost(),
        unpricedTokens: 0,
      };
      groups.push(g);
    }
    g.sessions++;
    addUsage(g.usage, usage);
    addCost(g.costBreakdown, breakdown);
    g.costUsd += costOf(breakdown);
    g.unpricedTokens! += unpriced;
  };
  for (const s of sessions) {
    const unpriced = s.unpricedTokens ?? 0;
    totals.messages += s.messageCount;
    totals.toolCalls += s.toolCallCount;
    totals.toolErrors += s.toolErrorCount;
    totals.subagents += s.subagentCount;
    totals.costUsd += s.costUsd;
    totals.activeMs += s.durationMs;
    totals.unpricedTokens += unpriced;
    addUsage(totals.usage, s.usage);
    addCost(totals.costBreakdown, s.costBreakdown);
    const day = byDay.find((d) => d.date === localDay(s.startedAt));
    if (day) {
      day.sessions++;
      day.toolCalls += s.toolCallCount;
      day.costUsd += s.costUsd;
      day.unpricedTokens! += unpriced;
      addUsage(day.usage, s.usage);
      addCost(day.costBreakdown, s.costBreakdown);
    }
    bump(projects, s.projectKey, s.projectName, s.usage, s.costBreakdown, unpriced);
    bump(providers, s.provider, providerLabel(s.provider), s.usage, s.costBreakdown, unpriced);
    for (const [id, m] of byModel(s, details.find((d) => d.summary.id === s.id), unpricedIds))
      bump(models, id, parseModel(id).name, m.usage, m.cost, m.unpriced);
  }
  const byCost = (a: GroupBucket, b: GroupBucket) => b.costUsd - a.costUsd;
  const detailById = new Map(details.map((detail) => [detail.summary.id, detail]));
  const hourlyActivity: HourlyActivity[] = hourCells(
    sessionActivity(
      sessions.flatMap((session) => {
        const detail = detailById.get(session.id);
        return detail ? [detail] : [];
      }),
    ),
  ).map((cell, index) => ({
    weekday: Math.floor(index / 24),
    hour: index % 24,
    messages: cell.messages,
    sessions: cell.sessions.size,
  }));
  const series = dailySeries(sessions, details, range, undefined, undefined, undefined);
  return {
    range,
    totals,
    byDay,
    byProject: projects.sort(byCost),
    byModel: models.sort(byCost),
    hourlyActivity,
    seriesByProvider: series.provider,
    seriesByModel: series.model,
    seriesByProject: series.project,
    ...(providers.length > 1
      ? {
          byProvider: providers.sort(
            (a, b) =>
              byCost(a, b) ||
              PROVIDERS.indexOf(a.key as never) - PROVIDERS.indexOf(b.key as never),
          ),
        }
      : {}),
  };
}

function aggregateForModel(
  sessions: SessionSummary[],
  range: DateRange,
  details: SessionDetail[],
  model: string,
  weekday?: number,
  hour?: number,
): Metrics {
  return aggregateForFilter(sessions, range, details, model, weekday, hour);
}

type MessageMetric = {
  message: Message;
  model: string | null;
  subagentId?: string;
  cost: CostBreakdown;
};
type SelectedSession = { summary: SessionSummary; messages: MessageMetric[] };

function aggregateForFilter(
  sessions: SessionSummary[],
  range: DateRange,
  details: SessionDetail[],
  model?: string,
  weekday?: number,
  hour?: number,
): Metrics {
  sessions = sessions.filter(
    (session) => hasDate(session.startedAt) && matchesDays(session.startedAt, range),
  );
  const detailById = new Map(details.map((detail) => [detail.summary.id, detail]));
  const unpricedIds = unpricedModels(details);
  const totals = {
    sessions: 0,
    messages: 0,
    toolCalls: 0,
    toolErrors: 0,
    subagents: 0,
    usage: zeroUsage(),
    costUsd: 0,
    costBreakdown: zeroCost(),
    activeMs: 0,
    unpricedTokens: 0,
  };
  const projects: GroupBucket[] = [];
  const models: GroupBucket[] = [];
  const providers: GroupBucket[] = [];
  const selectedSessions: SelectedSession[] = [];
  const sortedDays = sessions.map((s) => localDay(s.startedAt)).sort();
  const from = range.from || sortedDays[0] || today();
  const to = range.to || sortedDays[sortedDays.length - 1] || from;
  const byDay: Metrics["byDay"] = [];
  for (let day = from; day <= to; day = addDays(day, 1))
    byDay.push({
      date: day,
      sessions: 0,
      toolCalls: 0,
      usage: zeroUsage(),
      costUsd: 0,
      costBreakdown: zeroCost(),
      unpricedTokens: 0,
    });
  const activity = new Map<number, Set<string>>();
  const activityMessages = new Array<number>(168).fill(0);

  for (const session of sessions) {
    const detail = detailById.get(session.id);
    const prepared = prepareMessages(session, detail, unpricedIds);
    const selected = prepared.filter(({ message, model: messageModel }) => {
      if (model && messageModel !== model) return false;
      if (weekday == null && hour == null) return true;
      const timestamp = Date.parse(message.timestamp);
      if (!Number.isFinite(timestamp)) return false;
      const date = new Date(timestamp);
      return (
        (weekday == null || (date.getDay() + 6) % 7 === weekday) &&
        (hour == null || date.getHours() === hour)
      );
    });
    if (!selected.length) continue;
    selectedSessions.push({ summary: session, messages: selected });

    const usage = zeroUsage();
    const cost = zeroCost();
    const selectedByModel = new Map<string, { usage: Usage; cost: CostBreakdown; unpriced: number }>();
    const selectedSubagents = new Set<string>();
    let messageCount = 0,
      toolCalls = 0,
      toolErrors = 0,
      unpriced = 0;
    for (const entry of selected) {
      messageCount++;
      const messageTools = entry.message.blocks.filter((block) => block.type === "toolCall");
      toolCalls += messageTools.length;
      toolErrors += messageTools.filter((block) => block.type === "toolCall" && block.isError).length;
      if (entry.subagentId) selectedSubagents.add(entry.subagentId);
      if (entry.message.usage) {
        addUsage(usage, entry.message.usage);
        addCost(cost, entry.cost);
        const key = entry.model ?? "unknown";
        let group = selectedByModel.get(key);
        if (!group) {
          group = { usage: zeroUsage(), cost: zeroCost(), unpriced: 0 };
          selectedByModel.set(key, group);
        }
        addUsage(group.usage, entry.message.usage);
        addCost(group.cost, entry.cost);
        const tokenCount = totalTok(entry.message.usage);
        if (unpricedIds.has(key) || key === "unknown") {
          group.unpriced += tokenCount;
          unpriced += tokenCount;
        }
      }
      const timestamp = Date.parse(entry.message.timestamp);
      if (Number.isFinite(timestamp)) {
        const date = new Date(timestamp), cell = (date.getDay() + 6) % 7 * 24 + date.getHours();
        activityMessages[cell]++;
        const sessionsInCell = activity.get(cell) ?? new Set<string>();
        sessionsInCell.add(session.id);
        activity.set(cell, sessionsInCell);
      }
    }
    totals.sessions++;
    totals.messages += messageCount;
    totals.toolCalls += toolCalls;
    totals.toolErrors += toolErrors;
    totals.subagents += selectedSubagents.size;
    addUsage(totals.usage, usage);
    addCost(totals.costBreakdown, cost);
    totals.costUsd = costOf(totals.costBreakdown);
    totals.unpricedTokens += unpriced;
    if (!model || session.models[0] === model) totals.activeMs += session.durationMs;

    const day = byDay.find((point) => point.date === localDay(session.startedAt));
    if (day) {
      day.sessions++;
      day.toolCalls += toolCalls;
      day.costUsd += costOf(cost);
      day.unpricedTokens! += unpriced;
      addUsage(day.usage, usage);
      addCost(day.costBreakdown, cost);
    }
    bumpGroup(projects, session.projectKey, session.projectName, usage, cost, unpriced);
    bumpGroup(providers, session.provider, providerLabel(session.provider), usage, cost, unpriced);
    for (const [key, group] of selectedByModel)
      bumpGroup(models, key, parseModel(key).name, group.usage, group.cost, group.unpriced);
  }
  const hourlyActivity: HourlyActivity[] = activityMessages.map((messages, index) => ({
    weekday: Math.floor(index / 24),
    hour: index % 24,
    messages,
    sessions: activity.get(index)?.size ?? 0,
  }));
  const series = finishDailySeries(selectedSessions, range, model);
  const byCost = (a: GroupBucket, b: GroupBucket) => b.costUsd - a.costUsd;
  const result: Metrics = {
    range,
    totals,
    byDay,
    byProject: projects.sort(byCost),
    byModel: models.sort(byCost),
    hourlyActivity,
    seriesByProvider: series.provider,
    seriesByModel: series.model,
    seriesByProject: series.project,
  };
  if (providers.length > 1) result.byProvider = providers.sort(byCost);
  return result;
}

function bumpGroup(
  groups: GroupBucket[],
  key: string,
  label: string,
  usage: Usage,
  breakdown: CostBreakdown,
  unpriced: number,
) {
  let group = groups.find((entry) => entry.key === key);
  if (!group) {
    group = {
      key,
      label,
      sessions: 0,
      usage: zeroUsage(),
      costUsd: 0,
      costBreakdown: zeroCost(),
      unpricedTokens: 0,
    };
    groups.push(group);
  }
  group.sessions++;
  addUsage(group.usage, usage);
  addCost(group.costBreakdown, breakdown);
  group.costUsd += costOf(breakdown);
  group.unpricedTokens! += unpriced;
}

function prepareMessages(
  summary: SessionSummary,
  detail: SessionDetail | undefined,
  unpricedIds: Set<string>,
): MessageMetric[] {
  if (!detail) return [];
  const raw = [
    ...detail.messages.map((message) => ({ message, subagentId: undefined as string | undefined })),
    ...detail.subagents.flatMap((agent) =>
      agent.messages.map((message) => ({ message, subagentId: agent.id })),
    ),
  ];
  const full = byModel(summary, detail, unpricedIds, false);
  const result: MessageMetric[] = [];
  for (const { message, subagentId } of raw) {
    const model = message.model || (message.usage ? "unknown" : null);
    let cost = zeroCost();
    if (model && message.usage) {
      const share = full.get(model);
      const total = share?.usage ?? zeroUsage();
      for (const [tokenKey, , , costKey] of tokenKinds) {
        cost[costKey] = total[tokenKey]
          ? (share?.cost[costKey] ?? 0) * (message.usage[tokenKey] / total[tokenKey])
          : 0;
      }
    }
    result.push({ message, model, subagentId, cost });
  }
  return result;
}

function dailySeries(
  sessions: SessionSummary[],
  details: SessionDetail[],
  range: DateRange,
  model?: string,
  weekday?: number,
  hour?: number,
) {
  const detailById = new Map(details.map((detail) => [detail.summary.id, detail]));
  const unpricedIds = unpricedModels(details);
  const selected: SelectedSession[] = [];
  for (const summary of sessions) {
    const detail = detailById.get(summary.id);
    const messages = prepareMessages(summary, detail, unpricedIds).filter(({ message, model: id }) => {
      if (model && id !== model) return false;
      if (weekday == null && hour == null) return true;
      const timestamp = Date.parse(message.timestamp);
      if (!Number.isFinite(timestamp)) return false;
      const date = new Date(timestamp);
      return (
        (weekday == null || (date.getDay() + 6) % 7 === weekday) &&
        (hour == null || date.getHours() === hour)
      );
    });
    if (messages.length) selected.push({ summary, messages });
  }
  return finishDailySeries(selected, range, model);
}

function finishDailySeries(
  sessions: SelectedSession[],
  range: DateRange,
  modelFilter?: string,
) {
  type Point = {
    date: string;
    costUsd: number;
    tokens: number;
    activeMs: number;
    sessions: Set<string>;
    toolCalls: number;
    messages: number;
  };
  const groups = {
    provider: new Map<string, { label: string; points: Map<string, Point> }>(),
    model: new Map<string, { label: string; points: Map<string, Point> }>(),
    project: new Map<string, { label: string; points: Map<string, Point> }>(),
  };
  const from = range.from || "0000-01-01", to = range.to || "9999-12-31";
  const bump = (
    target: typeof groups.provider,
    key: string,
    label: string,
    day: string,
    sessionId: string,
    message?: MessageMetric,
  ) => {
    const group = target.get(key) ?? { label, points: new Map<string, Point>() };
    const point = group.points.get(day) ?? {
      date: day,
      costUsd: 0,
      tokens: 0,
      activeMs: 0,
      sessions: new Set<string>(),
      toolCalls: 0,
      messages: 0,
    };
    if (message) {
      point.sessions.add(sessionId);
      point.messages++;
      point.toolCalls += message.message.blocks.filter((block) => block.type === "toolCall").length;
      point.costUsd += costOf(message.cost);
      if (message.message.usage) point.tokens += totalTok(message.message.usage);
    }
    group.points.set(day, point);
    target.set(key, group);
    return point;
  };
  for (const { summary, messages } of sessions) {
    let hasPoint = false;
    for (const message of messages) {
      const day = localDay(message.message.timestamp);
      if (!day || day < from || day > to) continue;
      hasPoint = true;
      bump(groups.provider, summary.provider, providerLabel(summary.provider), day, summary.id, message);
      bump(groups.project, summary.projectKey, summary.projectName, day, summary.id, message);
      if (message.model) {
        const key = message.model === "codex-auto-review" ? "auto-review" : message.model;
        const label = message.model === "codex-auto-review" ? "Revisiones automáticas" : message.model;
        bump(groups.model, key, label, day, summary.id, message);
      }
    }
    const startDay = localDay(summary.startedAt);
    if (!hasPoint || !startDay || startDay < from || startDay > to) continue;
    const addActive = (
      target: typeof groups.provider,
      key: string,
      label: string,
    ) => {
      const point = bump(target, key, label, startDay, summary.id);
      point.activeMs += summary.durationMs;
    };
    addActive(groups.provider, summary.provider, providerLabel(summary.provider));
    addActive(groups.project, summary.projectKey, summary.projectName);
    const mainModel = summary.models[0];
    if (mainModel && modelFilter == null || (mainModel && modelFilter === mainModel)) {
      if (mainModel !== "codex-auto-review") addActive(groups.model, mainModel, mainModel);
    }
  }
  const finish = (source: typeof groups.provider): DailySeries[] => {
    const output = [...source].map(([key, group]) => ({
      key,
      label: group.label,
      points: [...group.points.values()]
        .map((point) => ({ ...point, sessions: point.sessions.size }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }));
    return output.sort(
      (a, b) =>
        b.points.reduce((sum, point) => sum + point.costUsd, 0) -
          a.points.reduce((sum, point) => sum + point.costUsd, 0) ||
        a.key.localeCompare(b.key),
    );
  };
  return {
    provider: finish(groups.provider),
    model: finish(groups.model),
    project: finish(groups.project),
  };
}

/** A session's usage, cost and unpriced tokens per model, apportioned by recorded usage. */
function byModel(
  s: SessionSummary,
  detail: SessionDetail | undefined,
  unpricedIds: Set<string>,
  fallback = true,
) {
  const result = new Map<string, { usage: Usage; cost: CostBreakdown; unpriced: number }>();
  const entry = (id: string) =>
    result.get(id) ||
    result.set(id, { usage: zeroUsage(), cost: zeroCost(), unpriced: 0 }).get(id)!;
  const allocate = (messages: Message[], cost: CostBreakdown) => {
    const local = new Map<string, Usage>(),
      priced = zeroUsage();
    for (const m of messages) {
      const model = m.model ?? (m.usage ? "unknown" : undefined);
      if (model && m.usage) {
        addUsage(local.get(model) || local.set(model, zeroUsage()).get(model)!, m.usage);
        if (!unpricedIds.has(model) && model !== "unknown") addUsage(priced, m.usage);
      }
    }
    const pricedCount = [...local.keys()].filter((id) => !unpricedIds.has(id)).length;
    for (const [id, u] of local) {
      const e = entry(id);
      addUsage(e.usage, u);
      if (unpricedIds.has(id) || id === "unknown") {
        e.unpriced += totalTok(u);
        continue;
      }
      for (const [kind, , , ck] of tokenKinds)
        e.cost[ck] += cost[ck] * (priced[kind] ? u[kind] / priced[kind] : 1 / pricedCount);
    }
  };
  if (detail) {
    const main = { ...s.costBreakdown };
    for (const a of detail.subagents) {
      for (const k of Object.keys(main) as (keyof CostBreakdown)[])
        main[k] -= a.costBreakdown[k];
      allocate(a.messages, a.costBreakdown);
    }
    allocate(detail.messages, main);
  }
  if (!result.size && fallback)
    result.set(s.models[0] || "Desconocido", {
      usage: s.usage,
      cost: s.costBreakdown,
      unpriced: s.unpricedTokens ?? 0,
    });
  return result;
}
