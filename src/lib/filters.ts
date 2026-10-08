import type { Provider } from "../bindings/Provider";
import type { TokenKind as KindArg } from "../bindings/TokenKind";
import type { Usage } from "../bindings/Usage";
import { filterFamily, matchesModel } from "./models";
import { isProvider } from "./providers";
import { tokenKinds } from "./usage";

/** A token kind of the token bars (`cacheReadTokens`, `outputTokens`…). */
export type TokenKind = (typeof tokenKinds)[number][0];

/**
 * Resumen's cross-filters. Every one lives in the URL: clicking a chart segment, a row or a
 * KPI line sets it, the chip bar removes it, and clicking an active one again clears it.
 */
export type OverviewFilters = {
  provider: Provider | null;
  /** A `projectKey` (contract v2.5): every working copy of the repository. */
  project: string | null;
  /** A model id, or a whole family (`familia:opus`, see `familyFilter`). */
  model: string | null;
  /** One local day (`YYYY-MM-DD`), within the date range. */
  day: string | null;
  /** Count only this token kind wherever tokens are shown. */
  tokenKind: TokenKind | null;
  /** Local weekday, 0 = Monday … 6 = Sunday (contract v2.3): selects messages. */
  weekday: number | null;
  /** Local hour, 0–23 (contract v2.3): selects messages. */
  hour: number | null;
  /**
   * One tool (contract v2.6): only the sessions that called it, and the tool figures count only
   * its calls and errors.
   */
  tool: string | null;
};
export type FilterKey = keyof OverviewFilters;

/** The cross-filters the metric commands apply themselves (contracts v2.2–v2.6). */
export type MetricFilter = {
  projectKey?: string | null;
  model?: string | null;
  /** Every version of a family (contract v2.5); never together with `model`. */
  models?: string[] | null;
  weekday?: number | null;
  hour?: number | null;
  /** Only `get_metrics` takes it; tool stats have no token figures. */
  tokenKind?: TokenKind | null;
  /** A tool name (contract v2.6): the sessions that called it; tool figures count only it. */
  tool?: string | null;
};

/** A token kind as the metric command takes it (contract v2.4): `outputTokens` → `output`. */
export const kindArg = (k: TokenKind): KindArg => tokenKinds.find(([key]) => key === k)![3];

export const FILTER_PARAMS = {
  provider: "proveedor",
  project: "proyecto",
  model: "modelo",
  day: "dia",
  tokenKind: "tokens",
  weekday: "diasem",
  hour: "hora",
  tool: "herramienta",
} as const satisfies Record<FilterKey, string>;

const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
/** An integer in `0..=max`, or null. */
const slot = (v: string | null, max: number) => {
  const n = v && /^\d{1,2}$/.test(v) ? Number(v) : NaN;
  return n >= 0 && n <= max ? n : null;
};
/**
 * The model filters a `modelo` value means for the metric commands: one model id, or every
 * version of the family among `known` (contract v2.5 `models`).
 */
export function modelArgs(value: string | null, known: string[]) {
  const family = value ? filterFamily(value) : null;
  return family
    ? { model: null, models: known.filter((m) => matchesModel(m, value!)) }
    : { model: value, models: null };
}

const isTokenKind = (v: string | null): v is TokenKind =>
  tokenKinds.some(([k]) => k === v);

export function readFilters(params: URLSearchParams): OverviewFilters {
  const get = (k: FilterKey) => params.get(FILTER_PARAMS[k]) || null,
    provider = get("provider"),
    day = get("day"),
    tokenKind = get("tokenKind");
  return {
    provider: isProvider(provider) ? provider : null,
    project: get("project"),
    model: get("model"),
    day: isDay(day) ? day : null,
    tokenKind: isTokenKind(tokenKind) ? tokenKind : null,
    weekday: slot(get("weekday"), 6),
    hour: slot(get("hour"), 23),
    tool: get("tool"),
  };
}

/** Sets a filter, or clears it when `value` is already the active one (or null). */
export function toggleFilter(
  params: URLSearchParams,
  key: FilterKey,
  value: string | null,
): URLSearchParams {
  const next = new URLSearchParams(params),
    name = FILTER_PARAMS[key];
  if (value === null || next.get(name) === value) next.delete(name);
  else next.set(name, value);
  return next;
}

/**
 * A heatmap cell: sets weekday and hour together, or clears both when that cell is already
 * the active one.
 */
export function toggleSlot(params: URLSearchParams, weekday: number, hour: number) {
  const next = new URLSearchParams(params),
    on = readFilters(params);
  if (on.weekday === weekday && on.hour === hour) {
    next.delete(FILTER_PARAMS.weekday);
    next.delete(FILTER_PARAMS.hour);
  } else {
    next.set(FILTER_PARAMS.weekday, String(weekday));
    next.set(FILTER_PARAMS.hour, String(hour));
  }
  return next;
}

/** Removes every cross-filter but the provider, which also scopes the other screens. */
export function clearFilters(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  for (const key of Object.keys(FILTER_PARAMS) as FilterKey[])
    if (key !== "provider") next.delete(FILTER_PARAMS[key]);
  return next;
}

export const activeFilters = (f: OverviewFilters) =>
  (Object.keys(FILTER_PARAMS) as FilterKey[]).filter((k) => f[k] !== null);

/** Total tokens, or only the filtered kind. */
export const tokensOf = (u: Usage, kind: TokenKind | null) =>
  kind
    ? u[kind]
    : u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheCreationTokens;
