import { describe, expect, it } from "vitest";
import { familyProvider, isAutoReview, modelOrder, parseModel, sessionModels } from "./models";
import { palette } from "./colors";
import { mock } from "../test/fixtures";

describe("parseModel", () => {
  it.each([
    ["claude-opus-5-5", "opus", "Opus 5.5"],
    ["claude-haiku-4-5-20251001", "haiku", "Haiku 4.5"],
    ["gpt-6.1-sol", "sol", "Sol 6.1"],
    ["gpt-6-luna", "luna", "Luna 6"],
    ["gpt-5.6-terra", "terra", "Terra 5.6"],
    ["gpt-5.4-mini", "mini", "Mini 5.4"],
    ["gpt-5.5", "sol", "GPT-5.5"],
    ["gpt-5.6-sol-2026-09-01", "sol", "Sol 5.6"],
    ["codex-auto-review", "other", "Revisiones automáticas"],
    ["gpt-6-luna-x", "other", "gpt-6-luna-x"],
    ["mystery", "other", "mystery"],
  ])("%s → %s · %s", (id, family, name) => {
    expect(parseModel(id)).toMatchObject({ family, name });
  });

  it("maps families to their provider", () => {
    expect(familyProvider(parseModel("claude-sonnet-4-6").family)).toBe("claude");
    expect(familyProvider(parseModel("gpt-5.5-mini").family)).toBe("codex");
    expect(familyProvider("other")).toBeNull();
  });

  it("orders Claude before Codex, newest version first", () => {
    expect(
      ["gpt-5.6-sol", "gpt-6-luna", "claude-opus-5", "gpt-6.1-sol", "codex-auto-review"].sort(
        modelOrder,
      ),
    ).toEqual(["claude-opus-5", "gpt-6.1-sol", "gpt-5.6-sol", "gpt-6-luna", "codex-auto-review"]);
  });
});

describe("automatic reviews", () => {
  it("are not a model: left out of a session's models", () => {
    expect(isAutoReview("codex-auto-review")).toBe(true);
    expect(isAutoReview("gpt-6.1-sol")).toBe(false);
    expect(sessionModels({ models: ["codex-auto-review", "gpt-5.6-sol", "gpt-5.6-sol"] })).toEqual([
      "gpt-5.6-sol",
    ]);
  });

  it("are left out of the palette's model list but keep their own color", () => {
    const colors = palette(mock.sessions);
    expect(mock.sessions.some((s) => s.models.includes("codex-auto-review"))).toBe(true);
    expect(colors.models).not.toContain("codex-auto-review");
    expect(colors.modelColor("codex-auto-review")).toBe("var(--color-review)");
  });
});

describe("palette", () => {
  it("gives every known model a family color, never the gray fallback", () => {
    const colors = palette(mock.sessions);
    for (const m of colors.models)
      expect(colors.modelColor(m), m).not.toContain("family-other");
    expect(colors.modelColor("gpt-6.1-sol")).toBe("var(--color-sol-1)");
    expect(colors.modelColor("gpt-5.6-sol")).toBe("var(--color-sol-2)");
  });
});
