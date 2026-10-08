import type { Provider } from "../bindings/Provider";

/** Claude families, then Codex (GPT) families, then unknown ids. */
export const MODEL_FAMILIES = [
  "opus",
  "sonnet",
  "haiku",
  "sol",
  "terra",
  "luna",
  "mini",
  "other",
] as const;
export type ModelFamily = (typeof MODEL_FAMILIES)[number];

const capital = (s: string) => s[0].toUpperCase() + s.slice(1);
const version = (major?: string, minor?: string) =>
  [Number(major || 0), Number(minor || 0)];
const versionLabel = (major: string, minor?: string) =>
  major + (minor ? "." + minor : "");

/**
 * Family, version and display name of a model id:
 * `claude-opus-5-5` → Opus 5.5, `gpt-6.1-sol` → Sol 6.1, `gpt-5.4-mini` → Mini 5.4,
 * plain `gpt-5.5` → GPT-5.5 (Sol tier). Automatic reviews are not a model: see `isAutoReview`.
 */
export function parseModel(id: string): {
  family: ModelFamily;
  version: number[];
  name: string;
} {
  const claude = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/.exec(id);
  if (claude)
    return {
      family: claude[1] as ModelFamily,
      version: version(claude[2], claude[3]),
      name: capital(claude[1]) + " " + versionLabel(claude[2], claude[3]),
    };
  const gpt = id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  const tier = /^gpt-(\d+)(?:\.(\d+))?-(sol|terra|luna|mini)$/.exec(gpt);
  if (tier)
    return {
      family: tier[3] as ModelFamily,
      version: version(tier[1], tier[2]),
      name: capital(tier[3]) + " " + versionLabel(tier[1], tier[2]),
    };
  const plain = /^gpt-(\d+)(?:\.(\d+))?$/.exec(gpt);
  if (plain)
    return {
      family: "sol",
      version: version(plain[1], plain[2]),
      name: "GPT-" + versionLabel(plain[1], plain[2]),
    };
  if (isAutoReview(id))
    return { family: "other", version: [0, 0], name: AUTO_REVIEW_LABEL };
  return { family: "other", version: [0, 0], name: id };
}

/**
 * `codex-auto-review` is Codex's guardian reviewer, not a model the user picked: it is left
 * out of model lists, families, the "Por modelo" grouping and model badges, and its usage is
 * shown on its own as "Revisiones automáticas" so totals still add up.
 */
export const isAutoReview = (id: string) => id.startsWith("codex-auto-review");
export const AUTO_REVIEW_LABEL = "Revisiones automáticas";

/** A session's models, without automatic reviews, in recorded order. */
export const sessionModels = (s: { models: string[] }) =>
  [...new Set(s.models)].filter((m) => !isAutoReview(m));

export const familyLabel = (f: ModelFamily) =>
  f === "other" ? "Otros" : capital(f);

/** The provider whose models form a family; null for unknown ids. */
export const familyProvider = (f: ModelFamily): Provider | null =>
  f === "other"
    ? null
    : ["opus", "sonnet", "haiku"].includes(f)
      ? "claude"
      : "codex";

export const modelOrder = (a: string, b: string) => {
  const x = parseModel(a),
    y = parseModel(b);
  return (
    MODEL_FAMILIES.indexOf(x.family) - MODEL_FAMILIES.indexOf(y.family) ||
    y.version[0] - x.version[0] ||
    y.version[1] - x.version[1] ||
    a.localeCompare(b)
  );
};

const FAMILY_PREFIX = "familia:";
/** The model-filter value that selects every version of a family (`modelo=familia:opus`). */
export const familyFilter = (f: ModelFamily) => FAMILY_PREFIX + f;
/** The family a model-filter value selects, or null for a single model id. */
export function filterFamily(value: string): ModelFamily | null {
  const f = value.startsWith(FAMILY_PREFIX) ? value.slice(FAMILY_PREFIX.length) : null;
  return f && (MODEL_FAMILIES as readonly string[]).includes(f) ? (f as ModelFamily) : null;
}
/**
 * Whether a model id passes a model filter: the same id, or any version of the filtered
 * family (automatic reviews never belong to one).
 */
export function matchesModel(id: string, filter: string) {
  const family = filterFamily(filter);
  return family ? !isAutoReview(id) && parseModel(id).family === family : id === filter;
}
/** A model-filter value's display name: "Opus 5.5", or "Opus (todas)" for a family. */
export function filterLabel(value: string) {
  const family = filterFamily(value);
  return family ? `${familyLabel(family)} (todas)` : parseModel(value).name;
}
