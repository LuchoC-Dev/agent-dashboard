import type { Message } from "../bindings/Message";
import type { SessionDetail } from "../bindings/SessionDetail";
import type { SessionSummary } from "../bindings/SessionSummary";
import type { ToolCall } from "../bindings/ToolCall";

export const title = (s: SessionSummary) =>
  s.title || s.firstPrompt || "Sesión sin título";
export const projectName = (p: string) =>
  p.split(/[\\/]/).filter(Boolean).pop() || "Sin proyecto";
export const callsIn = (messages: Message[]): ToolCall[] =>
  messages.flatMap((m) =>
    m.blocks.flatMap((b) => (b.type === "toolCall" ? [b] : [])),
  );
export const allMessages = (d: SessionDetail) => [
  ...d.messages,
  ...d.subagents.flatMap((a) => a.messages),
];
/** The argument that identifies a call at a glance: path, command, pattern or query. */
export const keyArgument = (c: ToolCall) => {
  const v = c.input;
  if (!v || typeof v !== "object" || Array.isArray(v)) return "";
  return String(
    v.file_path ??
      v.command ??
      v.pattern ??
      v.query ??
      [v.subagent_type, v.description].filter(Boolean).join(" · "),
  );
};

/**
 * A session's tool calls and errors as a list shows them: under a tool filter only that tool's
 * (contract v2.6.1 `filteredToolCalls`/`filteredToolErrors`), otherwise every tool's.
 */
export const toolCounts = (s: SessionSummary, tool?: string | null) =>
  tool
    ? { calls: s.filteredToolCalls ?? 0, errors: s.filteredToolErrors ?? 0 }
    : { calls: s.toolCallCount, errors: s.toolErrorCount };

/**
 * `sessions` narrowed to those in `narrowed` (the backend's list under a tool or slot filter),
 * each with the filtered tool counts that list carries.
 */
export function withToolCounts(sessions: SessionSummary[], narrowed: SessionSummary[]) {
  const byId = new Map(narrowed.map((s) => [s.id, s]));
  return sessions.flatMap((s): SessionSummary[] => {
    const n = byId.get(s.id);
    if (!n) return [];
    return n.filteredToolCalls == null
      ? [s]
      : [{ ...s, filteredToolCalls: n.filteredToolCalls, filteredToolErrors: n.filteredToolErrors }];
  });
}
