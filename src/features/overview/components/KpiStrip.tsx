import type { GroupBucket } from "../../../bindings/GroupBucket";
import type { Metrics } from "../../../bindings/Metrics";
import type { Provider } from "../../../bindings/Provider";
import type { SessionDetail } from "../../../bindings/SessionDetail";
import type { Usage } from "../../../bindings/Usage";
import { memo } from "react";
import { Legend } from "../../../components/ui/Legend";
import { panel } from "../../../components/ui/styles";
import { TokenBar } from "../../../components/ui/TokenBar";
import { UnpricedMark } from "../../../components/ui/UnpricedMark";
import type { TokenKind } from "../../../lib/filters";
import { int, tok, usd } from "../../../lib/format";
import { providerColor } from "../../../lib/providers";
import { totalTok } from "../../../lib/usage";
import { kpiItems, type Metric } from "../metrics";

/** Resumen's cross-filters reachable from the tiles: provider lines and token kinds. */
export type KpiFilters = {
  provider: Provider | null;
  tokenKind: TokenKind | null;
  onProvider: (p: Provider) => void;
  onTokenKind: (k: TokenKind) => void;
};

/** The per-provider share of a tile, when the tile's metric has one. */
function providerSplit(groups: GroupBucket[], m: Metric, filters?: KpiFilters) {
  const value = (g: GroupBucket) =>
    m === "cost"
      ? usd(g.costUsd)
      : m === "tokens"
        ? tok(totalTok(g.usage))
        : m === "sessions"
          ? int(g.sessions)
          : null;
  if (!value(groups[0])) return null;
  return (
    <Legend
      compact
      onItem={filters && ((key) => filters.onProvider(key as Provider))}
      items={groups.map((g) => ({
        key: g.key,
        color: providerColor(g.key as Provider),
        pressed: filters?.provider === g.key,
        title: filters && `Filtrar el resumen por ${g.label}`,
        label: (
          <>
            {g.label} {value(g)}
            {m === "cost" && <UnpricedMark tokens={g.unpricedTokens} />}
          </>
        ),
      }))}
    />
  );
}

/**
 * One panel of KPI tiles; each tile selects the metric charted below it. With more than one
 * provider (`byProvider`), cost, tokens and sessions add a per-provider line. On Resumen
 * (`filters`) those lines and the token kinds are cross-filters: sibling buttons of the tile's
 * own button, never nested in it.
 */
export const KpiStrip = memo(function KpiStrip({
  totals,
  metric,
  onMetric,
  days = 1,
  detail,
  byProvider,
  tool,
  filters,
  allUsage,
}: {
  totals: Metrics["totals"];
  metric: Metric;
  onMetric: (m: Metric) => void;
  days?: number;
  detail?: SessionDetail;
  byProvider?: GroupBucket[];
  /** Resumen's tool filter: the tool tile is named after it (its totals count only it). */
  tool?: string | null;
  filters?: KpiFilters;
  /** Every kind's tokens under a token-kind filter: the bar keeps them all to switch kinds. */
  allUsage?: Usage;
}) {
  const lines = byProvider && byProvider.length > 1;
  return (
    <section className={panel + " kpis"}>
      {kpiItems(totals, days, detail, filters?.tokenKind, tool, allUsage).map(([m, l, v, f]) => (
        <div key={m} className="kpi">
          <button
            className="kpi-main"
            aria-pressed={metric === m}
            onClick={() => onMetric(m)}
          >
            <span className="flex items-center gap-1.5 text-size-xs text-ink-3">{l}</span>
            <span
              className={
                "font-semibold tracking-[-0.01em] whitespace-nowrap " +
                (m === "cost"
                  ? "text-size-hero leading-(--text-hero--line-height)"
                  : "text-[24px] leading-[30px]")
              }
            >
              {v}
              {m === "cost" && <UnpricedMark tokens={totals.unpricedTokens} />}
            </span>
            <span className="flex flex-wrap items-center gap-1.5 text-size-xs text-ink-3 tabular-nums">
              {f}
            </span>
          </button>
          {m === "tokens" && (
            <TokenBar
              usage={allUsage ?? totals.usage}
              compact
              active={filters?.tokenKind}
              onKind={filters?.onTokenKind}
            />
          )}
          {lines && providerSplit(byProvider, m, filters)}
        </div>
      ))}
    </section>
  );
});
