import { useState } from "react";
import type { SessionDetail } from "../../../../bindings/SessionDetail";
import { grid2, note } from "../../../../components/ui/styles";
import type { Palette } from "../../../../lib/colors";
import { dur, usd } from "../../../../lib/format";
import { allMessages, callsIn } from "../../../../lib/sessions";
import { FilesTouched } from "../../../overview/components/FilesTouched";
import { filesTouched } from "../../../../lib/tools";
import { KpiStrip } from "../../../overview/components/KpiStrip";
import type { Metric } from "../../../overview/metrics";
import type { Focus } from "../../focus";
import { PerAnswerChart } from "./PerAnswerChart";
import { SessionMetaPanel, SessionToolsTable, TokenBreakdown } from "./SessionPanels";
import { ErrorsTable, SubagentsTable } from "./SubagentsTable";

/** Resumen tab of a session: KPIs, per-answer chart, tools, files, subagents and errors. */
export function SessionOverview({
  detail,
  colors,
  onFocus,
}: {
  detail: SessionDetail;
  colors: Palette;
  onFocus: (f: Focus) => void;
}) {
  const s = detail.summary,
    [metric, setMetric] = useState<Metric>("cost");
  const toolMs = callsIn(allMessages(detail)).reduce(
    (n, c) => n + (c.durationMs || 0),
    0,
  );
  const totals = {
    sessions: 1,
    messages: s.messageCount,
    toolCalls: s.toolCallCount,
    toolErrors: s.toolErrorCount,
    subagents: s.subagentCount,
    usage: s.usage,
    costUsd: s.costUsd,
    costBreakdown: s.costBreakdown,
    activeMs: s.durationMs,
  };
  return (
    <>
      <KpiStrip
        totals={totals}
        metric={metric}
        onMetric={setMetric}
        detail={detail}
      />
      <div className={note}>
        {detail.messages.filter((m) => m.role === "user").length} prompts ·{" "}
        {detail.messages.filter((m) => m.role === "assistant").length} respuestas
        · {dur(toolMs)} en herramientas ·{" "}
        {usd(detail.subagents.reduce((n, a) => n + a.costUsd, 0))} en
        subagentes. Las duraciones de herramientas pueden superponerse.
      </div>
      <PerAnswerChart detail={detail} onFocus={onFocus} />
      <div className={grid2}>
        <SessionToolsTable detail={detail} withTime />
        <FilesTouched files={filesTouched([detail])} />
      </div>
      <SubagentsTable detail={detail} colors={colors} onFocus={onFocus} />
      <ErrorsTable detail={detail} onFocus={onFocus} />
      <div className={grid2}>
        <TokenBreakdown detail={detail} />
        <SessionMetaPanel detail={detail} />
      </div>
    </>
  );
}
