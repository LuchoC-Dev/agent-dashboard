import { useMemo } from "react";
import type { SessionSummary } from "../../../bindings/SessionSummary";
import { RangeLink as Link } from "../../../components/RangeLink";
import { MessageState, StatePath } from "../../../components/ui/states";
import {
  button,
  detailHead,
  detailTitle,
  metaLine,
  mono,
} from "../../../components/ui/styles";
import { Swatch } from "../../../components/ui/Swatch";
import type { Palette } from "../../../lib/colors";
import { int, when } from "../../../lib/format";
import { workingCopies } from "../../../lib/projects";
import { Dashboard } from "../../overview/components/Dashboard";
import { useDashboardData } from "../../overview/useDashboardData";

/**
 * The repository's working copies (main checkout, other clones, worktrees): every distinct
 * `projectPath` of its sessions, with their session count and last activity.
 */
function WorkingCopies({ project }: { project: SessionSummary[] }) {
  const copies = workingCopies(project);
  return (
    <section aria-label="Copias de trabajo" className="flex flex-col gap-0.5 text-size-xs">
      {copies.length > 1 && (
        <span className="text-ink-3">Copias de trabajo · {copies.length}</span>
      )}
      <ul className="flex flex-col gap-0.5">
        {copies.map((c) => (
          <li
            key={c.path}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-4 phone:grid-cols-[minmax(0,1fr)_auto] phone:gap-x-3"
          >
            <span className={mono + " truncate text-ink-2"} title={c.path}>
              {c.path}
            </span>
            <span className="text-ink-3 tabular-nums">
              {int(c.sessions)} {c.sessions === 1 ? "sesión" : "sesiones"}
            </span>
            <span className="text-ink-3 phone:col-span-2">Última actividad {when(c.last)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProjectHeader({
  projectKey,
  project,
  colors,
}: {
  projectKey: string;
  project: SessionSummary[];
  colors: Palette;
}) {
  const first = project.map((s) => s.startedAt).sort()[0],
    last = project
      .map((s) => s.endedAt)
      .sort()
      .reverse()[0];
  return (
    <header className={detailHead}>
      <h1 className={detailTitle} title={projectKey}>
        <Swatch color={colors.projectColor(projectKey)} rounded="rounded-[3px]" />{" "}
        {colors.projectName(projectKey)}
      </h1>
      <WorkingCopies project={project} />
      <div>
        {[...new Set(project.map((s) => s.gitBranch).filter(Boolean))].map(
          (b) => (
            <span
              key={b}
              className="mr-1 inline-block rounded-sm bg-sunken px-1.5 font-mono text-[11px] leading-[18px] text-ink-2"
            >
              {b}
            </span>
          ),
        )}
      </div>
      <div className={metaLine}>
        <span>Primera sesión {when(first)}</span>
        <span>Última actividad {when(last)}</span>
        <span>{project.length} sesiones en total</span>
      </div>
    </header>
  );
}

/**
 * The Resumen dashboard scoped to one project: the same components, queries and cross-filters
 * (`useDashboardData` with a fixed `projectKey`), under the project's header.
 */
export function ProjectDashboard({
  projectKey,
  all,
  colors,
}: {
  projectKey: string;
  /** Every session of the selected provider(s), for the header. */
  all: SessionSummary[];
  colors: Palette;
}) {
  const data = useDashboardData({ projectKey }),
    project = useMemo(() => all.filter((s) => s.projectKey === projectKey), [all, projectKey]);
  if (!project.length)
    return (
      <MessageState title="No encontramos este proyecto">
        <StatePath>{projectKey}</StatePath>
        <Link className={button()} to="/proyectos">
          Volver a proyectos
        </Link>
      </MessageState>
    );
  return (
    <>
      <ProjectHeader projectKey={projectKey} project={project} colors={colors} />
      <Dashboard {...data} />
    </>
  );
}
