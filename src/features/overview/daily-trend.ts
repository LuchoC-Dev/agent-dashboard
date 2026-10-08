import type { DateRange } from "../../bindings/DateRange";
import type { Provider } from "../../bindings/Provider";
import { PROJECT_SLOTS, type Palette } from "../../lib/colors";
import { addDays } from "../../lib/dates";
import type { TokenKind } from "../../lib/filters";
import { modelOrder, parseModel } from "../../lib/models";
import { PROVIDERS, providerColor, providerLabel } from "../../lib/providers";
import type { DailySeries } from "../../bindings/DailySeries";
import type { DayPoint } from "../../bindings/DayPoint";
import type { Metrics } from "../../bindings/Metrics";
import { AUTO_REVIEW_KEY } from "../../lib/series";
import { tokenKinds } from "../../lib/usage";
import { metricOptions, type Metric } from "./metrics";

export type TrendGroup = "total" | "provider" | "model" | "project" | "branch";

/** Series drawn before the rest of a grouping is folded into one "Resto" segment. */
export const TREND_TOP = 8;

/** What the chart reads: the backend's per-day series (and, on a project, its branches). */
export type TrendSource = Pick<
  Metrics,
  "byDay" | "seriesByProvider" | "seriesByModel" | "seriesByProject"
> & { seriesByBranch?: DailySeries[] };

const FIELD = {
  cost: "costUsd",
  tokens: "tokens",
  time: "activeMs",
  sessions: "sessions",
  tools: "toolCalls",
  messages: "messages",
} as const satisfies Record<Metric, keyof DayPoint>;

/** A series' total for a metric over its points. */
export const seriesTotal = (s: DailySeries, m: Metric) =>
  s.points.reduce((n, p) => n + p[FIELD[m]], 0);

/** The first and last days with any activity in `source` (the current scope and filters). */
export function dataDays(source: TrendSource): { first?: string; last?: string } {
  const days = [
    ...(source.seriesByProvider ?? []).flatMap((s) =>
      s.points.filter((p) => p.sessions || p.messages || p.tokens || p.costUsd || p.toolCalls),
    ),
    ...source.byDay.filter(
      (d) => d.sessions || d.toolCalls || d.costUsd || Object.values(d.usage).some(Boolean),
    ),
  ].map((d) => d.date);
  return days.length
    ? { first: days.reduce((a, b) => (b < a ? b : a)), last: days.reduce((a, b) => (b > a ? b : a)) }
    : {};
}

/**
 * The days the chart (and the KPI per-day averages) span. An explicit range keeps its full
 * span; an open one ("Todo") runs from the first to the last day with data in `source`
 * instead of the first and last recorded days overall (`resolved`).
 */
export function trendSpan(source: TrendSource | undefined, range: DateRange, resolved: DateRange): DateRange {
  const { first, last } = source ? dataDays(source) : {};
  return { from: range.from || first || resolved.from, to: range.to || last || resolved.to };
}

const restNoun: Record<TrendGroup, string> = {
  total: "",
  provider: "proveedores",
  model: "modelos",
  project: "proyectos",
  branch: "ramas",
};

export type TrendSeries = {
  key: string;
  label: string;
  color: string;
  /** What a click on this series filters by: provider, model id, project path or token kind. */
  value?: string;
  /** The series' total for the metric over the range (grouped series only). */
  total?: number;
  /** The folded tail: how many groups it holds. */
  rest?: number;
};
export type TrendRow = Record<string, string | number>;

/** The row key holding a grouped series' tool errors that day (Herramientas, contract v2.6). */
export const errorsKey = (key: string) => key + ":errors";
export type Trend = {
  data: TrendRow[];
  series: TrendSeries[];
};

/**
 * One row per day of the range (`date`, `count` of sessions, one value per series), read from
 * the precomputed per-day series. Total stacks token kinds (from the per-day buckets) or one
 * total (Herramientas: calls without and with error); the other groupings stack one series per
 * provider, model, project or branch, and under Herramientas each row also holds every series'
 * errors that day (`errorsKey`, for the tooltip). Every
 * project gets its own segment; models and branches past the top `top` fold into one clearly
 * labeled "Resto". Empty segments stay absent (no rectangle drawn).
 */
export function dailyTrend(
  source: TrendSource,
  range: DateRange,
  group: TrendGroup,
  metric: Metric,
  colors: Palette,
  { tokenKind = null, top = TREND_TOP }: { tokenKind?: TokenKind | null; top?: number } = {},
): Trend {
  const field = FIELD[metric],
    providers = source.seriesByProvider;
  const days = [
      ...(providers ?? []).flatMap((s) => s.points.map((p) => p.date)),
      ...source.byDay.map((d) => d.date),
    ].sort(),
    from = range.from || days[0],
    to = range.to || days[days.length - 1];
  if (!from || !to) return { data: [], series: [] };
  const rows = new Map<string, TrendRow>();
  for (let d = from; d <= to; d = addDays(d, 1)) rows.set(d, { date: d, count: 0 });
  const add = (date: string, key: string, n: number) => {
    const row = rows.get(date);
    if (row && n) row[key] = Number(row[key] || 0) + n;
  };
  if (providers)
    for (const s of providers)
      for (const p of s.points) {
        const row = rows.get(p.date);
        if (row) row.count = Number(row.count) + p.sessions;
      }
  else for (const d of source.byDay) if (rows.has(d.date)) rows.get(d.date)!.count = d.sessions;
  const series: TrendSeries[] = [];
  if (group === "total" && metric === "tokens") {
    for (const [key, label, color] of tokenKinds)
      if (!tokenKind || key === tokenKind) series.push({ key, label, color, value: key });
    for (const d of source.byDay) for (const { key } of series) add(d.date, key, d.usage[key as TokenKind]);
  } else if (group === "total" && metric === "tools") {
    series.push(
      { key: "ok", label: "Sin error", color: "var(--color-primary)" },
      { key: "error", label: "Con error", color: "var(--color-error-mark)" },
    );
    const points: { date: string; toolCalls: number; toolErrors?: number }[] = providers
      ? providers.flatMap((s) => s.points)
      : source.byDay;
    for (const p of points) {
      add(p.date, "ok", p.toolCalls - (p.toolErrors ?? 0));
      add(p.date, "error", p.toolErrors ?? 0);
    }
  } else if (group === "total") {
    series.push({
      key: "total",
      label: metricOptions.find(([m]) => m === metric)![1],
      color: "var(--color-primary)",
    });
    if (providers) for (const s of providers) for (const p of s.points) add(p.date, "total", p[field]);
    // Without series (an older backend) Total still has what the per-day buckets hold.
    else
      for (const d of source.byDay)
        add(
          d.date,
          "total",
          metric === "cost" ? d.costUsd : metric === "sessions" ? d.sessions : 0,
        );
  } else {
    const list =
      (group === "provider"
        ? providers
        : group === "model"
          ? source.seriesByModel
          : group === "project"
            ? source.seriesByProject
            : source.seriesByBranch) ?? [];
    const rank = (s: DailySeries) => {
      const at =
        group === "provider"
          ? PROVIDERS.indexOf(s.key as Provider)
          : colors.projectRank.indexOf(s.key);
      return at < 0 ? Infinity : at;
    };
    const ordered = [...list].sort((a, b) =>
      group === "model"
        ? Number(a.key === AUTO_REVIEW_KEY) - Number(b.key === AUTO_REVIEW_KEY) || modelOrder(a.key, b.key)
        : group === "branch"
          ? a.key.localeCompare(b.key)
          : rank(a) - rank(b) || a.key.localeCompare(b.key),
    );
    const value = (s: DailySeries) => seriesTotal(s, metric);
    let kept = ordered,
      folded: DailySeries[] = [];
    // Por proyecto draws every project: only its legend is limited (largest first).
    if (group !== "project" && ordered.length > top + 1) {
      const top_ = new Set([...ordered].sort((a, b) => value(b) - value(a)).slice(0, top));
      kept = ordered.filter((s) => top_.has(s));
      folded = ordered.filter((s) => !top_.has(s));
    }
    kept.forEach((s, i) => {
      const key = "s" + i,
        review = s.key === AUTO_REVIEW_KEY;
      series.push({
        key,
        total: value(s),
        value: review ? "codex-auto-review" : s.key,
        label:
          group === "provider"
            ? providerLabel(s.key as Provider)
            : group === "model" && !review
              ? parseModel(s.key).name
              : s.label,
        color:
          group === "provider"
            ? providerColor(s.key)
            : group === "model"
              ? colors.modelColor(review ? "codex-auto-review" : s.key)
              : group === "project"
                ? colors.projectColor(s.key)
                : `var(--color-series-${(i % PROJECT_SLOTS) + 1})`,
      });
      for (const p of s.points) {
        add(p.date, key, p[field]);
        if (metric === "tools") add(p.date, errorsKey(key), p.toolErrors ?? 0);
      }
    });
    if (folded.length) {
      series.push({
        key: "rest",
        label: `Resto · ${folded.length} ${restNoun[group]}`,
        color: "var(--color-rest)",
        rest: folded.length,
      });
      for (const s of folded)
        for (const p of s.points) {
          add(p.date, "rest", p[field]);
          if (metric === "tools") add(p.date, errorsKey("rest"), p.toolErrors ?? 0);
        }
    }
  }
  return { data: [...rows.values()], series };
}

/** Sum of every series over every row. */
export const trendSum = (data: TrendRow[], series: TrendSeries[]) =>
  data.reduce((n, r) => n + series.reduce((m, s) => m + Number(r[s.key] || 0), 0), 0);

/** The day with the highest stacked total. */
export function peakDay(data: TrendRow[], series: TrendSeries[]) {
  let best: TrendRow | undefined,
    max = -Infinity;
  for (const r of data) {
    const v = series.reduce((n, s) => n + Number(r[s.key] || 0), 0);
    if (v > max) [best, max] = [r, v];
  }
  return best;
}
