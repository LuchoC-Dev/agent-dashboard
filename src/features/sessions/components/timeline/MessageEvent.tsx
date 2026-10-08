import type { ReactNode } from "react";
import type { Message } from "../../../../bindings/Message";
import type { ToolCall } from "../../../../bindings/ToolCall";
import { ModelBadge } from "../../../../components/ui/ModelBadge";
import type { Palette } from "../../../../lib/colors";
import { time, tok } from "../../../../lib/format";
import { callsIn } from "../../../../lib/sessions";
import { callTree, groupBlocks } from "../../timeline";
import { flash, ThinkingMarker, ToolCallRow } from "./blocks";

/** Time · rail · body columns; nested (subagent) timelines are narrower. */
export const railRow = (nested: boolean) =>
  "grid pr-4 " +
  (nested
    ? "grid-cols-[54px_18px_minmax(0,1fr)] pl-0"
    : "grid-cols-[62px_18px_minmax(0,1fr)] pl-2");
const rail =
  "relative before:absolute before:inset-y-0 before:left-2 before:content-['']";

/** One message on the rail: author, text/thinking/tool-call blocks and token usage. */
export function MessageEvent({
  message: m,
  agent = "Claude",
  colors,
  nested,
  focused,
  focusedCall,
  isExpanded,
  onToggle,
  attachedTo,
  children,
}: {
  message: Message;
  /** Name shown on assistant messages: the session's provider. */
  agent?: string;
  colors: Palette;
  nested: boolean;
  focused: boolean;
  focusedCall?: string;
  isExpanded: (call: ToolCall) => boolean;
  onToggle: (call: ToolCall) => void;
  /** Subagents attached to a tool call of this message. */
  attachedTo: (call: ToolCall) => ReactNode;
  /** Subagents placed after this message by time. */
  children?: ReactNode;
}) {
  const tree = callTree(callsIn([m]));
  const call = (c: ToolCall): ReactNode => (
    <ToolCallRow
      key={c.id}
      call={c}
      expanded={isExpanded(c)}
      focused={focusedCall === c.id}
      onToggle={() => onToggle(c)}
    >
      {tree.childrenOf(c).length > 0 && (
        // Calls run inside this one (Codex `exec`): an indented sub-list.
        <div className="mb-1.5 ml-[38px] overflow-hidden rounded-sm border border-line">
          {tree.childrenOf(c).map(call)}
        </div>
      )}
      {attachedTo(c)}
    </ToolCallRow>
  );
  return (
    <article
      id={"msg-" + m.id}
      className={railRow(nested) + (focused ? " " + flash : "")}
      data-role={m.role}
    >
      <span className="pt-[13px] pr-2 text-right text-size-2xs text-ink-3 tabular-nums">
        {time(m.timestamp)}
      </span>
      <span className={rail + " before:w-px before:bg-line"}>
        <i
          className={
            "absolute top-[15px] left-1 size-[9px] rounded-full border-[1.5px] " +
            // Only the user's own messages get a filled dot.
            (m.role === "user"
              ? "border-ink bg-ink"
              : "border-ink-4 bg-surface")
          }
        />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5 py-[9px] pl-2">
        <div className="flex items-center gap-1.5 text-size-xs text-ink-3">
          <b className="font-semibold text-ink">
            {m.role === "user"
              ? nested
                ? "Prompt del agente"
                : "Vos"
              : m.role === "assistant"
                ? agent
                : "Sistema"}
          </b>
          {m.model && <ModelBadge id={m.model} colors={colors} />}
        </div>
        {groupBlocks(m.blocks).map((b, i) =>
          Array.isArray(b) ? (
            b.every(tree.isNested) ? null : (
              <div
                className="overflow-hidden rounded-md border border-line"
                key={i}
              >
                {b.filter((c) => !tree.isNested(c)).map(call)}
              </div>
            )
          ) : b.type === "thinking" ? (
            <ThinkingMarker key={i} text={b.text} />
          ) : b.type === "text" ? (
            <div
              key={i}
              className={
                "whitespace-pre-wrap wrap-anywhere " +
                (m.role === "user"
                  ? "rounded-md bg-sunken px-3 py-2"
                  : "text-ink")
              }
            >
              {b.text}
            </div>
          ) : null,
        )}
        {m.usage && (
          <div className="flex gap-2.5 text-size-2xs text-ink-3 tabular-nums">
            Salida {tok(m.usage.outputTokens)} · Caché leída{" "}
            {tok(m.usage.cacheReadTokens)} · Caché escrita{" "}
            {tok(m.usage.cacheCreationTokens)} · Entrada{" "}
            {tok(m.usage.inputTokens)}
            {!!m.usage.reasoningTokens &&
              ` · Razonamiento ${tok(m.usage.reasoningTokens)} (incluido en salida)`}
          </div>
        )}
        {children}
      </div>
    </article>
  );
}
