import { memo } from "react";
import type { ToolStat } from "../../../bindings/ToolStat";
import { RangeLink as Link } from "../../../components/RangeLink";
import { DataTable } from "../../../components/ui/DataTable";
import { InlineBar } from "../../../components/ui/InlineBar";
import { Panel } from "../../../components/ui/Panel";
import {
  errorText,
  mono,
  optionalColumn,
  secondaryColumn,
} from "../../../components/ui/styles";
import { dur, int, pct } from "../../../lib/format";

/**
 * The most used tools. On Resumen (`onSelect`) a row filters the whole page by its tool
 * (contract v2.6; again to clear it): the table then holds only that tool's row, marked. The
 * name opens the tool in Herramientas.
 */
export const TopToolsTable = memo(function TopToolsTable({
  tools,
  selected = null,
  onSelect,
}: {
  tools: ToolStat[];
  selected?: string | null;
  onSelect?: (name: string) => void;
}) {
  const max = Math.max(...tools.map((t) => t.calls), 1);
  const rows = tools.slice(0, 7);
  return (
    <Panel
      title="Herramientas más usadas"
      sub="incluye subagentes"
      action={<Link to="/herramientas">Ver todas →</Link>}
      flush
    >
      <DataTable
        rows={rows}
        rowKey={(t) => t.name}
        defaultSort="calls"
        selected={(t) => t.name === selected}
        onRow={onSelect && ((t) => onSelect(t.name))}
        rowTitle={(t) =>
          t.name === selected ? "Quitar el filtro de herramienta" : `Filtrar el resumen por ${t.name}`
        }
        columns={[
          {
            key: "name",
            label: "Herramienta",
            value: (t) => t.name,
            className: mono + " name-cell",
            render: (t) => (
              <Link
                className="relative z-[1] block truncate"
                title={`${t.name} · ver en Herramientas`}
                onClick={(e) => e.stopPropagation()}
                to={"/herramientas?tool=" + encodeURIComponent(t.name)}
              >
                {t.name}
              </Link>
            ),
          },
          {
            key: "calls",
            label: "Llamadas",
            numeric: true,
            value: (t) => t.calls,
            render: (t) => (
              <InlineBar
                percent={(100 * t.calls) / max}
                color="var(--color-primary)"
              >
                {int(t.calls)}
              </InlineBar>
            ),
          },
          {
            key: "errors",
            className: secondaryColumn,
            label: "Errores",
            numeric: true,
            value: (t) => t.errors,
            render: (t) => (
              <span className={t.errors ? errorText : "text-ink-3"}>
                ⊗ {t.errors} · {pct(t.errorRate)}
              </span>
            ),
          },
          {
            key: "duration",
            className: optionalColumn,
            label: "Prom.",
            numeric: true,
            value: (t) => t.avgDurationMs || 0,
            render: (t) => dur(t.avgDurationMs),
          },
        ]}
      />
    </Panel>
  );
});
