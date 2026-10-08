import type { SessionSummary } from "../../../bindings/SessionSummary";
import type { ToolStat } from "../../../bindings/ToolStat";
import { RangeLink as Link } from "../../../components/RangeLink";
import { DataTable } from "../../../components/ui/DataTable";
import { Panel } from "../../../components/ui/Panel";
import { Legend } from "../../../components/ui/Legend";
import { filters, mono, summary } from "../../../components/ui/styles";
import type { Palette } from "../../../lib/colors";
import { int, pct } from "../../../lib/format";
import { ToolsRanking } from "./ToolsRanking";

const countIn = (t: ToolStat, project: string) =>
  t.byProject.find((g) => g.key === project)?.count || 0;

/** Calls per tool × project, shaded by the column maximum. */
function ToolProjectMatrix({
  tools,
  projects,
  colors,
}: {
  tools: ToolStat[];
  projects: string[];
  colors: Palette;
}) {
  return (
    <Panel title="Herramienta × proyecto" sub="Llamadas · incluye subagentes" flush>
      <DataTable
        rows={tools}
        pageSize={30}
        rowKey={(t) => t.name}
        defaultSort="calls"
        columns={[
          {
            key: "name",
            label: "Herramienta",
            value: (t) => t.name,
            className: mono,
          },
          ...projects.map((p) => ({
            key: p,
            label: colors.projectName(p),
            numeric: true,
            value: (t: ToolStat) => countIn(t, p),
            render: (t: ToolStat) => {
              const count = countIn(t, p),
                max = Math.max(...tools.map((t) => countIn(t, p)), 1);
              return (
                <span
                  className="block rounded-[2px] px-2 py-1"
                  style={{
                    background: `color-mix(in srgb, var(--color-series-1) ${count ? 10 + (55 * count) / max : 0}%, var(--color-surface))`,
                  }}
                >
                  {int(count)}
                </span>
              );
            },
          })),
          {
            key: "calls",
            label: "Total",
            numeric: true,
            value: (t) => t.calls,
          },
        ]}
      />
    </Panel>
  );
}

/** Herramientas: totals, project legend, ranking and the tool × project matrix. */
export function ToolsOverview({
  tools,
  sessions,
  colors,
}: {
  tools: ToolStat[];
  sessions: SessionSummary[];
  colors: Palette;
}) {
  const calls = tools.reduce((n, t) => n + t.calls, 0),
    errors = tools.reduce((n, t) => n + t.errors, 0),
    projects = colors.projectRank.filter((p) =>
      tools.some((t) => t.byProject.some((g) => g.key === p)),
    );
  return (
    <>
      <div className={filters}>
        <span className={summary}>
          {tools.length} herramientas · {int(calls)} llamadas · ⊗ {errors} errores (
          {pct(errors / (calls || 1))}) · incluye subagentes
        </span>
      </div>
      <Legend
        items={projects.map((p) => ({
          key: p,
          color: colors.projectColor(p),
          label: (
            <Link to={"/proyecto/" + encodeURIComponent(p)}>
              {colors.projectName(p)}
            </Link>
          ),
        }))}
      />
      <ToolsRanking
        tools={tools}
        projects={projects}
        sessionCount={sessions.length}
        colors={colors}
      />
      <ToolProjectMatrix tools={tools} projects={projects} colors={colors} />
    </>
  );
}
