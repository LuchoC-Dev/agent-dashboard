import { describe, expect, it } from "vitest";
import { boundary, boundaryDay, useTimeZone, ZONES } from "../test/fixtures";
import { aggregate } from "./aggregate";
import { dayCount, localDay, matchesDays, metricRange } from "./dates";
import { dayLabel, when } from "./format";

describe("dayCount", () => {
  it("counts both ends", () => {
    expect(dayCount({ from: "2026-09-13", to: "2026-09-13" })).toBe(1);
    expect(dayCount({ from: "2026-09-13", to: "2026-10-07" })).toBe(25);
    // Across the DST change (calendar days, not 24 h blocks).
    expect(dayCount({ from: "2026-03-01", to: "2026-03-31" })).toBe(31);
  });
});

describe("metricRange", () => {
  it("defaults to 30 days ending at `to`", () => {
    expect(metricRange({ to: "2026-10-05" })).toEqual({
      from: "2026-09-06",
      to: "2026-10-05",
    });
  });
  it("uses a single day when only `from` is set", () => {
    expect(metricRange({ from: "2026-10-05" })).toEqual({
      from: "2026-10-05",
      to: "2026-10-05",
    });
  });
});

describe.each(ZONES)("local calendar days in %s", (zone) => {
  useTimeZone(zone);
  const expectedDay = boundaryDay(zone);

  it("uses explicit offsets deterministically", () => {
    expect(localDay("2026-10-06T01:30:00Z", -180)).toBe("2026-10-05");
    expect(localDay("2026-10-06T01:30:00Z", 0)).toBe("2026-10-06");
    expect(localDay("")).toBe("");
  });

  it("assigns a midnight-boundary session to the local day", () => {
    expect(localDay(boundary.startedAt)).toBe(expectedDay);
    const range = { from: expectedDay, to: expectedDay };
    expect(matchesDays(boundary.startedAt, range)).toBe(true);
    expect(matchesDays("", range)).toBe(false);
    const daily = aggregate([boundary], range);
    expect(daily.totals.sessions).toBe(1);
    expect(daily.byDay[0].date).toBe(expectedDay);
    expect(daily.byDay[0].sessions).toBe(1);
    expect(
      aggregate([boundary], { from: "2026-10-07", to: "2026-10-07" }).totals
        .sessions,
    ).toBe(0);
    expect(dayLabel(expectedDay)).toBe(
      expectedDay.endsWith("05") ? "5 oct" : "6 oct",
    );
    if (zone === "Etc/GMT+3")
      expect(when(boundary.startedAt).endsWith("22:30")).toBe(true);
  });
});
