import { describe, expect, it } from "vitest";
import {
  activeFilters,
  clearFilters,
  readFilters,
  toggleFilter,
  toggleSlot,
  tokensOf,
} from "./filters";

const params = (q: string) => new URLSearchParams(q);

describe("Resumen cross-filters in the URL", () => {
  it("reads every filter and ignores invalid values", () => {
    expect(
      readFilters(
        params(
          "proveedor=codex&proyecto=C%3A%5Capp&modelo=gpt-5.5&dia=2026-10-03&tokens=outputTokens&diasem=6&hora=0&herramienta=shell",
        ),
      ),
    ).toEqual({
      provider: "codex",
      project: "C:\\app",
      model: "gpt-5.5",
      day: "2026-10-03",
      tokenKind: "outputTokens",
      weekday: 6,
      hour: 0,
      tool: "shell",
    });
    expect(
      readFilters(params("proveedor=gemini&dia=ayer&tokens=todo&diasem=7&hora=24")),
    ).toEqual({
      provider: null,
      project: null,
      model: null,
      day: null,
      tokenKind: null,
      weekday: null,
      hour: null,
      tool: null,
    });
    expect(readFilters(params("diasem=-1")).weekday).toBeNull();
    expect(readFilters(params("hora=1.5")).hour).toBeNull();
  });

  it("a heatmap cell sets weekday and hour together; the same cell clears both", () => {
    const set = toggleSlot(params("from=2026-09-01&diasem=2"), 4, 15);
    expect(set.toString()).toBe("from=2026-09-01&diasem=4&hora=15");
    expect(toggleSlot(set, 4, 15).toString()).toBe("from=2026-09-01");
    // Another cell moves the filter; a weekday label alone changes only the weekday.
    expect(toggleSlot(set, 4, 16).get("hora")).toBe("16");
    const day = toggleFilter(set, "weekday", "1");
    expect([day.get("diasem"), day.get("hora")]).toEqual(["1", "15"]);
  });

  it("toggles: a new value sets it, the active value clears it", () => {
    const base = params("from=2026-09-01&proyecto=a");
    const set = toggleFilter(base, "model", "opus");
    expect(set.get("modelo")).toBe("opus");
    expect(set.get("from")).toBe("2026-09-01");
    expect(toggleFilter(set, "model", "opus").has("modelo")).toBe(false);
    expect(toggleFilter(base, "project", "b").get("proyecto")).toBe("b");
    expect(toggleFilter(base, "project", null).has("proyecto")).toBe(false);
    // The input is never mutated.
    expect(base.toString()).toBe("from=2026-09-01&proyecto=a");
  });

  it("clears every cross-filter but the provider and the range", () => {
    const cleared = clearFilters(
      params("from=2026-09-01&proveedor=claude&proyecto=a&modelo=m&dia=2026-09-02&tokens=inputTokens&diasem=1&hora=2&herramienta=x"),
    );
    expect(cleared.toString()).toBe("from=2026-09-01&proveedor=claude");
  });

  it("lists active filters in chip order", () => {
    expect(activeFilters(readFilters(params("dia=2026-09-02&proveedor=claude")))).toEqual([
      "provider",
      "day",
    ]);
  });

  it("counts every token kind, or only the filtered one", () => {
    const u = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 30, cacheCreationTokens: 400 };
    expect(tokensOf(u, null)).toBe(433);
    expect(tokensOf(u, "cacheReadTokens")).toBe(30);
  });
});
