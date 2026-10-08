import { useSearchParams } from "react-router";
import type { DateRange } from "../../../bindings/DateRange";
import type { SessionSummary } from "../../../bindings/SessionSummary";
import { RangeLink as Link } from "../../../components/RangeLink";
import { DataTable } from "../../../components/ui/DataTable";
import { field, filters, panel, summary } from "../../../components/ui/styles";
import { Swatch } from "../../../components/ui/Swatch";
import { ToolCount } from "../../../components/ui/ToolCount";
import { CostWithMark } from "../../../components/ui/UnpricedMark";
import { useRangeNavigate } from "../../../hooks/useDateRange";
import type { Palette } from "../../../lib/colors";
import { dur, tok, usd, when } from "../../../lib/format";
import { projectHref } from "../../../lib/projects";
import { projectRows } from "../project-rows";
import { Sparkline } from "./Sparkline";

/** Proyectos: one row per project in range; the search lives in the URL (`q`). */
export function ProjectsList({
  sessions,
  colors,
  range,
}: {
  sessions: SessionSummary[];
  colors: Palette;
  range: DateRange;
}) {
  const [params, setParams] = useSearchParams(),
    navigate = useRangeNavigate(),
    q = params.get("q") || "";
  const rows = projectRows(colors.projects, sessions, q);
  return (
    <>
      <div className={filters}>
        <input
          className={field}
          aria-label="Buscar proyectos"
          placeholder="Buscar nombre o ruta…"
          value={q}
          onChange={(e) =>
            setParams(e.target.value ? { q: e.target.value } : {}, {
              replace: true,
            })
          }
        />
        <span className="flex-1" />
        <span className={summary}>
          {rows.length} proyectos · {usd(rows.reduce((n, p) => n + p.cost, 0))}
        </span>
      </div>
      <div className={panel}>
        <DataTable
          rows={rows}
          rowKey={(p) => p.key}
          defaultSort="cost"
          onRow={(p) => navigate(projectHref(p.key))}
          columns={[
            {
              key: "name",
              label: "Proyecto",
              value: (p) => p.name,
              render: (p) => (
                <Link title={[p.key, ...p.paths].join("\n")} to={projectHref(p.key)}>
                  <Swatch color={colors.projectColor(p.key)} /> {p.name}
                  {p.paths.length > 1 && (
                    <span className="ml-1.5 text-size-xs text-ink-3">
                      {p.paths.length} copias
                    </span>
                  )}
                </Link>
              ),
            },
            {
              key: "sessions",
              label: "Sesiones",
              numeric: true,
              value: (p) => p.ss.length,
            },
            {
              key: "last",
              label: "Última actividad",
              value: (p) => p.last,
              render: (p) => when(p.last),
            },
            {
              key: "spark",
              label: "Costo por día",
              value: (p) => p.cost,
              render: (p) => <Sparkline sessions={p.ss} range={range} />,
            },
            {
              key: "branches",
              label: "Ramas",
              numeric: true,
              value: (p) => p.branches.length,
              render: (p) => (
                <span title={p.branches.join("\n")}>{p.branches.length}</span>
              ),
            },
            {
              key: "models",
              label: "Modelos",
              value: (p) => p.models.join(),
              render: (p) => (
                <span title={p.models.join("\n")}>
                  {p.models.map((m) => (
                    <Swatch key={m} dot color={colors.modelColor(m)} />
                  ))}
                </span>
              ),
            },
            {
              key: "duration",
              label: "Tiempo activo",
              numeric: true,
              value: (p) => p.duration,
              render: (p) => dur(p.duration),
            },
            {
              key: "tools",
              label: "Herram.",
              numeric: true,
              value: (p) => p.calls,
              render: (p) => <ToolCount calls={p.calls} errors={p.errors} />,
            },
            {
              key: "tokens",
              label: "Tokens",
              numeric: true,
              value: (p) => p.tokens,
              render: (p) => tok(p.tokens),
            },
            {
              key: "cost",
              label: "Costo",
              numeric: true,
              value: (p) => p.cost,
              render: (p) => (
                <CostWithMark text={usd(p.cost)} tokens={p.unpriced} />
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
