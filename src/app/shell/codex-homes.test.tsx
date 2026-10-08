/** @vitest-environment jsdom */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ScanReport } from "../../bindings/ScanReport";
import { mock } from "../../test/fixtures";
import mockData from "../../mocks/mock-data.json";
import { dashboardReady, renderApp } from "../../test/render";
import { Notices, sourceLabel } from "./Notices";

// Contract v2.5: Codex reads every home; each directory is listed on its own line.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

const report = mockData.scanReport as unknown as ScanReport,
  homes = report.sources!.filter((s) => s.provider === "codex");

describe("both Codex homes", { timeout: 30_000 }, () => {
  it("the mock reads two Codex homes", () => {
    expect(homes).toHaveLength(2);
    expect(new Set(mock.sessions.filter((s) => s.provider === "codex").map((s) => s.sourceDir))).toEqual(
      new Set(homes.map((h) => h.sourceDir)),
    );
  });

  it("the sidebar lists every directory read, one line each", async () => {
    renderApp("/resumen");
    await dashboardReady();
    const footer = screen.getByText("Solo lectura").parentElement!;
    for (const src of report.sources!) {
      const line = within(footer).getByTitle(src.sourceDir);
      expect(line.textContent).toBe(src.sourceDir);
      expect(line.className).toContain("truncate");
    }
  });

  it("scan notices name the home when a provider reads several", () => {
    const withErrors: ScanReport = {
      ...report,
      errors: [],
      sources: report.sources!.map((s) => ({
        ...s,
        errors: [{ path: s.sourceDir + "/x.jsonl", message: "bad", provider: s.provider }],
      })),
    };
    render(<Notices all={[]} detail={false} refreshError={null} report={withErrors} reportError={null} />);
    for (const h of homes) expect(screen.getByText(`Codex (${h.sourceDir}):`, { exact: false })).toBeTruthy();
    expect(screen.getByText("Claude:", { exact: false })).toBeTruthy();
    expect(sourceLabel(report.sources!, report.sources![0])).toBe("Claude");
  });

  it("notes how many Codex threads repeated across homes count once", () => {
    render(<Notices all={[]} detail={false} refreshError={null} report={report} reportError={null} />);
    expect(screen.getByText(/Codex: 2 hilos repetidos entre carpetas se cuentan una sola vez/)).toBeTruthy();
  });

  it("the session detail says which home a Codex session came from", async () => {
    const s = mock.sessions.find((x) => x.provider === "codex" && x.sourceDir === homes[1].sourceDir)!;
    renderApp("/sesion/" + s.id);
    const term = await screen.findByText("Leída de", undefined, { timeout: 20_000 });
    expect(term.nextElementSibling!.textContent).toBe(homes[1].sourceDir);
  });
});
