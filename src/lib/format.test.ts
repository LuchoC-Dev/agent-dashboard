import { describe, expect, it } from "vitest";
import { dur, int, pct, tok, usd } from "./format";
import { familyLabel, modelOrder, parseModel } from "./models";
import { palette } from "./colors";
import { mock } from "../test/fixtures";

describe("number formats (es-AR)", () => {
  it("formats money, keeping tiny amounts visible", () => {
    expect(usd(11.954)).toBe("US$ 11,95");
    expect(usd(0.004)).toBe("< US$ 0,01");
    expect(usd(0)).toBe("US$ 0,00");
  });
  it("abbreviates token counts", () => {
    expect(tok(950)).toBe("950");
    expect(tok(4_100)).toBe("4,1 k");
    expect(tok(19_300_000)).toBe("19,3 M");
    expect(tok(2_000_000_000)).toBe("2 B");
  });
  it("formats integers, percentages and durations", () => {
    expect(int(12345)).toBe("12.345");
    expect(pct(0.908)).toBe("90,8 %");
    expect(dur(null)).toBe("—");
    expect(dur(420)).toBe("420 ms");
    expect(dur(1500)).toBe("1,5 s");
    expect(dur(16 * 60000)).toBe("16 min");
    expect(dur(438 * 60000)).toBe("7 h 18 min");
  });
});

describe("models", () => {
  it("parses family and version", () => {
    expect(parseModel("claude-opus-4-1-20250805")).toMatchObject({
      family: "opus",
      name: "Opus 4.1",
    });
    expect(parseModel("llama-4").family).toBe("other");
    expect(familyLabel("other")).toBe("Otros");
  });
  it("orders by family, then newest version first", () => {
    expect(
      ["claude-haiku-4-5", "claude-opus-4", "claude-opus-4-1", "x"].sort(
        modelOrder,
      ),
    ).toEqual(["claude-opus-4-1", "claude-opus-4", "claude-haiku-4-5", "x"]);
  });
});

describe("palette", () => {
  const colors = palette(mock.sessions);
  it("assigns model colors from the whole dataset", () => {
    expect(colors.modelColor("llama-4")).toBe("var(--color-family-other)");
    const opus = colors.models.filter((m) => m.includes("opus"));
    expect(colors.modelColor(opus[0])).toBe("var(--color-opus-1)");
  });
});
