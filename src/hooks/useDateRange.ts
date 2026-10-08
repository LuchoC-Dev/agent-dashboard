import { useMemo } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import type { DateRange } from "../bindings/DateRange";
import { withRange } from "../lib/navigation";
import { useProvider } from "./useProvider";

/** The URL (`from`/`to`) is the only source of truth for the date range. */
export function useDateRange() {
  const [params] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate();
  const from = params.get("from"),
    to = params.get("to");
  const range = useMemo<DateRange>(
    () => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    [from, to],
  );
  const setRange = (r: DateRange) => {
    const p = new URLSearchParams(location.search);
    p.delete("from");
    p.delete("to");
    // A day picked on Resumen belongs to the previous range.
    p.delete("dia");
    if (r.from) p.set("from", r.from);
    if (r.to) p.set("to", r.to);
    // A new history entry: Back restores the previous range.
    navigate({ pathname: location.pathname, search: p.toString() });
  };
  return { range, setRange };
}

/** Navigate to a drilldown, keeping the current range and provider. */
export function useRangeNavigate() {
  const navigate = useNavigate(),
    { range } = useDateRange(),
    { provider } = useProvider();
  return (target: string) => navigate(withRange(target, range, provider));
}
