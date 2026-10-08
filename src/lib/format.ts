import { addDays, hasDate, localDay, today } from "./dates";

// Formatters are built once: constructing an Intl formatter costs far more than formatting,
// and chart axes format hundreds of values per render.
const intFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }),
  usdFormat = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  decFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }),
  timeFormat = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  dayFormat = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" });

export const int = (n: number) => intFormat.format(n);
export const usd = (n: number) =>
  n > 0 && n < 0.005 ? "< US$ 0,01" : "US$ " + usdFormat.format(n);
const dec = (n: number) => decFormat.format(n);
export const tok = (n: number) =>
  n >= 1e9
    ? dec(n / 1e9) + " B"
    : n >= 1e6
      ? dec(n / 1e6) + " M"
      : n >= 1e3
        ? dec(n / 1e3) + " k"
        : int(n);
export const pct = (n: number) => dec(n * 100) + " %";
export function dur(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return int(ms) + " ms";
  if (ms < 60000) return dec(ms / 1000) + " s";
  const m = Math.round(ms / 60000);
  return m < 60
    ? m + " min"
    : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}
export const time = (iso: string) =>
  !hasDate(iso)
    ? "—"
    : timeFormat.format(new Date(iso));
export const dayLabel = (d: string) =>
  !hasDate(d + "T12:00:00")
    ? "Sin fecha"
    : dayFormat.format(new Date(d + "T12:00:00")).replace(/\./g, "");
export const when = (iso: string) => {
  if (!hasDate(iso)) return "Sin fecha";
  const day = localDay(iso),
    now = today();
  return (
    (day === now ? "hoy" : day === addDays(now, -1) ? "ayer" : dayLabel(day)) +
    " " +
    time(iso)
  );
};
