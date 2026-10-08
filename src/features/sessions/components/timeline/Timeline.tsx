import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Message } from "../../../../bindings/Message";
import type { Subagent } from "../../../../bindings/Subagent";
import { Pagination } from "../../../../components/ui/Pagination";
import { note, panel } from "../../../../components/ui/styles";
import type { Palette } from "../../../../lib/colors";
import { dur } from "../../../../lib/format";
import { callsIn } from "../../../../lib/sessions";
import type { Focus } from "../../focus";
import { branchSegments, focusIndex, placeSubagents } from "../../timeline";
import { BranchGroup } from "./BranchGroup";
import { MessageEvent, railRow } from "./MessageEvent";
import { SubagentBlock } from "./SubagentBlock";
import { TimelineHeader } from "./TimelineHeader";

const PAGE = 40;
/** Pauses longer than this are drawn as a dashed gap. */
const IDLE_MS = 180e3;
/** Stable default: a fresh `[]` per render would re-run the focus effect forever. */
const NO_SUBAGENTS: Subagent[] = [];

/**
 * The conversation rail: messages in recorded order (40 per page), idle gaps, tool calls
 * and subagents. `focus` (from the URL) pages to, expands, highlights and scrolls to a target.
 */
export function Timeline({
  messages,
  subagents = NO_SUBAGENTS,
  colors,
  focus = {},
  nested = false,
  expandAll: externalExpand = null,
  onError,
  agentName = "Claude",
  actions,
}: {
  messages: Message[];
  subagents?: Subagent[];
  colors: Palette;
  focus?: Focus;
  nested?: boolean;
  expandAll?: boolean | null;
  onError?: (f: Focus) => void;
  /** Name on assistant messages: the session's provider. */
  agentName?: string;
  /** Extra header controls (the guardian toggle). */
  actions?: ReactNode;
}) {
  const ordered = useMemo(
    () => [...messages].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [messages],
  );
  const [page, setPage] = useState(0),
    // `all` is the bulk state (expand/collapse all); `opened` holds the exceptions.
    [all, setAll] = useState<boolean | null>(externalExpand),
    [opened, setOpened] = useState<Set<string>>(new Set()),
    [hideBranches, setHideBranches] = useState(false);
  const links = useMemo(
    () => placeSubagents(messages, ordered, subagents),
    [messages, ordered, subagents],
  );
  useEffect(() => {
    if (externalExpand !== null) {
      setAll(externalExpand);
      setOpened(new Set());
    }
  }, [externalExpand]);
  useEffect(() => {
    const i = focusIndex(ordered, subagents, links.unlinked, focus);
    if (i >= 0) setPage(Math.floor(i / PAGE));
    if (focus.call)
      setOpened((prev) => {
        const next = new Set(prev);
        if (all === true) next.delete(focus.call!);
        else next.add(focus.call!);
        return next;
      });
  }, [focus.msg, focus.call, focus.sub, ordered, subagents, links, all]);
  useEffect(() => {
    const id = focus.call
      ? "call-" + focus.call
      : focus.msg
        ? "msg-" + focus.msg
        : focus.sub
          ? "sub-" + focus.sub
          : null;
    if (!id) return;
    const timer = window.setTimeout(
      () =>
        document
          .getElementById(id)
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      100,
    );
    return () => window.clearTimeout(timer);
  }, [focus.msg, focus.call, focus.sub, page]);
  const allCalls = callsIn([
      ...messages,
      ...subagents.flatMap((a) => a.messages),
    ]),
    errors = allCalls.filter((c) => c.isError),
    pages = Math.ceil(ordered.length / PAGE),
    current = Math.min(page, Math.max(0, pages - 1));
  const toggle = (id: string) =>
    setOpened((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const bulk = (expand: boolean) => {
    setAll(expand);
    setOpened(new Set());
  };
  const agent = (a: Subagent) => (
    <SubagentBlock
      key={a.id}
      agent={a}
      colors={colors}
      focus={focus}
      expandAll={all}
      agentName={agentName}
    />
  );
  const message = ({
    message: m,
    index,
  }: {
    message: Message;
    index: number;
  }) => {
    const prior = ordered[index - 1],
      gap = prior ? Date.parse(m.timestamp) - Date.parse(prior.timestamp) : 0;
    return (
      <Fragment key={m.id}>
        {gap > IDLE_MS && (
          <div className={railRow(nested)}>
            <span />
            {/* Inside a message (a subagent's run) the dashes sit on the
                message rail's solid line, as in the approved design. */}
            <span className="relative h-[26px] before:absolute before:inset-y-0 before:left-2 before:content-[''] before:[border-left:1px_dashed_var(--color-line-strong)] in-[article]:before:w-px in-[article]:before:bg-line" />
            <span className="pt-[5px] pl-2 text-size-2xs text-ink-3">
              {dur(gap)} sin actividad
            </span>
          </div>
        )}
        <MessageEvent
          message={m}
          agent={agentName}
          colors={colors}
          nested={nested}
          focused={focus.msg === m.id}
          focusedCall={focus.call}
          isExpanded={(c) =>
            all === true ? !opened.has(c.id) : opened.has(c.id)
          }
          onToggle={(c) => toggle(c.id)}
          attachedTo={(c) => links.attached.get(c.id)?.map(agent)}
        >
          {links.unlinked.get(m.id)?.map(agent)}
        </MessageEvent>
      </Fragment>
    );
  };
  return (
    <div className={nested ? "" : panel}>
      {!nested && (
        <TimelineHeader
          messages={messages.length}
          calls={allCalls.length}
          errors={errors.length}
          subagents={subagents.length}
          branches={new Set(messages.map((m) => m.branch).filter(Boolean)).size}
          hideBranches={hideBranches}
          onHideBranches={setHideBranches}
          onNextError={() => {
            const i = errors.findIndex((c) => c.id === focus.call);
            onError?.({ call: errors[(i + 1) % errors.length].id });
          }}
          onBulk={bulk}
          actions={actions}
        />
      )}
      <div className="pt-1.5 pb-4">
        {current === 0 && links.unlinked.get("before")?.map(agent)}
        {branchSegments(
          ordered.slice(current * PAGE, (current + 1) * PAGE),
          current * PAGE,
        ).map((seg) =>
          seg.kind === "message" ? (
            message(seg)
          ) : hideBranches ? null : (
            <BranchGroup
              key={seg.branch + seg.messages[0].index}
              count={seg.messages.length}
              focused={seg.messages.some(
                ({ message: m }) =>
                  m.id === focus.msg ||
                  callsIn([m]).some((c) => c.id === focus.call),
              )}
              expandAll={all}
            >
              {seg.messages.map(message)}
            </BranchGroup>
          ),
        )}
        {!ordered.length && (
          <p className={note}>No hay mensajes registrados.</p>
        )}
      </div>
      {pages > 1 && (
        <Pagination
          label={
            <>
              Mensajes {current * PAGE + 1}–
              {Math.min((current + 1) * PAGE, ordered.length)} de{" "}
              {ordered.length}
            </>
          }
          hasPrevious={current > 0}
          hasNext={current < pages - 1}
          onPrevious={() => setPage(current - 1)}
          onNext={() => setPage(current + 1)}
        />
      )}
    </div>
  );
}
