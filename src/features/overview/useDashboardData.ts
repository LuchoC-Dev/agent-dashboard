import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useDashboard } from "../../app/dashboard-context";
import { useFixture } from "../../hooks/useFixture";
import { useOverviewFilters } from "../../hooks/useOverviewFilters";
import { unpricedModels } from "../../lib/aggregate";
import { hasDate } from "../../lib/dates";
import { modelArgs, type OverviewFilters } from "../../lib/filters";
import { matchesModel } from "../../lib/models";
import { keyOfPath } from "../../lib/projects";
import { withToolCounts } from "../../lib/sessions";
import { filesTouched } from "../../lib/tools";
import { dailySeries } from "../../lib/series";
import { projectQueries } from "../projects/queries";
import { sessionQueries } from "../sessions/queries";
import { toolQueries } from "../tools/queries";
import type { CrossFilter } from "./components/Dashboard";
import { trendSpan, type TrendSource } from "./daily-trend";
import { usePrefetchOverview } from "./prefetch";
import { overviewQueries } from "./queries";

/**
 * What a dashboard shows. Resumen has no scope; the project dashboard fixes `projectKey`
 * (contract v2.5: every working copy of the repository): the project is then part of every
 * query (never a removable filter) and the rest of the cross-filters work exactly as on
 * Resumen.
 */
export type DashboardScope = { projectKey?: string };

/**
 * Every query behind a dashboard (Resumen, or the same dashboard scoped to one project), read
 * from the URL cross-filters (`proveedor`, `proyecto`, `modelo`, `dia`, `diasem`, `hora`,
 * `tokens`, `herramienta`) plus the scope. The backend applies provider, project, model, day,
 * the weekday/hour slot, the token kind (contracts v2.2–v2.4: the kind narrows every token
 * and cost figure, never sessions, messages, tools, time or the hourly activity) and the tool
 * (contract v2.6: only the sessions that called it; tool figures count only its calls). The
 * session lists are narrowed here (the slot and the tool through the backend's list). A
 * project also loads its sessions' details, for the files it touched and the per-branch
 * series; the rest comes from the same metric commands as Resumen.
 */
export function useDashboardData({ projectKey }: DashboardScope = {}) {
  const {
      ready,
      sessions,
      everything,
      report,
      range: picked,
      resolvedRange,
      provider,
      providers,
      colors,
      setRange,
    } = useDashboard(),
    fixture = useFixture(),
    url = useOverviewFilters();
  // In a project's scope the project is fixed: not read from the URL, not a chip.
  const filters: OverviewFilters = useMemo(
    () => (projectKey ? { ...url.filters, project: null } : url.filters),
    [url.filters, projectKey],
  );
  // A pre-v2.5 `?proyecto=` holds a working-copy path: it means that path's project.
  const project =
    projectKey ?? (filters.project && (keyOfPath(filters.project, everything) ?? filters.project));
  // A family (`familia:opus`) goes to the commands as every version of it (contract v2.5).
  const { model, models } = useMemo(
    () => modelArgs(filters.model, colors.models),
    [filters.model, colors.models],
  );
  const cross = {
      projectKey: project,
      model,
      models,
      weekday: filters.weekday,
      hour: filters.hour,
      tool: filters.tool,
    },
    // Token and cost figures count only the filtered kind (contract v2.4).
    kinded = { ...cross, tokenKind: filters.tokenKind },
    slot = filters.weekday !== null || filters.hour !== null,
    // The slot and the tool narrow the session lists through the backend's list.
    narrow = slot || filters.tool !== null,
    dayRange = filters.day ? { from: filters.day, to: filters.day } : resolvedRange;
  const metrics = useQuery({
    ...overviewQueries.metrics(dayRange, provider, fixture, kinded),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
  const tools = useQuery({
    ...toolQueries.stats(dayRange, provider, fixture, cross),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
  // The chart spans the whole range even under a day filter, so it needs the range-wide series.
  const rangeMetrics = useQuery({
    ...overviewQueries.metrics(resolvedRange, provider, fixture, kinded),
    enabled: ready && !!filters.day,
    placeholderData: keepPreviousData,
  });
  // The heatmap keeps the whole week under a weekday/hour filter (dimmed outside it), so
  // another slot can be picked; that query is usually cached from before the filter.
  const unslotted = useQuery({
    ...overviewQueries.metrics(dayRange, provider, fixture, {
      projectKey: project,
      model,
      models,
      tool: filters.tool,
    }),
    enabled: ready && slot,
    placeholderData: keepPreviousData,
  });
  // Under a token kind the token bar still shows (and switches between) every kind, and the
  // tile says what share of all tokens the kind is: the same figures without the kind.
  const allKinds = useQuery({
    ...overviewQueries.metrics(dayRange, provider, fixture, cross),
    enabled: ready && !!filters.tokenKind,
    placeholderData: keepPreviousData,
  });
  // Under a tool the list also counts each session's calls to it among the messages of the
  // model or family (contract v2.6.1), so the model goes too.
  const narrowed = useQuery({
    ...sessionQueries.slot(
      resolvedRange,
      provider,
      fixture,
      filters.tool ? cross : { ...cross, model: null, models: null },
    ),
    enabled: ready && narrow,
    placeholderData: keepPreviousData,
  });
  usePrefetchOverview({
    enabled: !projectKey && ready && !!metrics.data && !metrics.isPlaceholderData,
    all: everything,
    report,
    provider,
    providers,
    range: picked,
    fixture,
  });
  const narrowIds = useMemo(
    () => (narrow && narrowed.data ? new Set(narrowed.data.map((s) => s.id)) : null),
    [narrow, narrowed.data],
  );
  const scoped = useMemo(
    () => sessions.filter((s) => hasDate(s.startedAt) && (!project || s.projectKey === project)),
    [sessions, project],
  );
  const shown = useMemo(() => {
    const kept = scoped.filter(
      (s) =>
        (!filters.model || s.models.some((m) => matchesModel(m, filters.model!))) &&
        (!narrowIds || narrowIds.has(s.id)),
    );
    // Under a tool the lists count only its calls (contract v2.6.1).
    return filters.tool && narrowed.data ? withToolCounts(kept, narrowed.data) : kept;
  }, [scoped, filters.model, filters.tool, narrowIds, narrowed.data]);
  // A project's details: the files it touched and its per-branch series.
  const ids = useMemo(() => (projectKey ? scoped.map((s) => s.id) : []), [projectKey, scoped]);
  const details = useQuery({
    ...projectQueries.details(projectKey ?? "", ids),
    enabled: ready && ids.length > 0,
  });
  // "Archivos más tocados" follows every filter: the sessions on screen (provider, model,
  // slot, tool), then only their messages of that model or family, slot and day (contract v2.5).
  const files = useMemo(() => {
    if (!details.data) return undefined;
    const on = new Set(shown.map((s) => s.id));
    return filesTouched(
      details.data.filter((d) => on.has(d.summary.id)),
      { model, models, weekday: filters.weekday, hour: filters.hour, day: filters.day },
    );
  }, [details.data, shown, model, models, filters.weekday, filters.hour, filters.day]);
  const trendMetrics = filters.day ? rangeMetrics.data : metrics.data;
  const trend: TrendSource | undefined = useMemo(() => {
    if (!projectKey || !trendMetrics) return trendMetrics;
    if (!details.data) return trendMetrics;
    const byId = Object.fromEntries(details.data.map((d) => [d.summary.id, d]));
    return {
      ...trendMetrics,
      seriesByBranch: dailySeries(
        scoped,
        byId,
        resolvedRange,
        {
          model,
          models,
          weekday: filters.weekday,
          hour: filters.hour,
          tokenKind: filters.tokenKind,
          tool: filters.tool,
        },
        unpricedModels(details.data),
      ).seriesByBranch,
    };
  }, [projectKey, trendMetrics, details.data, scoped, resolvedRange, filters, model, models]);
  // "Todo" starts the chart and the per-day averages at this scope's first day with data.
  const span = useMemo(() => trendSpan(trend, picked, resolvedRange), [trend, picked, resolvedRange]);
  const crossFilter: CrossFilter = useMemo(
    () => ({ filters, toggle: url.toggle, toggleSlot: url.toggleSlot, clearAll: url.clearAll }),
    [filters, url.toggle, url.toggleSlot, url.clearAll],
  );
  return {
    loading: !ready || (narrow && !narrowed.data),
    sessions: shown,
    metrics: metrics.data,
    trend,
    activity: slot ? unslotted.data?.hourlyActivity : undefined,
    allUsage: filters.tokenKind ? allKinds.data?.totals.usage : undefined,
    tools: ready ? tools.data : undefined,
    files,
    // The previous slot's (or tool's) sessions stand in until the new ones load: stale too.
    stale:
      metrics.isPlaceholderData || tools.isPlaceholderData || (narrow && narrowed.isPlaceholderData),
    range: span,
    colors,
    onAll: () => setRange({}),
    cross: crossFilter,
    projectKey,
  };
}
