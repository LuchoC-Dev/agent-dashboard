import { describe, expect, it } from "vitest";
import { withRange } from "./navigation";

describe("withRange", () => {
  const range = { from: "2026-10-01", to: "2026-10-05" };

  it("carries the range and the provider into drilldowns", () => {
    expect(withRange("/sesiones?modelo=gpt-6-luna", range, "codex")).toBe(
      "/sesiones?modelo=gpt-6-luna&from=2026-10-01&to=2026-10-05&proveedor=codex",
    );
  });

  it("resets Resumen to its defaults but keeps the provider", () => {
    expect(withRange("/resumen", range)).toBe("/resumen");
    expect(withRange("/resumen?from=2026-10-01", range, "claude")).toBe(
      "/resumen?proveedor=claude",
    );
  });

  it("keeps an explicit provider in the target", () => {
    expect(withRange("/sesiones?proveedor=claude", {}, "codex")).toBe(
      "/sesiones?proveedor=claude",
    );
  });
});
