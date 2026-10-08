import { useMatch } from "react-router";
import type { SessionSummary } from "../../../../bindings/SessionSummary";
import { RangeLink as Link } from "../../../../components/RangeLink";
import { ModelBadge } from "../../../../components/ui/ModelBadge";
import {
  detailHead,
  detailTitle,
  metaLine,
  mono,
} from "../../../../components/ui/styles";
import { CostWithMark } from "../../../../components/ui/UnpricedMark";
import { sessionModels } from "../../../../lib/models";
import type { Palette } from "../../../../lib/colors";
import { dur, usd, when } from "../../../../lib/format";
import { projectHref } from "../../../../lib/projects";
import { title } from "../../../../lib/sessions";

export function SessionHeader({
  session: s,
  colors,
}: {
  session: SessionSummary;
  colors: Palette;
}) {
  return (
    <header className={detailHead}>
      <h1 className={detailTitle}>{title(s)}</h1>
      {s.firstPrompt && (
        <p className="text-size-sm text-ink-2">“{s.firstPrompt}”</p>
      )}
      <div className={metaLine}>
        <Link
          className="text-inherit"
          to={projectHref(s.projectKey)}
          title={s.projectPath}
        >
          {s.projectName}
        </Link>
        <span className={mono}>{s.gitBranch || "Sin rama"}</span>
        <span>{when(s.startedAt)}</span>
        <span>{dur(s.durationMs)}</span>
        {sessionModels(s).map((m) => (
          <ModelBadge key={m} id={m} colors={colors} />
        ))}
        <span>
          <CostWithMark
            text={usd(s.costUsd)}
            tokens={s.unpricedTokens}
          />
        </span>
      </div>
    </header>
  );
}

const tab =
  "-mb-px border-b-2 border-transparent px-3 py-2 text-size-sm font-medium text-ink-2 hover:text-ink hover:no-underline aria-[current=page]:border-b-accent aria-[current=page]:text-ink";

/** Resumen / Conversación tabs: nested routes of `/sesion/:id`. */
export function SessionTabs({ session: s }: { session: SessionSummary }) {
  const base = "/sesion/" + encodeURIComponent(s.id),
    conversation = !!useMatch("/sesion/:id/conversacion");
  return (
    <nav
      className="-mt-1 flex gap-1 border-b border-line"
      aria-label="Vista de sesión"
    >
      <Link
        className={tab}
        to={base}
        aria-current={!conversation ? "page" : undefined}
      >
        Resumen
      </Link>
      <Link
        className={tab}
        to={base + "/conversacion"}
        aria-current={conversation ? "page" : undefined}
      >
        Conversación{" "}
        <span className="ml-1 text-size-xs text-ink-3">{s.messageCount}</span>
      </Link>
    </nav>
  );
}
