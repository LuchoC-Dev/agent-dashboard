import type { SessionSummary } from "../../../bindings/SessionSummary";
import { RangeLink as Link } from "../../../components/RangeLink";
import { DataTable, type Column } from "../../../components/ui/DataTable";
import { ModelBadge } from "../../../components/ui/ModelBadge";
import {
  mono,
  optionalColumn,
  secondaryColumn,
} from "../../../components/ui/styles";
import { Swatch } from "../../../components/ui/Swatch";
import { ToolCount } from "../../../components/ui/ToolCount";
import { CostWithMark } from "../../../components/ui/UnpricedMark";
import { useRangeNavigate } from "../../../hooks/useDateRange";
import { sessionModels } from "../../../lib/models";
import type { Palette } from "../../../lib/colors";
import { dur, int, tok, usd, when } from "../../../lib/format";
import { providerColor, providerLabel } from "../../../lib/providers";
import { projectHref } from "../../../lib/projects";
import { projectName, title, toolCounts } from "../../../lib/sessions";
import { tokenTitle, totalTok } from "../../../lib/usage";

const sessionPath = (s: SessionSummary) =>
  "/sesion/" + encodeURIComponent(s.id);

export function SessionsTable({
  sessions,
  colors,
  hideProject = false,
  pageSize = 50,
  tool = null,
}: {
  sessions: SessionSummary[];
  colors: Palette;
  hideProject?: boolean;
  pageSize?: number;
  /** A tool filter: the tool column shows, sorts by and is named after that tool's calls. */
  tool?: string | null;
}) {
  const navigate = useRangeNavigate(),
    mixed = new Set(sessions.map((s) => s.provider)).size > 1;
  const columns: Column<SessionSummary>[] = [
    {
      key: "title",
      label: "Sesión",
      value: title,
      // On a phone the table scrolls rather than squeezing the title to nothing.
      className: "w-[34%] max-w-0 phone:min-w-40",
      render: (s) => (
        <div className="flex min-w-0 items-center whitespace-nowrap">
          <Link
            className={
              "block flex-[0_1_auto] truncate" + (!s.title ? " text-ink-2" : "")
            }
            title={title(s)}
            to={sessionPath(s)}
          >
            {title(s)}
          </Link>
          {s.subagentCount > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-[3px] text-size-xs text-ink-3">
              ♧ {s.subagentCount}
            </span>
          )}
        </div>
      ),
    },
    ...(mixed
      ? [
          {
            key: "provider",
            label: "Proveedor",
            value: (s: SessionSummary) => s.provider,
            className: secondaryColumn,
            render: (s: SessionSummary) => (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Swatch color={providerColor(s.provider)} />
                {providerLabel(s.provider)}
              </span>
            ),
          },
        ]
      : []),
    ...(!hideProject
      ? [
          {
            key: "project",
            label: "Proyecto",
            value: (s: SessionSummary) => s.projectName,
            render: (s: SessionSummary) => (
              <Link
                title={s.projectPath}
                onClick={(e) => e.stopPropagation()}
                to={projectHref(s.projectKey)}
              >
                <Swatch color={colors.projectColor(s.projectKey)} />{" "}
                {s.projectName || projectName(s.projectPath)}
              </Link>
            ),
          },
        ]
      : []),
    {
      key: "branch",
      label: "Rama",
      value: (s) => s.gitBranch || "—",
      className: mono + " " + optionalColumn,
    },
    {
      key: "model",
      label: "Modelo",
      value: (s) => sessionModels(s)[0] || "",
      render: (s) => (
        <span title={sessionModels(s).join("\n")}>
          <ModelBadge id={sessionModels(s)[0] || "Desconocido"} colors={colors} />
          {sessionModels(s).slice(1).map((m, i) => (
            <Swatch
              key={m}
              dot
              color={colors.modelColor(m)}
              className={i === 0 ? "ml-1" : ""}
            />
          ))}
        </span>
      ),
    },
    {
      key: "started",
      label: "Inicio",
      value: (s) => s.startedAt,
      render: (s) => when(s.startedAt),
    },
    {
      key: "duration",
      label: "Duración",
      numeric: true,
      value: (s) => s.durationMs,
      render: (s) => dur(s.durationMs),
      className: secondaryColumn,
    },
    {
      key: "messages",
      label: "Msjs.",
      numeric: true,
      value: (s) => s.messageCount,
      render: (s) => int(s.messageCount),
      className: optionalColumn,
    },
    {
      key: "calls",
      label: tool ?? "Herram.",
      numeric: true,
      value: (s) => toolCounts(s, tool).calls,
      render: (s) => <ToolCount {...toolCounts(s, tool)} />,
    },
    {
      key: "tokens",
      label: "Tokens",
      numeric: true,
      value: (s) => totalTok(s.usage),
      render: (s) => (
        <span title={tokenTitle(s.usage)}>{tok(totalTok(s.usage))}</span>
      ),
    },
    {
      key: "cost",
      label: "Costo",
      numeric: true,
      value: (s) => s.costUsd,
      render: (s) => (
        <CostWithMark text={usd(s.costUsd)} tokens={s.unpricedTokens} />
      ),
    },
  ];
  return (
    <DataTable
      rows={sessions}
      columns={columns}
      rowKey={(s) => s.id}
      defaultSort="started"
      onRow={(s) => navigate(sessionPath(s))}
      pageSize={pageSize}
      empty="Ninguna sesión coincide con los filtros."
    />
  );
}
