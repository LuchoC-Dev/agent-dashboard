import type { SessionDetail } from "../../../../bindings/SessionDetail";
import type { Palette } from "../../../../lib/colors";
import { providerLabel } from "../../../../lib/providers";
import type { Focus } from "../../focus";
import { GuardianToggle, useGuardians } from "../../guardians";
import { Timeline } from "../timeline/Timeline";
import {
  SessionMetaPanel,
  SessionToolsTable,
  TokenBreakdown,
} from "./SessionPanels";

/** Conversación tab: the timeline plus a sticky aside with cost, metadata and tools. */
export function SessionConversation({
  detail,
  colors,
  focus,
  onFocus,
}: {
  detail: SessionDetail;
  colors: Palette;
  focus: Focus;
  onFocus: (f: Focus) => void;
}) {
  const guardians = useGuardians(detail);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] items-start gap-4 narrow:grid-cols-[minmax(0,1fr)_280px] collapsed:grid-cols-1">
      <Timeline
        messages={detail.messages}
        subagents={guardians.subagents}
        colors={colors}
        focus={focus}
        onError={onFocus}
        agentName={providerLabel(detail.summary.provider)}
        actions={<GuardianToggle guardians={guardians} />}
      />
      <aside className="sticky top-0 flex flex-col gap-3 collapsed:static collapsed:grid collapsed:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        <TokenBreakdown detail={detail} />
        <SessionMetaPanel detail={detail} />
        <SessionToolsTable detail={detail} />
      </aside>
    </div>
  );
}
