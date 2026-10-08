import { describe, expect, it } from "vitest";
import type { SessionDetail } from "../bindings/SessionDetail";
import { session, useTimeZone, ZONES } from "../test/fixtures";
import { hourCells, sessionActivity } from "./activity";

describe.each(ZONES)("hour heatmap in %s", (zone) => {
  useTimeZone(zone);
  // Local wall-clock time on a given October 2026 day, in the zone under test.
  const recorded = (hour: number, day = 5) =>
    new Date(2026, 9, day, hour, 15).toISOString();

  it("does not turn a resumed session's pause into activity", () => {
    const cells = hourCells([
      {
        id: session.id,
        timestamps: [session.startedAt, session.endedAt, "", "invalid"],
      },
    ]);
    if (zone === "Etc/GMT+3") {
      expect(cells[6 * 24 + 23].messages).toBe(1);
      expect(cells[0].messages).toBe(1);
      expect(cells[0].sessions.size).toBe(1);
    }
    expect(cells.reduce((n, c) => n + c.messages, 0)).toBe(2);

    const resumed = hourCells([
      { id: "resumed", timestamps: [recorded(22), recorded(9, 6)] },
      { id: "another", timestamps: [recorded(9, 6)] },
    ]);
    expect(resumed[22].messages).toBe(1);
    expect(resumed[24 + 9].messages).toBe(2);
    expect(resumed[24 + 9].sessions.size).toBe(2);
    for (let day = 0; day < 7; day++)
      for (let hour = 3; hour <= 6; hour++) {
        expect(resumed[day * 24 + hour].messages).toBe(0);
        expect(resumed[day * 24 + hour].sessions.size).toBe(0);
      }
    expect(resumed.reduce((n, c) => n + c.messages, 0)).toBe(3);
    expect(hourCells([]).every((c) => c.messages === 0)).toBe(true);
  });

  it("collects main and subagent timestamps", () => {
    const activity = sessionActivity([
      {
        summary: session,
        messages: [{ timestamp: recorded(22) }],
        subagents: [{ messages: [{ timestamp: recorded(9, 6) }] }],
      } as unknown as SessionDetail,
    ]);
    expect(activity).toEqual([
      { id: session.id, timestamps: [recorded(22), recorded(9, 6)] },
    ]);
  });

  it.runIf(zone === "Asia/Kathmandu")("handles fractional offsets", () => {
    const fractional = hourCells([
      {
        id: session.id,
        timestamps: ["2026-10-05T00:00:00Z", "2026-10-05T01:00:00Z"],
      },
    ]);
    expect(fractional[5].messages).toBe(1);
    expect(fractional[6].messages).toBe(1);
  });

  it.runIf(zone === "America/New_York")("handles repeated DST hours", () => {
    const repeated = hourCells([
      {
        id: session.id,
        timestamps: ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"],
      },
    ]);
    expect(repeated[6 * 24 + 1].messages).toBe(2);
    expect(repeated[6 * 24 + 1].sessions.size).toBe(1);
  });
});
