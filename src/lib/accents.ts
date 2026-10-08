/**
 * App accent presets, in picker order. Each id has a `[data-accent="<id>"]` block in
 * styles/theme.css (the colors live only there); adding one takes both.
 */
export const ACCENTS = [
  ["bronce", "Bronce"],
  ["violeta", "Violeta"],
  ["fucsia", "Fucsia"],
  ["turquesa", "Turquesa"],
] as const;

export type Accent = (typeof ACCENTS)[number][0];

/** The most neutral preset that is not green (status "ok" is green). */
export const DEFAULT_ACCENT: Accent = "bronce";
