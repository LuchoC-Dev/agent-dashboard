import { useCallback, useDeferredValue, useMemo, useState } from "react";
import type { DateRange } from "../../../bindings/DateRange";
import type { HourlyActivity } from "../../../bindings/HourlyActivity";
import type { Provider } from "../../../bindings/Provider";
import type { SessionSummary } from "../../../bindings/SessionSummary";
import type { ToolStat } from "../../../bindings/ToolStat";
import type { Usage } from "../../../bindings/Usage";
import { RangeLink as Link } from "../../../components/RangeLink";
import { Panel } from "../../../components/ui/Panel";
import { MessageState, StateText } from "../../../components/ui/states";
import { button, grid2, note } from "../../../components/ui/styles";
import type { Palette } from "../../../lib/colors";
import { dayCount, localDay } from "../../../lib/dates";
import type { FileTouch } from "../../../lib/tools";
import { tokenKinds } from "../../../lib/usage";
import {
  activeFilters,
  type FilterKey,
  type OverviewFilters,
  type TokenKind,
} from "../../../lib/filters";
import type { Metrics } from "../../../bindings/Metrics";
import { SessionsTable } from "../../sessions/components/SessionsTable";
import type { TrendSource } from "../daily-trend";
import type { Metric } from "../metrics";
import { DailyTrendChart } from "./DailyTrendChart";
import { FilesTouched } from "./FilesTouched";
import { FilterChips } from "./FilterChips";
import { KpiStrip } from "./KpiStrip";
import { ModelsByFamily } from "./ModelsByFamily";
import { ProjectsBreakdown } from "./ProjectsBreakdown";
import { SectionSkeleton } from "./SectionSkeleton";
import { TopToolsTable } from "./TopToolsTable";
import { UsageByHourHeatmap } from "./UsageByHourHeatmap";


const kindLabel = (k: TokenKind) => tokenKinds.find(([key]) => key === k)![1].toLowerCase();

/** Rows of "Sesiones recientes". */
export const RECENT_ROWS = 7;
export type CrossFilter = {
  filters: OverviewFilters;
  /** Applies a filter, or clears it when it is already the active value (or null). */
  toggle: (key: FilterKey, value: string | null) => void;
  /** A heatmap cell: weekday and hour together. */
  toggleSlot: (weekday: number, hour: number) => void;
  clearAll: () => void;
};

/** The Sesiones link behind the dashboard: its project, model and day carried along. */
function sessionsQuery(projectKey?: string, f?: OverviewFilters) {
  const q = new URLSearchParams();
  const project = projectKey ?? f?.project;
  if (project) q.set("proyecto", project);
  if (f?.model) q.set("modelo", f.model);
  if (f?.tool) q.set("herramienta", f.tool);
  if (f?.day) {
    q.set("from", f.day);
    q.set("to", f.day);
  }
  return q.size ? "?" + q : "";
}

/**
 * Each section's measured height per breakpoint (sample data, both providers), so its skeleton
 * takes the same space and nothing jumps when the data lands. Static strings: Tailwind finds
 * the classes in the source.
 */
const SKELETON = {
  kpis: "h-[313px] narrow:h-[336px] phone:h-[678px]",
  trend: "h-[363px] compact:h-[401px]",
  heatmap: "h-[315px] collapsed:h-[263px]",
  tools: "h-[315px]",
  projects: "h-[467px]",
  models: "h-[467px]",
  sessions: "h-[315px]",
};

/**
 * The metrics dashboard, one component for every scope: global on Resumen, scoped to one
 * project (`projectKey`, plus the `files` its sessions touched under the filters) on
 * the project page. Both get their props from `useDashboardData`, so filters, cross-filter
 * clicks, chips, loading and fixes are shared. Each section shows a skeleton of its final
 * size until its data arrives (`loading`: the sessions are not final yet; no
 * `metrics`/`tools`/`files`: not fetched yet); `stale` dims it while newer data loads.
 * `trend` is what the daily chart reads: the range-wide series (the day filter narrows the
 * rest), plus the branches on a project.
 */
export function Dashboard({
  sessions,
  metrics,
  trend = metrics,
  activity,
  allUsage,
  tools,
  range,
  colors,
  projectKey,
  files,
  onAll,
  loading = false,
  stale = false,
  cross,
}: {
  sessions: SessionSummary[];
  metrics: Metrics | undefined;
  trend?: TrendSource;
  /** The heatmap's cells when they differ from `metrics` (the week without the slot filter). */
  activity?: HourlyActivity[];
  /** Every kind's tokens under a token-kind filter (the token tile's bar and share). */
  allUsage?: Usage;
  tools: ToolStat[] | undefined;
  range: DateRange;
  colors: Palette;
  projectKey?: string;
  files?: FileTouch[];
  onAll?: () => void;
  loading?: boolean;
  stale?: boolean;
  /** Resumen's cross-filters: every segment, row, cell and KPI line sets one. */
  cross?: CrossFilter;
}) {
  const [metric, setMetric] = useState<Metric>("cost");
  // Por proyecto shows as many rows as keep it level with Por modelo beside it.
  const [modelsPanel, setModelsPanel] = useState<HTMLDivElement | null>(null);
  // Panels that rank by the metric follow it deferred, like the chart.
  const shownMetric = useDeferredValue(metric);
  const filters = cross?.filters,
    tokenKind = filters?.tokenKind ?? null,
    toggle = cross?.toggle;
  const on = useCallback(
    <T extends string>(key: FilterKey) =>
      toggle && ((value: T) => toggle(key, value)),
    [toggle],
  );
  const handlers = useMemo(
    () => ({
      provider: on<Provider>("provider"),
      tokenKind: on<TokenKind>("tokenKind"),
      project: on("project"),
      model: on("model"),
      tool: on("tool"),
      weekday: toggle && ((w: number) => toggle("weekday", String(w))),
      hour: toggle && ((h: number) => toggle("hour", String(h))),
    }),
    [on, toggle],
  );
  const kpiFilters = useMemo(
    () =>
      cross && {
        provider: cross.filters.provider,
        tokenKind,
        onProvider: handlers.provider!,
        onTokenKind: handlers.tokenKind!,
      },
    [cross, tokenKind, handlers],
  );
  // The table lists the day's sessions under a day filter; the chart keeps the whole range
  // (its other days dimmed) so the day can be changed or cleared from it.
  const listed = useMemo(
    () => (filters?.day ? sessions.filter((s) => localDay(s.startedAt) === filters.day) : sessions),
    [sessions, filters?.day],
  );
  const recent = useMemo(
    () =>
      [...listed]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, projectKey ? 50 : RECENT_ROWS),
    [listed, projectKey],
  );
  const chips = cross && (
    <FilterChips
      filters={cross.filters}
      colors={colors}
      onRemove={(key) => cross.toggle(key, null)}
      onClear={cross.clearAll}
    />
  );
  if (!loading && !sessions.length)
    return (
      <>
        {chips}
        {filters && activeFilters(filters).some((k) => k !== "provider") ? (
          <MessageState title="Ninguna sesión coincide con los filtros">
            <StateText>Quitá alguno de los filtros de arriba.</StateText>
            <button className={button()} onClick={cross!.clearAll}>
              Quitar filtros
            </button>
          </MessageState>
        ) : (
          <MessageState title="No hay sesiones en este rango">
            <StateText>Probá otro rango de fechas para ver la actividad.</StateText>
            {onAll && (
              <button className={button()} onClick={onAll}>
                Ver todo
              </button>
            )}
          </MessageState>
        )}
      </>
    );
  const sessionsLink = "/sesiones" + sessionsQuery(projectKey, filters);
  return (
    <div
      className={
        "dashboard-tables flex flex-col gap-4 transition-opacity duration-200" +
        // Only a slow update dims: a switch served from the cache never flickers.
        (stale ? " opacity-70 delay-300" : "")
      }
      data-stale={stale || undefined}
    >
      {chips}
      {metrics ? (
        <KpiStrip
          totals={metrics.totals}
          metric={metric}
          onMetric={setMetric}
          days={filters?.day ? 1 : dayCount(range)}
          byProvider={metrics.byProvider}
          tool={filters?.tool}
          filters={kpiFilters}
          allUsage={allUsage}
        />
      ) : (
        <SectionSkeleton height={SKELETON.kpis} />
      )}
      {tokenKind && (
        <p className={note}>
          Costo y tokens cuentan solo {kindLabel(tokenKind)} en todo el tablero. Sesiones,
          mensajes, herramientas y tiempo activo no dependen del tipo de token.
        </p>
      )}
      {loading || !trend ? (
        <SectionSkeleton title="Por día" height={SKELETON.trend} />
      ) : (
        <DailyTrendChart
          source={trend}
          range={range}
          colors={colors}
          metric={metric}
          onMetric={setMetric}
          projectKey={projectKey}
          filters={filters}
          onFilter={toggle}
        />
      )}
      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-4 collapsed:grid-cols-1">
        {metrics ? (
          <UsageByHourHeatmap
            activity={activity ?? metrics.hourlyActivity}
            weekday={filters?.weekday ?? null}
            hour={filters?.hour ?? null}
            onCell={cross?.toggleSlot}
            onWeekday={handlers.weekday}
            onHour={handlers.hour}
          />
        ) : (
          <SectionSkeleton title="Uso por hora" height={SKELETON.heatmap} />
        )}
        {tools ? (
          <TopToolsTable tools={tools} selected={filters?.tool} onSelect={handlers.tool} />
        ) : (
          <SectionSkeleton title="Herramientas" height={SKELETON.tools} />
        )}
      </div>
      <div className={grid2}>
        {projectKey ? (
          files ? (
            <FilesTouched files={files} />
          ) : (
            <SectionSkeleton title="Archivos más tocados" height={SKELETON.projects} />
          )
        ) : metrics ? (
          <ProjectsBreakdown
            groups={metrics.byProject}
            series={metrics.seriesByProject}
            metric={shownMetric}
            colors={colors}
            selected={filters?.project}
            onSelect={handlers.project}
            tokenKind={tokenKind}
            match={modelsPanel}
          />
        ) : (
          <SectionSkeleton title="Por proyecto" height={SKELETON.projects} />
        )}
        {metrics ? (
          // On Resumen its natural height (not stretched by the grid) is what Por proyecto fills.
          <div ref={setModelsPanel} className={projectKey ? "grid" : "grid self-start"}>
            <ModelsByFamily
              metrics={metrics}
              colors={colors}
              projectKey={projectKey}
              selected={filters?.model}
              onSelect={handlers.model}
              tokenKind={tokenKind}
            />
          </div>
        ) : (
          <SectionSkeleton title="Por modelo" height={SKELETON.models} />
        )}
      </div>
      {loading ? (
        <SectionSkeleton title="Sesiones recientes" height={SKELETON.sessions} />
      ) : (
        <Panel
          title={projectKey ? "Sesiones del proyecto" : "Sesiones recientes"}
          action={<Link to={sessionsLink}>Ver todas ({listed.length}) →</Link>}
          flush
        >
          <SessionsTable
            sessions={recent}
            colors={colors}
            hideProject={!!projectKey}
            tool={filters?.tool}
          />
        </Panel>
      )}
      <div className={note}>
        Cada cifra se puede explorar por día, proyecto o modelo.{" "}
        <Link to={sessionsLink}>Ver las sesiones detrás de estas métricas →</Link>
      </div>
    </div>
  );
}
