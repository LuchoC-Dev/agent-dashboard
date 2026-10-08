import { describe, expect, it } from "vitest";
import type { ScanReport } from "../bindings/ScanReport";
import { activeProviders } from "./providers";
import { scanSignature, scopeDone, sourceDirs } from "./scan";

const source = (provider: "claude" | "codex", scanning?: boolean, sessions = 3) => ({
  provider,
  sourceDir: "~/" + provider,
  available: true,
  sessions,
  errors: [],
  ...(scanning === undefined ? {} : { scanning }),
});
const report = (sources: ReturnType<typeof source>[], scanning = false): ScanReport => ({
  sourceDir: "~/.claude/projects",
  scannedAt: "2026-10-06T12:00:00Z",
  sessions: 0,
  errors: [],
  scanning,
  sources,
});

describe("per-source scan state (contract v2.2)", () => {
  const claudeFirst = report([source("claude", false), source("codex", true, 0)], true);

  it("a provider's scope is final once its own source finished", () => {
    expect(scopeDone(claudeFirst, "claude")).toBe(true);
    expect(scopeDone(claudeFirst, "codex")).toBe(false);
    expect(scopeDone(claudeFirst, null)).toBe(false);
    expect(scopeDone(report([source("claude", false), source("codex", false)]), null)).toBe(true);
    expect(scopeDone(undefined, null)).toBe(false);
  });

  it("falls back to the global flag when sources do not report it", () => {
    const old = report([source("claude"), source("codex")], true);
    expect(scopeDone(old, "claude")).toBe(false);
    expect(scopeDone({ ...old, scanning: false }, null)).toBe(true);
    expect(scanSignature(old)).toBe("");
  });

  it("the signature lists finished providers, so a finished one refetches the list", () => {
    expect(scanSignature(claudeFirst)).toBe("claude");
    expect(scanSignature(report([source("claude", false), source("codex", false)]))).toBe(
      "claude,codex",
    );
    expect(scanSignature(undefined)).toBeNull();
  });

  it("an installed provider still scanning keeps its button from the first screen", () => {
    expect(activeProviders(claudeFirst, [])).toEqual(["claude", "codex"]);
    const finishedEmpty = report([source("claude", false), source("codex", false, 0)]);
    expect(activeProviders(finishedEmpty, [])).toEqual(["claude"]);
  });
});

describe("several homes per provider (contract v2.5)", () => {
  const home = (dir: string, scanning: boolean, available = true) => ({
    ...source("codex", scanning),
    sourceDir: dir,
    available,
  });
  const two = (orcaScanning: boolean) =>
    report([source("claude", false), home("~/.codex", false), home("~/orca/home", orcaScanning)], orcaScanning);

  it("a provider is final only when every one of its homes is", () => {
    expect(scopeDone(two(true), "codex")).toBe(false);
    expect(scanSignature(two(true))).toBe("claude");
    expect(scopeDone(two(false), "codex")).toBe(true);
    expect(scanSignature(two(false))).toBe("claude,codex");
  });

  it("lists every directory read, one per source, by provider", () => {
    const r = report([source("claude", false), home("~/.codex", false), home("~/orca/home", false), home("~/gone", false, false)]);
    expect(sourceDirs(r)).toEqual(["~/claude", "~/.codex", "~/orca/home"]);
    expect(sourceDirs(r, "codex")).toEqual(["~/.codex", "~/orca/home"]);
    expect(sourceDirs({ ...r, sources: undefined })).toEqual(["~/.claude/projects"]);
    expect(sourceDirs(undefined)).toBeUndefined();
  });
});
