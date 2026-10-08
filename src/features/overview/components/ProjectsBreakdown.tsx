import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { GroupBucket } from "../../../bindings/GroupBucket";
import { RangeLink as Link } from "../../../components/RangeLink";
import { DataTable } from "../../../components/ui/DataTable";
import { InlineBar } from "../../../components/ui/InlineBar";
import { Panel } from "../../../components/ui/Panel";
import { optionalColumn, secondaryColumn } from "../../../components/ui/styles";
import { Swatch } from "../../../components/ui/Swatch";
import { CostWithMark } from "../../../components/ui/UnpricedMark";
import { useRangeNavigate } from "../../../hooks/useDateRange";
import type { Palette } from "../../../lib/colors";
import { tokensOf, type TokenKind } from "../../../lib/filters";
import { tok, usd } from "../../../lib/format";
import type { DailySeries } from "../../../bindings/DailySeries";
import { seriesTotal } from "../daily-trend";
import type { Metric } from "../metrics";

/**
 * The projects ranked by the selected metric in the current view, largest first. The value
 * comes from the per-day series (every metric), or the cost buckets without them.
 */
export function rankProjects(groups: GroupBucket[], series: DailySeries[] | undefined, metric: Metric) {
  const totals = new Map(series?.map((s) => [s.key, seriesTotal(s, metric)]));
  const value = (g: GroupBucket) => (series ? totals.get(g.key) ?? 0 : g.costUsd);
  return [...groups].sort((a, b) => value(b) - value(a));
}

/**
 * How many rows of `row` px fit in `height` px once the panel's own `chrome` (header, table
 * head, paddings) is taken: at least one, at most `total`. Unknown sizes (nothing measured
 * yet) show every row.
 */
export function fitRows(height: number, chrome: number, row: number, total: number) {
  if (!(height > 0 && row > 0)) return total;
  return Math.max(1, Math.min(total, Math.floor((height - chrome + 0.5) / row)));
}

/**
 * The number of rows that keep the panel (`panel`) exactly as tall as `match`, the panel
 * beside it, kept up to date when either resizes (a window resize, rows expanded there).
 * The chrome is measured from the table body, so a panel stretched by the grid still counts
 * only its own content.
 */
function useFit(panel: HTMLElement | null, match: HTMLElement | null | undefined, total: number) {
  const [count, setCount] = useState(total);
  const last = useRef(total);
  last.current = total;
  useLayoutEffect(() => {
    if (!panel || !match) return setCount(total);
    const measure = () => {
      const body = panel.querySelector("tbody"),
        content = panel.lastElementChild;
      const shown = body?.querySelectorAll("tr").length ?? 0;
      if (!body || !content || !shown) return;
      const box = panel.getBoundingClientRect(),
        rows = body.getBoundingClientRect();
      const chrome =
        rows.top - box.top + (content.getBoundingClientRect().bottom - rows.bottom) + panel.clientTop;
      setCount(fitRows(match.getBoundingClientRect().height, chrome, rows.height / shown, last.current));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(match);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [panel, match, total]);
  return Math.min(count, total);
}

/**
 * The largest projects of the selected metric, as many as fit in the height of the panel
 * beside it (`match`, "Por modelo"), so both end level; "Ver todos" opens Proyectos. Nothing
 * is folded. The name opens the project's dashboard; the row filters Resumen by the project
 * (`onSelect`, again to clear it) or, without it, opens its sessions.
 */
export const ProjectsBreakdown = memo(function ProjectsBreakdown({
  groups,
  series,
  metric = "cost",
  colors,
  selected = null,
  onSelect,
  tokenKind = null,
  match,
}: {
  groups: GroupBucket[];
  series?: DailySeries[];
  metric?: Metric;
  colors: Palette;
  selected?: string | null;
  onSelect?: (path: string) => void;
  tokenKind?: TokenKind | null;
  /** The neighbouring panel whose height this one matches. */
  match?: HTMLElement | null;
}) {
  const navigate = useRangeNavigate();
  const ranked = useMemo(() => rankProjects(groups, series, metric), [groups, series, metric]);
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const count = useFit(panel, match, ranked.length);
  const shown = useMemo(() => ranked.slice(0, count), [ranked, count]);
  return (
    <Panel
      ref={setPanel}
      title="Por proyecto"
      action={<Link to="/proyectos">Ver todos ({groups.length}) →</Link>}
      flush
    >
      <DataTable
        rows={shown}
        rowKey={(g) => g.key}
        defaultSort="cost"
        selected={(g) => g.key === selected}
        rowTitle={(g) =>
          onSelect
            ? g.key === selected
              ? "Quitar el filtro de proyecto"
              : `Filtrar el resumen por ${g.label}`
            : `Ver las sesiones de ${g.label}`
        }
        onRow={(g) =>
          onSelect
            ? onSelect(g.key)
            : navigate("/sesiones?proyecto=" + encodeURIComponent(g.key))
        }
        columns={[
          {
            key: "name",
            className: "name-cell",
            label: "Proyecto",
            value: (g) => g.label,
            render: (g) => (
              <Link
                className="relative z-[1] inline-block max-w-full truncate align-bottom"
                onClick={(e) => e.stopPropagation()}
                to={"/proyecto/" + encodeURIComponent(g.key)}
                title={`${g.key} · abrir el tablero del proyecto`}
              >
                <Swatch color={colors.projectColor(g.key)} /> {g.label}
              </Link>
            ),
          },
          {
            key: "sessions",
            className: optionalColumn,
            label: "Sesiones",
            numeric: true,
            value: (g) => g.sessions,
          },
          {
            key: "tokens",
            className: secondaryColumn,
            label: "Tokens",
            numeric: true,
            value: (g) => tokensOf(g.usage, tokenKind),
            render: (g) => tok(tokensOf(g.usage, tokenKind)),
          },
          {
            key: "cost",
            label: "Costo",
            numeric: true,
            value: (g) => g.costUsd,
            render: (g) => (
              <InlineBar
                percent={(100 * g.costUsd) / (groups[0]?.costUsd || 1)}
                color={colors.projectColor(g.key)}
              >
                <CostWithMark text={usd(g.costUsd)} tokens={g.unpricedTokens} />
              </InlineBar>
            ),
          },
        ]}
      />
    </Panel>
  );
});
