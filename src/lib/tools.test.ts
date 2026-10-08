import { describe, expect, it } from "vitest";
import type { SessionDetail } from "../bindings/SessionDetail";
import { mock } from "../test/fixtures";
import { filesTouched, toolsFromDetails } from "./tools";

describe("tool statistics", () => {
  const detail = {
    summary: mock.sessions[0],
    subagents: [],
    messages: [
      {
        blocks: [
          {
            type: "toolCall",
            id: "1",
            name: "Read",
            input: { file_path: "src/app.ts" },
            isError: false,
            durationMs: 100,
            result: null,
          },
          {
            type: "toolCall",
            id: "2",
            name: "Read",
            input: { file_path: "src/app.ts" },
            isError: true,
            durationMs: null,
            result: null,
          },
        ],
      },
    ],
  } as unknown as SessionDetail;

  it("does not dilute the mean with missing durations", () => {
    const stat = toolsFromDetails([detail])[0];
    expect(stat.avgDurationMs).toBe(100);
    expect(stat.calls).toBe(2);
    expect(stat.errorRate).toBe(0.5);
  });

  it("counts touched files", () => {
    expect(filesTouched([detail])).toEqual([
      { path: "src/app.ts", reads: 2, edits: 0, writes: 0, total: 2 },
    ]);
  });

  it("counts only the calls of the messages that pass every filter (contract v2.5)", () => {
    const call = (id: string, name: string, file: string) => ({
      type: "toolCall", id, name, input: { file_path: file }, isError: false, durationMs: 1, result: null,
    });
    // Local times, so weekday/hour/day do not depend on the host zone.
    const at = (d: string) => new Date(d).toISOString();
    const message = (model: string, timestamp: string, blocks: unknown[]) => ({ model, timestamp, blocks });
    const d = {
      summary: mock.sessions[0],
      messages: [
        message("claude-opus-5-5", at("2026-10-05T10:00:00"), [call("1", "Read", "a.ts"), call("2", "Edit", "a.ts")]),
        message("claude-opus-5", at("2026-10-06T15:00:00"), [call("3", "Write", "b.ts")]),
      ],
      subagents: [
        { messages: [message("claude-haiku-4-5-20251001", at("2026-10-05T10:30:00"), [call("4", "Read", "c.ts")])] },
      ],
    } as unknown as SessionDetail;
    const paths = (f: Parameters<typeof filesTouched>[1]) => filesTouched([d], f).map((x) => x.path).sort();
    expect(paths({})).toEqual(["a.ts", "b.ts", "c.ts"]);
    expect(paths({ model: "claude-opus-5-5" })).toEqual(["a.ts"]);
    expect(paths({ models: ["claude-opus-5-5", "claude-opus-5"] })).toEqual(["a.ts", "b.ts"]);
    expect(paths({ day: "2026-10-06" })).toEqual(["b.ts"]);
    expect(paths({ hour: 10 })).toEqual(["a.ts", "c.ts"]);
    // 2026-10-05 is a Monday (0).
    expect(paths({ weekday: 0, hour: 10, models: ["claude-haiku-4-5-20251001"] })).toEqual(["c.ts"]);
    expect(paths({ weekday: 1, hour: 10 })).toEqual([]);
    expect(filesTouched([d], { model: "claude-opus-5-5" })[0]).toMatchObject({ reads: 1, edits: 1, total: 2 });
  });
});
