import { describe, expect, it } from "vitest";
import type { Block } from "../../bindings/Block";
import type { Message } from "../../bindings/Message";
import type { Subagent } from "../../bindings/Subagent";
import { mock } from "../../test/fixtures";
import { filterSessions } from "./filters";
import { conversationPath, focusFrom } from "./focus";
import {
  branchSegments,
  focusIndex,
  groupBlocks,
  placeSubagents,
} from "./timeline";

const call = (id: string): Block =>
  ({ type: "toolCall", id, name: "Read", input: {}, isError: false }) as Block;
const text = (t: string): Block => ({ type: "text", text: t }) as Block;
const message = (id: string, timestamp: string, blocks: Block[] = []) =>
  ({ id, timestamp, role: "assistant", blocks }) as unknown as Message;
const agent = (id: string, startedAt: string, parentToolCallId?: string) =>
  ({ id, startedAt, parentToolCallId, messages: [] }) as unknown as Subagent;

describe("conversation timeline", () => {
  it("groups consecutive tool calls in order", () => {
    const groups = groupBlocks([text("a"), call("1"), call("2"), text("b"), call("3")]);
    expect(groups.map((g) => (Array.isArray(g) ? g.length : g.type))).toEqual([
      "text",
      2,
      "text",
      1,
    ]);
  });

  it("attaches subagents to their parent call, else after the prior message", () => {
    const messages = [
      message("m1", "2026-10-05T10:00:00Z", [call("c1")]),
      message("m2", "2026-10-05T10:05:00Z"),
    ];
    const links = placeSubagents(messages, messages, [
      agent("a1", "2026-10-05T10:01:00Z", "c1"),
      agent("a2", "2026-10-05T10:06:00Z"),
      agent("a3", "2026-10-05T09:00:00Z", "missing"),
    ]);
    expect(links.attached.get("c1")?.map((a) => a.id)).toEqual(["a1"]);
    expect(links.unlinked.get("m2")?.map((a) => a.id)).toEqual(["a2"]);
    expect(links.unlinked.get("before")?.map((a) => a.id)).toEqual(["a3"]);
  });

  it("finds the page of a focused call or subagent", () => {
    const messages = Array.from({ length: 50 }, (_, i) =>
      message("m" + i, `2026-10-05T10:${String(i).padStart(2, "0")}:00Z`, [
        call("c" + i),
      ]),
    );
    const subagents = [agent("a1", "2026-10-05T10:45:30Z", "c45")];
    const { unlinked } = placeSubagents(messages, messages, subagents);
    expect(focusIndex(messages, subagents, unlinked, { call: "c42" })).toBe(42);
    expect(focusIndex(messages, subagents, unlinked, { sub: "a1" })).toBe(45);
    expect(focusIndex(messages, subagents, unlinked, {})).toBe(-1);
  });

  it("round-trips focus targets through the conversation URL", () => {
    const path = conversationPath("a b", { call: "c1" });
    expect(path).toBe("/sesion/a%20b/conversacion?call=c1");
    expect(focusFrom(new URLSearchParams(path.split("?")[1]))).toEqual({
      call: "c1",
      msg: undefined,
      sub: undefined,
    });
  });
});

describe("session filters", () => {
  it("matches text, project and model", () => {
    const [s] = mock.sessions;
    const all = { q: "", project: "", model: "" };
    expect(filterSessions(mock.sessions, all)).toHaveLength(mock.sessions.length);
    expect(
      filterSessions(mock.sessions, { ...all, project: s.projectKey }).every(
        (x) => x.projectKey === s.projectKey,
      ),
    ).toBe(true);
    expect(
      filterSessions(mock.sessions, { ...all, model: s.models[0] }).every((x) =>
        x.models.includes(s.models[0]),
      ),
    ).toBe(true);
    expect(filterSessions(mock.sessions, { ...all, q: "zzz-none" })).toEqual([]);
  });
});

describe("branchSegments", () => {
  it("joins consecutive messages of one branch", () => {
    const m = (id: string, branch?: string) => ({ id, branch }) as Message;
    const segs = branchSegments([m("a"), m("b", "x"), m("c", "x"), m("d"), m("e", "y")], 10);
    expect(segs.map((s) => (s.kind === "branch" ? s.branch + s.messages.length : s.index))).toEqual([10, "x2", 13, "y1"]);
  });
});
