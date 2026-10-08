import {
  memo,
  useCallback,
  useDeferredValue,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from "recharts";
import type { DateRange } from "../../../bindings/DateRange";
import { ChartTooltip } from "../../../components/ui/ChartTooltip";
import { OverflowLegend, type LegendEntry } from "../../../components/ui/OverflowLegend";
import { Popover } from "../../../components/ui/Popover";
import { Segments } from "../../../components/ui/Segments";
import { button, panel } from "../../../components/ui/styles";
import { useRangeNavigate } from "../../../hooks/useDateRange";
import type { Palette } from "../../../lib/colors";
import type { FilterKey, OverviewFilters } from "../../../lib/filters";
import { dayLabel, int } from "../../../lib/format";
import {
  familyFilter,
  familyLabel,
  filterFamily,
  isAutoReview,
  parseModel,
  type ModelFamily,
} from "../../../lib/models";
import {
  dailyTrend,
  errorsKey,
  peakDay,
  trendSum,
  type TrendGroup,
  type TrendRow,
  type TrendSeries,
  type TrendSource,
} from "../daily-trend";
import { formatMetric, metricOptions, type Metric } from "../metrics";
import { DayStack, SUM_KEY, withSums } from "./DayStack";

const tick = { fill: "var(--color-ink-3)", fontSize: 10.5 };
const margin = { top: 14, right: 44, left: 0, bottom: 0 };
const cursor = { fill: "var(--color-sunken)" };
const avgLabel = { value: "Prom.", fill: "var(--color-ink-3)", fontSize: 10, position: "right" } as const;
const axisLine = { stroke: "var(--color-line-strong)" };
const filterOf: Partial<Record<TrendGroup, FilterKey>> = {
  provider: "provider",
  model: "model",
  project: "project",
};

/**
 * The model legend with one entry per family of several versions (`familia:opus`, "Opus
 * (todas)") placed before the first of its versions.
 */
export function withFamilies(
  entries: LegendEntry[],
  series: TrendSeries[],
  colors: Palette,
  selected: string | null,
): LegendEntry[] {
  const familyOf = (s: TrendSeries) =>
    s.rest || !s.value || isAutoReview(s.value) ? null : parseModel(s.value).family;
  const seen = new Set<ModelFamily>(),
    out: LegendEntry[] = [];
  for (const entry of entries) {
    const f = familyOf(series.find((s) => s.key === entry.key)!);
    const versions = f ? colors.models.filter((m) => parseModel(m).family === f) : [];
    if (f && !seen.has(f) && versions.length > 1) {
      seen.add(f);
      out.push({
        key: familyFilter(f),
        label: `${familyLabel(f)} (todas)`,
        title: `Filtrar por toda la familia ${familyLabel(f)}`,
        color: colors.modelColor(versions[0]),
        pressed: selected === familyFilter(f),
      });
    }
    out.push(entry);
  }
  return out;
}

type Hover = { key: string; index: number } | null;
/**
 * The hovered segment lives outside React state: hovering never re-renders the chart, only
 * the two small subscribers below (a `<style>` rule and the tooltip's highlight).
 */
function hoverStore() {
  let value: Hover = null;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next: Hover) {
      if (next?.key === value?.key && next?.index === value?.index) return;
      value = next;
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}
type HoverStore = ReturnType<typeof hoverStore>;
const useHover = (store: HoverStore) => useSyncExternalStore(store.subscribe, store.get);

/**
 * Lights the hovered segment and dims the rest, or with a day filter dims the other days,
 * through one CSS rule: each cell carries its series (`k-…`) and day (`d-…`) classes.
 */
function SegmentStyle({ store, scope, day }: { store: HoverStore; scope: string; day: number }) {
  const hover = useHover(store),
    root = `[data-trend="${scope}"]`;
  const lit = hover ? `.k-${hover.key}.d-${hover.index}` : day >= 0 ? `.d-${day}` : null;
  return lit ? (
    <style>{`${root} .seg{opacity:.32}${root} .seg${lit}{opacity:1}`}</style>
  ) : null;
}

const PLOT_HEIGHT = 218;

/**
 * The element's width, measured before the first paint (a layout effect re-renders before
 * the browser paints) and kept up to date. `ResponsiveContainer` only learns its size from
 * a ResizeObserver a frame later, which delayed the first bars behind the rest of the page.
 */
function useWidth() {
  const [node, ref] = useState<HTMLDivElement | null>(null),
    [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!node) return;
    setWidth(node.clientWidth);
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [ref, width] as const;
}

/**
 * The chart tooltip, leading with the hovered segment. The chart has one bar per day (its
 * total), so the rows come from the day's row and the series, bottom → top; under Herramientas
 * by group each row also gives that series' errors.
 */
function TrendTooltip({
  store,
  series,
  payload,
  ...props
}: Parameters<typeof ChartTooltip>[0] & { store: HoverStore; series: TrendSeries[] }) {
  const hover = useHover(store),
    row = (payload?.[0] as { payload?: TrendRow } | undefined)?.payload;
  const rows = useMemo(
    () =>
      row &&
      series.map((s) => {
        const errors = Number(row[errorsKey(s.key)] || 0);
        return {
          name: s.label,
          dataKey: s.key,
          value: Number(row[s.key] || 0),
          fill: s.color,
          // Herramientas by group: that series' calls with error that day (contract v2.6).
          ...(errors ? { note: `⊗ ${int(errors)}` } : {}),
        };
      }),
    [row, series],
  );
  return <ChartTooltip {...props} payload={rows} highlight={hover?.key} />;
}

/**
 * Stacked daily bars for the selected metric, read from the precomputed per-day series
 * (`source`, range-wide). The box keeps its size across metrics and groupings: fixed chart
 * height, a legend of at most two lines and the day list in a popover. Each segment is
 * hoverable on its own (it stays lit, the rest dims, the tooltip leads with it). With
 * `onFilter` (Resumen) a click on a segment or legend entry filters the whole page by what it
 * represents: provider, model, project, token kind, or else the day. Without it (a project
 * dashboard) a click opens that day's sessions. Por proyecto draws every project (no "Resto");
 * only its legend is limited to two lines, largest first, with "+N más" for the rest.
 *
 * Performance: Recharts lays out one bar per day (the stacked total) and `DayStack` draws the
 * segments as plain SVG, so the cost barely grows with the number of series (every project in
 * Por proyecto). Metric and grouping switches render deferred (the buttons answer at once, the
 * chart follows); the Recharts tree is memoized per computed trend, so other renders skip it;
 * hover touches no React state of the chart. Not lazy-loaded: the Recharts chunk already
 * loads with the entry, and a lazy boundary only delayed the chart behind the KPIs.
 */
export const DailyTrendChart = memo(function DailyTrendChart({
  source,
  range,
  colors,
  metric,
  onMetric,
  projectKey,
  filters,
  onFilter,
}: {
  source: TrendSource;
  range: DateRange;
  colors: Palette;
  metric: Metric;
  onMetric: (m: Metric) => void;
  projectKey?: string;
  filters?: OverviewFilters;
  onFilter?: (key: FilterKey, value: string | null) => void;
}) {
  const multi = (source.seriesByProvider?.length ?? 0) > 1;
  const [picked, setGroup] = useState<TrendGroup>(multi ? "provider" : "total");
  // A provider filter leaves one provider: "Por proveedor" falls back to Total until it returns.
  const group = picked === "provider" && !multi ? "total" : picked;
  const shownMetric = useDeferredValue(metric),
    shownGroup = useDeferredValue(group),
    pending = shownMetric !== metric || shownGroup !== group;
  const [store] = useState(hoverStore),
    scope = useId(),
    [plotRef, width] = useWidth();
  const navigate = useRangeNavigate();
  const tokenKind = filters?.tokenKind ?? null,
    day = filters?.day ?? null;
  const trend = useMemo(
    () => dailyTrend(source, range, shownGroup, shownMetric, colors, { tokenKind }),
    [source, range, shownGroup, shownMetric, colors, tokenKind],
  );
  const stats = useMemo(() => {
    const sum = trendSum(trend.data, trend.series);
    return { sum, avg: sum / (trend.data.length || 1), peak: peakDay(trend.data, trend.series) };
  }, [trend]);
  const dayIndex = day ? trend.data.findIndex((d) => d.date === day) : -1;

  /** What a segment or legend entry of `s` filters by; null when it cannot (the "Resto"). */
  const target = (s: TrendSeries): [FilterKey, string] | null =>
    s.rest || !s.value
      ? null
      : shownGroup === "total"
        ? ["tokenKind", s.value]
        : filterOf[shownGroup]
          ? [filterOf[shownGroup]!, s.value]
          : null;
  const pickDay = (d: string) =>
    onFilter
      ? onFilter("day", d)
      : navigate(
          "/sesiones?" +
            new URLSearchParams({ from: d, to: d, ...(projectKey ? { proyecto: projectKey } : {}) }),
        );
  // The memoized bars call the latest handler through a ref.
  const select = useRef<(s: TrendSeries, date: string) => void>(null);
  useLayoutEffect(() => {
    select.current = (s, date) => {
      const t = onFilter && target(s);
      if (t) onFilter!(...t);
      else if (!s.rest) pickDay(date);
    };
  });
  const interactive = !!onFilter;
  const data = useMemo(() => withSums(trend.data, trend.series), [trend]);
  // One bar per day (its total); its shape draws the day's whole stack (see DayStack).
  const bars = useMemo(
    () => (
      <Bar
        isAnimationActive={false}
        dataKey={SUM_KEY}
        name="Total"
        fill="transparent"
        shape={(props: BarShapeProps) => (
          <DayStack
            props={props}
            series={trend.series}
            onEnter={(key, index) => store.set({ key, index })}
            onSelect={(s, index) => select.current?.(s, String(trend.data[index].date))}
            clickable={(s) => !(s.rest && interactive)}
          />
        )}
      />
    ),
    [trend, interactive, store],
  );
  const format = useCallback((n: number) => formatMetric(n, shownMetric), [shownMetric]);
  const hint = onFilter
    ? "Click en un segmento: filtra el resumen por lo que representa."
    : "Hacé click para ver las sesiones de ese día.";
  const tooltip = useMemo(
    () => (
      <TrendTooltip
        store={store}
        series={trend.series}
        format={format}
        countForLabel={(label) => Number(trend.data.find((d) => d.date === label)?.count || 0)}
        labelFormat={(label) => dayLabel(String(label))}
        footer={hint}
      />
    ),
    [store, format, trend, hint],
  );
  const legend = useMemo(() => {
    if (trend.series.length <= 1 && !onFilter) return [];
    // Por proyecto stacks every project; its legend lists the largest first, so the two
    // visible lines hold the biggest ones and "+N más" the rest.
    const entries: LegendEntry[] = (
      shownGroup === "project"
        ? [...trend.series].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
        : trend.series
    ).map((s) => {
      const t = target(s);
      return {
        key: s.key,
        label: s.label,
        title: s.rest ? "Agrupa las series más chicas" : s.value,
        color: s.color,
        pressed: !!t && filters?.[t[0]] === t[1],
        inert: !!s.rest,
      };
    });
    // Por modelo on Resumen: a family with several versions also gets an entry before its
    // first version, which filters by the whole family (contract v2.5 `models`).
    return onFilter && shownGroup === "model"
      ? withFamilies(entries, trend.series, colors, filters?.model ?? null)
      : entries;
  }, [trend, filters, onFilter, shownGroup, colors]);
  // The whole Recharts tree as one element, rebuilt only with the trend it draws: the urgent
  // render of a metric or grouping switch (and any parent re-render) then skips it entirely.
  const plot = useMemo(
    () => (
      width > 0 && (
        <BarChart width={width} height={PLOT_HEIGHT} data={data} accessibilityLayer margin={margin}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={dayLabel}
            tick={tick}
            axisLine={axisLine}
            tickLine={false}
            minTickGap={22}
          />
          <YAxis width={80} tickFormatter={format} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip content={tooltip} cursor={cursor} isAnimationActive={false} />
          <ReferenceLine y={stats.avg} stroke="var(--color-ink-3)" label={avgLabel} />
          {bars}
        </BarChart>
      )
    ),
    [width, data, format, tooltip, stats.avg, bars],
  );
  return (
    <section className={panel}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3">
        <h2 className="text-size-sm font-semibold">Por día</h2>
        <Segments label="Métrica" value={metric} options={metricOptions} onChange={onMetric} />
        <span className="flex-1" />
        <Segments
          label="Agrupar por"
          value={group}
          options={[
            ["total", "Total"],
            ...(multi ? [["provider", "Por proveedor"] as const] : []),
            ["model", "Por modelo"],
            // A project's dashboard groups by its branches instead of by project.
            projectKey ? (["branch", "Por rama"] as const) : (["project", "Por proyecto"] as const),
          ]}
          onChange={(g) => {
            setGroup(g);
            store.set(null);
          }}
        />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1 px-4 pt-2.5 text-size-xs text-ink-3 tabular-nums">
        <span>
          <b className="mr-1 text-size-lg font-semibold text-ink">{format(stats.sum)}</b>
          en el rango
        </span>
        <span>{format(stats.avg)} / día</span>
        {stats.peak && <span>Pico: {dayLabel(String(stats.peak.date))}</span>}
      </div>
      <div
        className={
          "px-4 pt-2.5 pb-3 transition-opacity duration-150" + (pending ? " opacity-60" : "")
        }
        aria-busy={pending || undefined}
      >
        <div
          ref={plotRef}
          style={{ height: PLOT_HEIGHT }}
          data-trend={scope}
          onMouseLeave={() => store.set(null)}
        >
          <SegmentStyle store={store} scope={scope} day={dayIndex} />
          {plot}
        </div>
        <div className="mt-2 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <OverflowLegend
              items={legend}
              onItem={
                onFilter
                  ? (key) => {
                      if (filterFamily(key)) return onFilter("model", key);
                      const t = target(trend.series.find((x) => x.key === key)!);
                      if (t) onFilter(...t);
                    }
                  : undefined
              }
            />
          </div>
          <Popover
            label="Días ▾"
            title="Días del rango"
            align="right"
            buttonClassName={button({ size: "sm", ghost: true })}
          >
            {(close) =>
              [...trend.data].reverse().map((d) => (
                <button
                  key={String(d.date)}
                  type="button"
                  className={
                    button({ size: "sm", ghost: true }) +
                    " justify-between gap-4 tabular-nums" +
                    (d.date === day ? " font-semibold text-accent" : "")
                  }
                  aria-pressed={d.date === day}
                  onClick={() => {
                    pickDay(String(d.date));
                    close();
                  }}
                >
                  <span>{dayLabel(String(d.date))}</span>
                  <span className="text-ink-3">{d.count} sesiones</span>
                </button>
              ))
            }
          </Popover>
        </div>
      </div>
    </section>
  );
});
