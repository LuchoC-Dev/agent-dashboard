import { useOutletContext } from "react-router";
import type { DateRange } from "../bindings/DateRange";
import type { Provider } from "../bindings/Provider";
import type { ScanReport } from "../bindings/ScanReport";
import type { SessionSummary } from "../bindings/SessionSummary";
import type { ToolStat } from "../bindings/ToolStat";
import type { Palette } from "../lib/colors";

/** What the DataGate layout route hands to the list and dashboard screens. */
export type DashboardContext = {
  /** False while the scope is still scanning (only screens with section skeletons see it). */
  ready: boolean;
  /** Every session of the selected provider(s), including undated ones. */
  all: SessionSummary[];
  /** Sessions in the URL range (all of them when the range is open). */
  sessions: SessionSummary[];
  /** Tool stats of the range and provider (no cross-filters). */
  tools: ToolStat[];
  /** Every session of every provider (prefetching the other provider buttons). */
  everything: SessionSummary[];
  report: ScanReport | undefined;
  /** The URL range, possibly open. */
  range: DateRange;
  /** The URL range closed over the recorded sessions. */
  resolvedRange: DateRange;
  setRange: (r: DateRange) => void;
  /** The URL provider (`?proveedor=`); null = all of them. */
  provider: Provider | null;
  /** Providers with sessions, in display order. */
  providers: Provider[];
  colors: Palette;
};
export const useDashboard = () => useOutletContext<DashboardContext>();
