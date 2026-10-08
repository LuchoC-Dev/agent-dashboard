import type { DateRange } from "../bindings/DateRange";
import type { Provider } from "../bindings/Provider";

/**
 * Drilldowns preserve the current range and provider; returning to Resumen starts without
 * filters except the provider, which scopes every screen.
 */
export function withRange(
  target: string,
  range: DateRange,
  provider: Provider | null = null,
) {
  const [path, search = ""] = target.split("?"),
    params = new URLSearchParams(path === "/resumen" ? "" : search);
  if (path !== "/resumen") {
    if (range.from && !params.has("from")) params.set("from", range.from);
    if (range.to && !params.has("to")) params.set("to", range.to);
  }
  if (provider && !params.has("proveedor")) params.set("proveedor", provider);
  return path + (params.size ? "?" + params.toString() : "");
}
