import { useEffect, useState } from "react";
import type { Subagent } from "../../../../bindings/Subagent";
import { ModelBadge } from "../../../../components/ui/ModelBadge";
import { ToolCount } from "../../../../components/ui/ToolCount";
import { CostWithMark } from "../../../../components/ui/UnpricedMark";
import type { Palette } from "../../../../lib/colors";
import { dur, tok, usd } from "../../../../lib/format";
import { callsIn } from "../../../../lib/sessions";
import { totalTok } from "../../../../lib/usage";
import type { Focus } from "../../focus";
import { containsFocus } from "../../timeline";
import { Chevron, flash } from "./blocks";
import { Timeline } from "./Timeline";

/** A subagent's run, collapsed to one summary row; opens on focus or "Expandir todo". */
export function SubagentBlock({
  agent,
  colors,
  focus,
  expandAll,
  agentName,
}: {
  agent: Subagent;
  colors: Palette;
  focus: Focus;
  expandAll: boolean | null;
  agentName?: string;
}) {
  const focused = focus.sub === agent.id || containsFocus(agent, focus);
  const [open, setOpen] = useState(focused);
  useEffect(() => {
    if (expandAll !== null) setOpen(expandAll);
  }, [expandAll]);
  useEffect(() => {
    if (focused) setOpen(true);
  }, [focus.sub, focus.msg, focus.call, agent, focused]);
  const calls = callsIn(agent.messages),
    model = agent.messages.find((m) => m.model)?.model;
  return (
    <section
      id={"sub-" + agent.id}
      className={
        "my-0.5 ml-0.5 border-l-2 border-line-strong" +
        (focus.sub === agent.id ? " " + flash : "")
      }
    >
      <button
        className="flex w-full cursor-pointer flex-wrap items-center gap-2 border-0 bg-transparent px-2.5 py-1.5 text-left text-size-xs text-ink-2 tabular-nums hover:bg-sunken"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Chevron open={open} />
        <b className="text-size-sm font-semibold text-ink">
          {agent.agentType || "Subagente"}
        </b>
        {model && <ModelBadge id={model} colors={colors} />}
        <span>
          {dur(Date.parse(agent.endedAt) - Date.parse(agent.startedAt))}
        </span>
        <span>{agent.messages.length} mensajes</span>
        <ToolCount
          calls={calls.length}
          errors={calls.filter((c) => c.isError).length}
        />
        <span>
          {tok(totalTok(agent.usage))} tokens ·{" "}
          <CostWithMark
            text={usd(agent.costUsd)}
            tokens={agent.unpricedTokens}
          />
        </span>
      </button>
      {open && (
        <div>
          <Timeline
            messages={agent.messages}
            colors={colors}
            focus={focus}
            nested
            expandAll={expandAll}
            agentName={agentName}
          />
        </div>
      )}
    </section>
  );
}
