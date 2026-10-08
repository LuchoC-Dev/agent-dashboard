import type { SessionDetail } from "../bindings/SessionDetail";
import { allMessages } from "./sessions";

export type SessionActivity = { id: string; timestamps: string[] };
export function sessionActivity(details: SessionDetail[]): SessionActivity[] {
  return details.map((detail) => ({
    id: detail.summary.id,
    timestamps: allMessages(detail).map((message) => message.timestamp),
  }));
}
/** 7 × 24 local-time cells (Monday first) counting recorded messages and their sessions. */
export function hourCells(sessions: SessionActivity[]) {
  const cells = Array.from({ length: 168 }, () => ({
    messages: 0,
    sessions: new Set<string>(),
  }));
  for (const s of sessions) {
    for (const timestamp of s.timestamps) {
      const local = new Date(timestamp);
      if (!Number.isFinite(local.getTime())) continue;
      const cell = cells[((local.getDay() + 6) % 7) * 24 + local.getHours()];
      cell.messages += 1;
      cell.sessions.add(s.id);
    }
  }
  return cells;
}
