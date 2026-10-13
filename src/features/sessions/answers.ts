import type { Message } from "../../bindings/Message";
import { time } from "../../lib/format";
import { callsIn } from "../../lib/sessions";
import { zeroCost } from "../../lib/usage";

/** One bar of the "Por respuesta" chart: an assistant message's figures. */
export function answerRow(m: Message) {
  const calls = callsIn([m]);
  return {
    id: m.id,
    time: time(m.timestamp),
    ...m.usage,
    // Contract v2.9: the message's cost by token kind, as the session totals count it.
    cost: m.costBreakdown ?? zeroCost(),
    unpriced: m.unpricedTokens ?? 0,
    context: m.usage?.cacheReadTokens || 0,
    output: m.usage?.outputTokens || 0,
    ok: calls.filter((c) => !c.isError).length,
    error: calls.filter((c) => c.isError).length,
  };
}
export type AnswerRow = ReturnType<typeof answerRow>;
