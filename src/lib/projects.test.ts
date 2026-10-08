import { describe, expect, it } from "vitest";
import type { SessionSummary } from "../bindings/SessionSummary";
import { mock } from "../test/fixtures";
import { folderId, keyOfPath, nameFromKey, workingCopies } from "./projects";
import { displayDir } from "./scan";

const raw = String.raw;
const at = (projectPath: string, endedAt: string, i: number): SessionSummary => ({
  ...mock.sessions[0],
  id: "s" + i,
  projectPath,
  endedAt,
});

describe("project helpers (contract v2.5)", () => {
  it("one Windows folder spelled with other casing is one working copy", () => {
    expect(folderId(raw`C:\Users\Me\Desktop\App\ `.trim())).toBe(folderId("c:/users/me/desktop/app"));
    expect(folderId("/home/me/App")).not.toBe(folderId("/home/me/app"));
    const app = raw`C:\Users\me\Desktop\App`,
      worktree = raw`C:\Users\me\orca\workspaces\app\feature`;
    const copies = workingCopies([
      at(app, "2026-10-01T10:00:00Z", 1),
      at(raw`C:\Users\me\desktop\app`, "2026-10-03T10:00:00Z", 2),
      at(app, "2026-10-02T10:00:00Z", 3),
      at(worktree, "2026-09-01T10:00:00Z", 4),
    ]);
    expect(copies).toEqual([
      { path: app, sessions: 3, last: "2026-10-03T10:00:00Z" },
      { path: worktree, sessions: 1, last: "2026-09-01T10:00:00Z" },
    ]);
  });

  it("names keys and maps old paths to keys", () => {
    expect(nameFromKey("git:github.com/example/booking-app")).toBe("booking-app");
    expect(nameFromKey(raw`path:c:\users\me\portafolio`)).toBe("portafolio");
    const s = mock.sessions[0];
    expect(keyOfPath(s.projectPath.toUpperCase(), mock.sessions)).toBe(s.projectKey);
    expect(keyOfPath(s.projectKey, [])).toBe(s.projectKey);
    expect(keyOfPath(raw`C:\nowhere`, mock.sessions)).toBeNull();
  });

  it("shows directories without the extended-length prefix", () => {
    expect(displayDir(raw`\\?\C:\Users\me\.codex`)).toBe(raw`C:\Users\me\.codex`);
    expect(displayDir(raw`\\?\UNC\server\share`)).toBe(raw`\\server\share`);
    expect(displayDir(raw`C:\Users\me\.claude\projects`)).toBe(raw`C:\Users\me\.claude\projects`);
  });
});
