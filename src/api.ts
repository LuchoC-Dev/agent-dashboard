// Single entry point from the UI to the backend. Components never call
// `invoke` directly. With VITE_USE_MOCK=true (or outside Tauri, e.g. plain
// `npm run dev` in a browser) it serves src/mocks/mock-data.json instead.
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { DateRange } from "./bindings/DateRange";
import type { Metrics } from "./bindings/Metrics";
import type { Provider } from "./bindings/Provider";
import type { ScanReport } from "./bindings/ScanReport";
import type { SessionDetail } from "./bindings/SessionDetail";
import type { SessionFilter } from "./bindings/SessionFilter";
import type { SessionSummary } from "./bindings/SessionSummary";
import type { ToolStat } from "./bindings/ToolStat";
import type { TokenKind } from "./bindings/TokenKind";
import { aggregate, unpricedModels } from "./lib/aggregate";
import { localDay, matchesDays, metricRange } from "./lib/dates";
import {
  dailySeries,
  hasSlot,
  localSlot,
  sliceSessions,
} from "./lib/series";
import { allMessages } from "./lib/sessions";
import { toolsFromDetails } from "./lib/tools";
export type { ScanReport } from "./bindings/ScanReport";

export const useMock = import.meta.env.VITE_USE_MOCK === "true" || !isTauri();

type MockData = {
  sessions: SessionSummary[];
  details: Record<string, SessionDetail>;
  metrics: Metrics;
  toolStats: ToolStat[];
  scanReport: ScanReport;
};

// Development-only fixtures make failure/empty/loading states reviewable without touching logs.
const mock = async (): Promise<MockData> => {
  const state = new URLSearchParams(location.hash.split("?")[1]).get("estado");
  if (state === "error")
    throw {
      kind: "io",
      message: "Ejemplo: ~/.claude/projects · permiso denegado",
    };
  if (state === "cargando")
    await new Promise((resolve) => setTimeout(resolve, 5000));
  // Measurements only: emulate the native command latency (`sessionStorage["mock-latency"]` ms).
  const latency = Number(globalThis.sessionStorage?.getItem("mock-latency") || 0);
  if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
  const data = (await import("./mocks/mock-data.json"))
    .default as unknown as MockData;
  const only = state?.startsWith("solo-") ? state.slice(5) : null;
  if (only === "claude" || only === "codex") return onlyProvider(data, only);
  if (state === "escaneo") return scanInProgress(data);
  if (state === "vacio")
    return {
      ...data,
      sessions: [],
      details: {},
      metrics: aggregate([], {}),
      toolStats: [],
      scanReport: {
        ...data.scanReport,
        sessions: 0,
        errors: [],
        sources: data.scanReport.sources?.map((src) => ({ ...src, sessions: 0, errors: [] })),
      },
    };
  return data;
};

/** `?estado=solo-claude|solo-codex`: the sample data as if only one provider were installed. */
function onlyProvider(data: MockData, provider: Provider): MockData {
  const sessions = data.sessions.filter((s) => s.provider === provider),
    details = Object.fromEntries(sessions.map((s) => [s.id, data.details[s.id]])),
    sources = data.scanReport.sources?.map((src) =>
      src.provider === provider
        ? src
        : { ...src, available: false, sessions: 0, errors: [] },
    );
  return {
    sessions,
    details,
    metrics: aggregate(sessions, data.metrics.range, Object.values(details)),
    toolStats: toolsFromDetails(Object.values(details)),
    scanReport: {
      ...data.scanReport,
      sourceDir: sources?.find((src) => src.available)?.sourceDir ?? data.scanReport.sourceDir,
      sessions: sessions.length,
      errors: data.scanReport.errors.filter((e) => !e.provider || e.provider === provider),
      sources,
    },
  };
}

/** When each provider's mock scan ends (ms after the first call or the last Refrescar). */
const SCAN_ENDS = { claude: 900, codex: 2600 } satisfies Record<Provider, number>;
let scanStart: number | null = null;

/**
 * `?estado=escaneo`: a first scan in progress. Each provider exposes a growing part of its
 * sessions and reports `scanning` until its end time; Claude finishes first, as in the app.
 */
function scanInProgress(data: MockData): MockData {
  scanStart ??= Date.now();
  const elapsed = Date.now() - scanStart,
    loaded = (p: Provider) => Math.min(1, elapsed / SCAN_ENDS[p]),
    perProvider = (p: Provider) => data.sessions.filter((s) => s.provider === p),
    sessions = data.sessions.filter((s) => {
      const own = perProvider(s.provider);
      return own.indexOf(s) < Math.floor(own.length * loaded(s.provider));
    }),
    details = Object.fromEntries(sessions.map((s) => [s.id, data.details[s.id]]));
  const sources = data.scanReport.sources?.map((src) => ({
    ...src,
    sessions: sessions.filter((s) => s.provider === src.provider).length,
    scanning: loaded(src.provider) < 1,
  }));
  return {
    sessions,
    details,
    metrics: aggregate(sessions, data.metrics.range, Object.values(details)),
    toolStats: toolsFromDetails(Object.values(details)),
    scanReport: {
      ...data.scanReport,
      scannedAt: new Date().toISOString(),
      sessions: sessions.length,
      scanning: !!sources?.some((src) => src.scanning),
      sources,
    },
  };
}

function matches(
  s: SessionSummary,
  f: SessionFilter,
  detail?: SessionDetail,
): boolean {
  const q = f.search?.toLowerCase();
  // A model (or any of `models`, a family) keeps the sessions with a message of it.
  const used = (model: string) =>
    s.models.includes(model) ||
    (!!detail && allMessages(detail).some((message) => message.model === model));
  const usesModel = (!f.model || used(f.model)) && (!f.models || f.models.some(used));
  // A weekday/hour keeps the sessions with at least one message in that local slot.
  const inSlot =
    !hasSlot(f) ||
    (!!detail &&
      allMessages(detail).some((m) => {
        const [weekday, hour] = localSlot(m.timestamp);
        return (f.weekday == null || weekday === f.weekday) && (f.hour == null || hour === f.hour);
      }));
  const usesTool =
    !f.tool ||
    (!!detail &&
      allMessages(detail).some((m) => {
        const [weekday, hour] = localSlot(m.timestamp);
        return (
          (!f.model || m.model === f.model) &&
          (!f.models || (!!m.model && f.models.includes(m.model))) &&
          (f.weekday == null || weekday === f.weekday) &&
          (f.hour == null || hour === f.hour) &&
          m.blocks.some((block) => block.type === "toolCall" && block.name === f.tool)
        );
      }));
  return (
    inSlot &&
    usesTool &&
    (!f.provider || s.provider === f.provider) &&
    (!f.projectPath || s.projectPath === f.projectPath) &&
    (!f.projectKey || s.projectKey === f.projectKey) &&
    usesModel &&
    matchesDays(s.startedAt, f) &&
    (!q ||
      [s.title, s.firstPrompt, s.projectName].some((v) =>
        v?.toLowerCase().includes(q),
      ))
  );
}

function detailsForTool(
  sessions: SessionSummary[],
  details: Record<string, SessionDetail>,
  tool: string,
): Record<string, SessionDetail> {
  return Object.fromEntries(
    sessions.map((session) => {
      const detail = details[session.id];
      const keep = (items: SessionDetail["messages"]) =>
        items.map((message) => ({
          ...message,
          blocks: message.blocks.filter(
            (block) => block.type !== "toolCall" || block.name === tool,
          ),
        }));
      const messages = keep(detail.messages);
      const subagents = detail.subagents.map((agent) => ({
        ...agent,
        messages: keep(agent.messages),
      }));
      const calls = [...messages, ...subagents.flatMap((agent) => agent.messages)].flatMap(
        (message) => message.blocks.filter((block) => block.type === "toolCall"),
      );
      const summary = {
        ...detail.summary,
        toolCallCount: calls.length,
        toolErrorCount: calls.filter((call) => call.type === "toolCall" && call.isError).length,
      };
      return [session.id, { ...detail, summary, messages, subagents }];
    }),
  ) as Record<string, SessionDetail>;
}

function addToolErrorSeries(
  metrics: Metrics,
  sessions: SessionSummary[],
  details: Record<string, SessionDetail>,
  filter: { model?: string; models?: string[]; weekday?: number; hour?: number },
) {
  const errors = new Map<string, number>();
  const byDay = new Map<string, { calls: number; errors: number }>();
  let calls = 0;
  let failures = 0;
  for (const session of sessions) {
    const detail = details[session.id];
    const messages = allMessages(detail).filter((message) => {
      const [weekday, hour] = localSlot(message.timestamp);
      return (
        (!filter.model || message.model === filter.model) &&
        (!filter.models || (!!message.model && filter.models.includes(message.model))) &&
        (filter.weekday == null || weekday === filter.weekday) &&
        (filter.hour == null || hour === filter.hour)
      );
    });
    let sessionCalls = 0;
    let sessionErrors = 0;
    for (const message of messages) {
      const tools = message.blocks.filter((block) => block.type === "toolCall");
      const messageErrors = tools.filter((block) => block.type === "toolCall" && block.isError).length;
      sessionCalls += tools.length;
      sessionErrors += messageErrors;
      const date = localDay(message.timestamp);
      const model = message.model ?? (message.usage ? "unknown" : null);
      const modelKey = model === "codex-auto-review" ? "auto-review" : model;
      for (const key of [session.provider, session.projectKey, ...(modelKey ? [modelKey] : [])]) {
        const id = `${key}\u0000${date}`;
        errors.set(id, (errors.get(id) ?? 0) + messageErrors);
      }
    }
    calls += sessionCalls;
    failures += sessionErrors;
    const day = localDay(session.startedAt);
    const daily = byDay.get(day) ?? { calls: 0, errors: 0 };
    daily.calls += sessionCalls;
    daily.errors += sessionErrors;
    byDay.set(day, daily);
  }
  metrics.totals.toolCalls = calls;
  metrics.totals.toolErrors = failures;
  for (const bucket of metrics.byDay) {
    const daily = byDay.get(bucket.date);
    bucket.toolCalls = daily?.calls ?? 0;
    bucket.toolErrors = daily?.errors ?? 0;
  }
  for (const series of [
    metrics.seriesByProvider,
    metrics.seriesByProject,
    metrics.seriesByModel,
  ]) {
    for (const group of series ?? []) {
      for (const point of group.points) {
        point.toolErrors = errors.get(`${group.key}\u0000${point.date}`) ?? 0;
      }
    }
  }
}

export async function listSessions(
  filter: SessionFilter = {},
): Promise<SessionSummary[]> {
  if (useMock) {
    const data = await mock();
    return data.sessions
      .filter((s) => matches(s, filter, data.details[s.id]))
      .map((session) => {
        if (!filter.tool) return session;
        const messages = allMessages(data.details[session.id]).filter((message) => {
          const [weekday, hour] = localSlot(message.timestamp);
          return (
            (!filter.model || message.model === filter.model) &&
            (!filter.models || (!!message.model && filter.models.includes(message.model))) &&
            (filter.weekday == null || weekday === filter.weekday) &&
            (filter.hour == null || hour === filter.hour)
          );
        });
        const calls = messages.flatMap((message) =>
          message.blocks.filter(
            (block) => block.type === "toolCall" && block.name === filter.tool,
          ),
        );
        return {
          ...session,
          filteredToolCalls: calls.length,
          filteredToolErrors: calls.filter((call) => call.type === "toolCall" && call.isError).length,
        };
      });
  }
  return invoke("list_sessions", { filter });
}

export async function getSession(id: string): Promise<SessionDetail> {
  if (useMock) {
    const d = (await mock()).details[id];
    if (!d) throw { kind: "notFound", message: id };
    return d;
  }
  return invoke("get_session", { id });
}

export async function getMetrics(
  range: DateRange = {},
  provider?: Provider,
  projectPath?: string,
  model?: string,
  weekday?: number,
  hour?: number,
  tokenKind?: TokenKind,
  projectKey?: string,
  models?: string[],
  options?: { tool?: string },
): Promise<Metrics> {
  const { tool } = options ?? {};
  if (useMock) {
    const data = await mock();
    range = metricRange(range);
    const tokenData = tokenKind ? filterTokenKind(data.sessions, data.details, tokenKind) : { sessions: data.sessions, details: data.details };
    const filter = { model, models, weekday, hour },
      selectedSessions = tokenData.sessions.filter((s) =>
        matches(s, { ...range, provider, projectPath, projectKey, ...filter, tool }, tokenData.details[s.id]),
      ),
      selectedDetails = tool
        ? detailsForTool(selectedSessions, tokenData.details, tool)
        : tokenData.details,
      sessions = tool
        ? selectedSessions.map((session) => selectedDetails[session.id].summary)
        : selectedSessions,
      unpriced = unpricedModels(Object.values(selectedDetails));
    // A weekday/hour or several models select messages: the sessions shrink to those messages.
    const sliced =
      (hasSlot(filter) || !!models) && sliceSessions(sessions, selectedDetails, filter, unpriced);
    const metrics = sliced
      ? aggregate(sliced.sessions, range, sliced.details)
      : aggregate(
          sessions,
          range,
          sessions.map((s) => selectedDetails[s.id]),
          model,
        );
    const { seriesByBranch: _, ...series } = dailySeries(
      sessions,
      selectedDetails,
      range,
      filter,
      unpriced,
    );
    const output = { ...metrics, ...series };
    addToolErrorSeries(output, sessions, selectedDetails, filter);
    return output;
  }
  return invoke("get_metrics", {
    range,
    provider,
    projectPath,
    projectKey,
    model,
    models,
    weekday,
    hour,
    tokenKind,
    tool,
  });
}

function filterTokenKind(sessions: SessionSummary[], details: Record<string, SessionDetail>, kind: TokenKind) {
  const unpriced = unpricedModels(Object.values(details));
  const usage = (value: NonNullable<SessionDetail["summary"]["usage"]>) => ({
    inputTokens: kind === "input" ? value.inputTokens : 0,
    outputTokens: kind === "output" ? value.outputTokens : 0,
    cacheReadTokens: kind === "cacheRead" ? value.cacheReadTokens : 0,
    cacheCreationTokens: kind === "cacheWrite" ? value.cacheCreationTokens : 0,
    ...(kind === "output" && value.reasoningTokens != null ? { reasoningTokens: value.reasoningTokens } : {}),
  });
  const cost = (value: SessionDetail["summary"]["costBreakdown"]) => ({
    input: kind === "input" ? value.input : 0,
    output: kind === "output" ? value.output : 0,
    cacheRead: kind === "cacheRead" ? value.cacheRead : 0,
    cacheWrite: kind === "cacheWrite" ? value.cacheWrite : 0,
  });
  const tokenTotal = (value: ReturnType<typeof usage>) => value.inputTokens + value.outputTokens + value.cacheReadTokens + value.cacheCreationTokens;
  const messages = (items: SessionDetail["messages"]) => items.map((message) => ({
    ...message,
    ...(message.usage ? { usage: usage(message.usage) } : {}),
  }));
  const scopedDetails = Object.fromEntries(sessions.map((session) => {
    const detail = details[session.id];
    const subagents = detail.subagents.map((agent) => {
      const nextUsage = usage(agent.usage), nextCost = cost(agent.costBreakdown);
      return { ...agent, usage: nextUsage, costBreakdown: nextCost, costUsd: nextCost.input + nextCost.output + nextCost.cacheRead + nextCost.cacheWrite,
        unpricedTokens: agent.messages.filter((message) => message.model && unpriced.has(message.model)).reduce((sum, message) => sum + (message.usage ? tokenTotal(usage(message.usage)) : 0), 0) || undefined,
        messages: messages(agent.messages) };
    });
    const nextUsage = usage(detail.summary.usage), nextCost = cost(detail.summary.costBreakdown);
    const mainUnpriced = detail.messages.filter((message) => message.model && unpriced.has(message.model)).reduce((sum, message) => sum + (message.usage ? tokenTotal(usage(message.usage)) : 0), 0);
    const unpricedTokens = mainUnpriced + subagents.reduce((sum, agent) => sum + (agent.unpricedTokens ?? 0), 0);
    const summary = { ...detail.summary, usage: nextUsage, costBreakdown: nextCost, costUsd: nextCost.input + nextCost.output + nextCost.cacheRead + nextCost.cacheWrite,
      unpricedTokens: unpricedTokens || undefined };
    return [session.id, { ...detail, summary, messages: messages(detail.messages), subagents }];
  })) as Record<string, SessionDetail>;
  const scopedSessions = sessions.map((session) => scopedDetails[session.id].summary);
  return { sessions: scopedSessions, details: scopedDetails };
}

export async function getToolStats(
  range: DateRange = {},
  provider?: Provider,
  projectPath?: string,
  model?: string,
  weekday?: number,
  hour?: number,
  projectKey?: string,
  models?: string[],
  options?: { tool?: string },
): Promise<ToolStat[]> {
  const { tool } = options ?? {};
  if (useMock) {
    const data = await mock();
    range = metricRange(range);
    const filter = { model, models, weekday, hour, tool };
    const sessions = data.sessions.filter((s) =>
      matches(s, { ...range, provider, projectPath, projectKey, ...filter }, data.details[s.id]),
    );
    const selected = tool ? detailsForTool(sessions, data.details, tool) : data.details;
    return toolsFromDetails(
      model || models || hasSlot(filter)
        ? sliceSessions(sessions, selected, filter, new Set()).details
        : sessions.map((s) => selected[s.id]),
    ).filter((row) => !tool || row.name === tool);
  }
  return invoke("get_tool_stats", {
    range,
    provider,
    projectPath,
    projectKey,
    model,
    models,
    weekday,
    hour,
    tool,
  });
}

export async function getScanReport(): Promise<ScanReport> {
  if (useMock) return (await mock()).scanReport;
  return invoke("get_scan_report");
}

export async function refresh(): Promise<ScanReport> {
  scanStart = null;
  if (useMock)
    return {
      ...(await mock()).scanReport,
      scannedAt: new Date().toISOString(),
    };
  return invoke("refresh");
}
