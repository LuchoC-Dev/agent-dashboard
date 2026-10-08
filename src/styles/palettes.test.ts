import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCENTS } from "../lib/accents";
import { PROJECT_SLOTS } from "../lib/colors";
import { BAND, contrast, cvdDeltaE, deltaE, oklch } from "../test/color-math";

/**
 * Validates the categorical palettes in theme.css, in both themes, with the dataviz validator's
 * checks: lightness band, chroma floor (never gray), adjacent pairs ≥ 15 ΔE under normal vision
 * and ≥ 8 under red–green color blindness, in the order the charts stack them.
 */
const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

/** The text of the `{ … }` block that starts after `start`. */
function block(text: string, start: string) {
  const open = text.indexOf("{", text.indexOf(start));
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    depth += text[i] === "{" ? 1 : text[i] === "}" ? -1 : 0;
    if (!depth) return text.slice(open + 1, i);
  }
  throw new Error("unclosed block " + start);
}
const values = (text: string) =>
  Object.fromEntries(
    [...text.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
  );
const root = block(block(css, "@layer base"), ":root");
const light = values(block(css, "@theme static")),
  dark = { ...light, ...values(block(root, "@variant dark")) };
/** A block's own values for light and, from its `@variant dark`, for dark. */
const lightDark = (start: string) => {
  const text = block(css, start),
    darkText = block(text, "@variant dark");
  return { light: values(text.replace(darkText, "")), dark: values(darkText) };
};
const provider = (name: string) => lightDark(`:root[data-provider="${name}"]`);
const accent = (id: string) => lightDark(`[data-accent="${id}"]`);
const themes = { light, dark } as const;

it("reads both themes from theme.css", () => {
  expect(light["--color-opus-1"]).toMatch(/^#/);
  expect(dark["--color-opus-1"]).not.toBe(light["--color-opus-1"]);
  expect(provider("codex").dark["--brand-base"]).not.toBe(provider("codex").light["--brand-base"]);
  expect(accent("violeta").dark["--app-accent"]).not.toBe(accent("violeta").light["--app-accent"]);
});

const MODELS = {
  claude: ["opus", "sonnet", "haiku"],
  codex: ["sol", "terra", "luna", "mini"],
};
const steps = (families: string[]) => families.flatMap((f) => [1, 2, 3].map((i) => `--color-${f}-${i}`));

function expectCategorical(colors: string[], mode: "light" | "dark", label: string) {
  for (const c of colors) {
    const { L, C } = oklch(c);
    expect(L, `${label} ${c} lightness`).toBeGreaterThanOrEqual(BAND[mode][0]);
    expect(L, `${label} ${c} lightness`).toBeLessThanOrEqual(BAND[mode][1]);
    expect(C, `${label} ${c} chroma`).toBeGreaterThanOrEqual(0.1);
  }
  for (let i = 1; i < colors.length; i++) {
    const [a, b] = [colors[i - 1], colors[i]];
    expect(deltaE(a, b), `${label} ${a}↔${b} normal`).toBeGreaterThanOrEqual(15);
    expect(cvdDeltaE(a, b), `${label} ${a}↔${b} CVD`).toBeGreaterThanOrEqual(8);
  }
}

describe.each(["light", "dark"] as const)("%s palettes", (mode) => {
  const t = themes[mode];

  it("model families pass as one adjacent set in stack order", () => {
    expectCategorical(
      steps([...MODELS.claude, ...MODELS.codex]).map((k) => t[k]),
      mode,
      "models",
    );
  });

  it("keeps the newest and oldest versions of a family apart", () => {
    // -1 and -3 meet when -2 is filtered out; the name is always printed next to them.
    for (const f of [...MODELS.claude, ...MODELS.codex]) {
      const [a, b] = [t[`--color-${f}-1`], t[`--color-${f}-3`]];
      expect(deltaE(a, b), `${f} normal`).toBeGreaterThanOrEqual(9.5);
      expect(cvdDeltaE(a, b), `${f} CVD`).toBeGreaterThanOrEqual(5.5);
    }
  });

  it("colors each model in its provider's hue family", () => {
    // Claude: wine · red · amber (warm); Codex: cyan · blue · violet (cool).
    for (const k of steps(MODELS.claude)) {
      const h = oklch(t[k]).h;
      expect(h < 110 || h > 330, `${k} ${t[k]} hue ${h.toFixed(0)}`).toBe(true);
    }
    for (const k of steps(MODELS.codex)) {
      const h = oklch(t[k]).h;
      expect(h > 180 && h < 340, `${k} ${t[k]} hue ${h.toFixed(0)}`).toBe(true);
    }
  });

  it("project slots pass in rank order, wrapping around", () => {
    const series = Array.from({ length: PROJECT_SLOTS }, (_, i) => t[`--color-series-${i + 1}`]);
    expect(series.every(Boolean)).toBe(true);
    expectCategorical([...series, series[0]], mode, "projects");
    // The second lightness of each hue stays apart from the first.
    for (let i = 0; i < PROJECT_SLOTS / 2; i++)
      expect(deltaE(series[i], series[i + PROJECT_SLOTS / 2]), `slot ${i + 1}`).toBeGreaterThanOrEqual(10);
  });

  // The app accent ("Todos", links, focus, selection): every preset of the picker.
  describe.each(ACCENTS.map(([id]) => id))("accent %s", (id) => {
    const a = accent(id)[mode],
      kinds = ["--app-accent", "--app-accent-alt-1", "--app-accent-alt-2", "--app-accent-alt-3"];

    it("defines every token", () => {
      for (const k of [...kinds, "--app-accent-ink", "--app-accent-on", "--app-accent-wash"])
        expect(a[k], k).toMatch(/^#/);
    });

    it("passes as the Todos token-kind stack", () => {
      expectCategorical(kinds.map((k) => a[k]), mode, id);
    });

    it("stays apart from both providers and the status colors", () => {
      const base = a["--app-accent"],
        others = {
          claude: t["--brand-base"],
          codex: provider("codex")[mode]["--brand-base"],
          ok: t["--color-ok-mark"],
          error: t["--color-error-mark"],
        };
      for (const [name, c] of Object.entries(others))
        expect(deltaE(base, c), `${id} ↔ ${name}`).toBeGreaterThanOrEqual(15);
      // Never green: "ok" owns it.
      const h = oklch(base).h;
      expect(h < 120 || h > 180, `${id} hue ${h.toFixed(0)}`).toBe(true);
    });

    it("keeps text contrast", () => {
      const ink = a["--app-accent-ink"];
      for (const bg of [t["--color-page"], t["--color-surface"], t["--color-sunken"], a["--app-accent-wash"]])
        expect(contrast(ink, bg), `${id} ink on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(a["--app-accent-on"], a["--app-accent"]), `${id} on`).toBeGreaterThanOrEqual(4.5);
    });
  });
});

it("styles every accent preset of the picker, and only those", () => {
  const ids = [...css.matchAll(/\[data-accent="([\w-]+)"\]/g)].map((m) => m[1]);
  expect(new Set(ids)).toEqual(new Set(ACCENTS.map(([id]) => id)));
});
