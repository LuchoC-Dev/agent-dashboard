/// <reference types="node" />
import { afterAll, beforeAll } from "vitest";
import mockData from "../mocks/mock-data.json";
import type { Metrics } from "../bindings/Metrics";
import type { SessionDetail } from "../bindings/SessionDetail";
import type { SessionSummary } from "../bindings/SessionSummary";

export const mock = mockData as unknown as {
  sessions: SessionSummary[];
  details: Record<string, SessionDetail>;
  metrics: Metrics;
};

export const session: SessionSummary = {
  ...mock.sessions[0],
  startedAt: "2026-10-05T02:30:00Z",
  endedAt: "2026-10-05T03:30:00Z",
};
/** 01:30 UTC: October 5 west of UTC−1:30, October 6 elsewhere. */
export const boundary: SessionSummary = {
  ...session,
  startedAt: "2026-10-06T01:30:00Z",
  endedAt: "2026-10-06T02:00:00Z",
};
export const boundaryDay = (zone: string) =>
  zone === "Etc/GMT+3" || zone === "America/New_York"
    ? "2026-10-05"
    : "2026-10-06";

/** Boundary cases never rely on the host zone: each suite runs in all of these. */
export const ZONES = [
  "Etc/GMT+3",
  "UTC",
  "Asia/Kathmandu",
  "America/New_York",
] as const;

/** Node applies `process.env.TZ` changes to Date and Intl immediately. */
export function useTimeZone(zone: string) {
  const previous = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = zone;
  });
  afterAll(() => {
    process.env.TZ = previous;
  });
}
