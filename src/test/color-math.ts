/**
 * The categorical palette checks of the dataviz validator, for tests: OKLab distances (×100)
 * under normal vision and Machado (2009, severity 1) protanopia/deuteranopia, OKLCH lightness,
 * chroma and hue. Test-only: the app never computes colors at runtime.
 */
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};
type Vision = keyof typeof MACHADO | "normal";

const linear = (hex: string) =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

function oklab([r, g, b]: number[]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const simulate = (rgb: number[], vision: Vision) =>
  vision === "normal"
    ? rgb
    : MACHADO[vision].map((row) =>
        Math.max(0, Math.min(1, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])),
      );

/** OKLab ΔE ×100 between two colors as seen with `vision`. */
export function deltaE(a: string, b: string, vision: Vision = "normal") {
  const x = oklab(simulate(linear(a), vision)),
    y = oklab(simulate(linear(b), vision));
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** Worst red–green CVD distance: min(protan, deutan). */
export const cvdDeltaE = (a: string, b: string) =>
  Math.min(deltaE(a, b, "protan"), deltaE(a, b, "deutan"));

/** OKLCH lightness, chroma and hue (degrees, 0–360). */
export function oklch(hex: string) {
  const [L, a, b] = oklab(linear(hex));
  return { L, C: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 };
}

/** The validator's lightness band per theme. */
export const BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] } as const;

/** WCAG 2 contrast ratio between two opaque colors (1–21). */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, b] = linear(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
