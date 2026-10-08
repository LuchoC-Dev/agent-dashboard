import type { Block } from "../../bindings/Block";
import type { Message } from "../../bindings/Message";
import type { Subagent } from "../../bindings/Subagent";
import type { ToolCall } from "../../bindings/ToolCall";
import { callsIn } from "../../lib/sessions";
import type { Focus } from "./focus";

type ToolCallBlock = Extract<Block, { type: "toolCall" }>;

/** Keep consecutive tool calls in a list while preserving the recorded block order. */
export function groupBlocks(blocks: Block[]): (Block | ToolCallBlock[])[] {
  const groups: (Block | ToolCallBlock[])[] = [];
  for (const b of blocks) {
    const last = groups[groups.length - 1];
    if (b.type === "toolCall") {
      if (Array.isArray(last)) last.push(b);
      else groups.push([b]);
    } else groups.push(b);
  }
  return groups;
}

/**
 * Subagents attach to their parent tool call when it is in `messages`; otherwise they are
 * placed after the last message recorded before they started ("before" = first).
 */
export function placeSubagents(
  messages: Message[],
  ordered: Message[],
  subagents: Subagent[],
) {
  const callIds = new Set(callsIn(messages).map((c) => c.id)),
    attached = new Map<string, Subagent[]>(),
    unlinked = new Map<string, Subagent[]>();
  for (const a of subagents) {
    if (a.parentToolCallId && callIds.has(a.parentToolCallId)) {
      const list = attached.get(a.parentToolCallId) || [];
      list.push(a);
      attached.set(a.parentToolCallId, list);
    } else {
      let id = "before";
      for (const m of ordered) if (m.timestamp <= a.startedAt) id = m.id;
      const list = unlinked.get(id) || [];
      list.push(a);
      unlinked.set(id, list);
    }
  }
  return { attached, unlinked };
}

/** Whether a subagent contains the focused message or call. */
export const containsFocus = (agent: Subagent, focus: Focus) =>
  agent.messages.some(
    (m) => m.id === focus.msg || callsIn([m]).some((c) => c.id === focus.call),
  );

/** Index in `ordered` of the message that shows the focus target (-1 when absent). */
export function focusIndex(
  ordered: Message[],
  subagents: Subagent[],
  unlinked: Map<string, Subagent[]>,
  focus: Focus,
) {
  const a = subagents.find((s) => s.id === focus.sub || containsFocus(s, focus));
  const i = ordered.findIndex(
    (m) =>
      m.id === focus.msg ||
      callsIn([m]).some((c) => c.id === focus.call) ||
      (a?.parentToolCallId &&
        callsIn([m]).some((c) => c.id === a.parentToolCallId)) ||
      unlinked.get(m.id)?.includes(a!),
  );
  return a && i < 0 ? 0 : i;
}

export type Segment =
  | { kind: "message"; message: Message; index: number }
  | { kind: "branch"; branch: string; messages: { message: Message; index: number }[] };

/** Consecutive messages of one discarded branch (`Message.branch`) form one segment. */
export function branchSegments(messages: Message[], offset = 0): Segment[] {
  const segments: Segment[] = [];
  messages.forEach((message, i) => {
    const last = segments[segments.length - 1],
      item = { message, index: offset + i };
    if (!message.branch) segments.push({ kind: "message", ...item });
    else if (last?.kind === "branch" && last.branch === message.branch)
      last.messages.push(item);
    else segments.push({ kind: "branch", branch: message.branch, messages: [item] });
  });
  return segments;
}

/** Calls of a message as a tree: calls run by another call of the message nest under it. */
export function callTree(calls: ToolCall[]) {
  const ids = new Set(calls.map((c) => c.id)),
    children = new Map<string, ToolCall[]>();
  for (const c of calls)
    if (c.parentCallId && ids.has(c.parentCallId))
      children.set(c.parentCallId, [...(children.get(c.parentCallId) ?? []), c]);
  return {
    isNested: (c: ToolCall) => !!c.parentCallId && ids.has(c.parentCallId),
    childrenOf: (c: ToolCall) => children.get(c.id) ?? [],
  };
}

export const isGuardian = (a: Subagent) => a.agentType === "guardian";
