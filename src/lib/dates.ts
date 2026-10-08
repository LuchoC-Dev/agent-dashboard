import type { DateRange } from "../bindings/DateRange";
import type { SessionSummary } from "../bindings/SessionSummary";

/** The machine time zone, read on each call so it is never stale. */
export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const hasDate = (iso: string) => Number.isFinite(Date.parse(iso));
// Calendar days use the machine timezone. Optional east-of-UTC minutes make boundary tests deterministic.
export function localDay(iso: string, offsetMinutes?: number): string {
  if (!hasDate(iso)) return "";
  const date = new Date(Date.parse(iso) + (offsetMinutes ?? 0) * 60000);
  const [year, month, day] =
    offsetMinutes === undefined
      ? [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      : [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export const today = () => localDay(new Date().toISOString());
// These are calendar-day strings, not timestamps; UTC arithmetic avoids DST-length days.
export const addDays = (d: string, n: number) =>
  new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export function matchesDays(iso: string, range: DateRange): boolean {
  const day = localDay(iso);
  return (
    (!range.from || (!!day && day >= range.from)) &&
    (!range.to || (!!day && day <= range.to))
  );
}
/** Calendar days from `range.from` to `range.to`, both included (at least one). */
export const dayCount = (range: DateRange) =>
  range.from && range.to
    ? Math.max(1, Math.round((Date.parse(range.to) - Date.parse(range.from)) / 864e5) + 1)
    : 1;
/** The metric commands default an empty range to 30 days; the mock API mirrors that. */
export function metricRange(range: DateRange): DateRange {
  return {
    from: range.from || addDays(range.to || today(), -29),
    to: range.to || range.from || today(),
  };
}
/** An open range closed over the recorded sessions (or today when there are none). */
export function resolveRange(
  range: DateRange,
  sessions: SessionSummary[] = [],
): DateRange {
  const days = sessions
    .filter((s) => hasDate(s.startedAt))
    .map((s) => localDay(s.startedAt))
    .sort();
  return {
    from: range.from || days[0] || today(),
    to: range.to || days[days.length - 1] || today(),
  };
}

/** The top bar's range presets: the last N days, or everything (an open range). */
export const RANGE_PRESETS = [
  ["7", "7 días"],
  ["30", "30 días"],
  ["90", "90 días"],
  ["all", "Todo"],
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number][0];
export const presetRange = (preset: RangePreset): DateRange =>
  preset === "all" ? {} : { from: addDays(today(), 1 - Number(preset)), to: today() };
