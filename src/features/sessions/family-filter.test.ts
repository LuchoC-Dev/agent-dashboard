import { describe, expect, it } from "vitest";
import { familyFilter, filterFamily, filterLabel, matchesModel, parseModel } from "../../lib/models";
import { mock } from "../../test/fixtures";
import { filterSessions } from "./filters";

describe("model family filter", () => {
  it("reads family values and leaves model ids alone", () => {
    expect(filterFamily(familyFilter("opus"))).toBe("opus");
    expect(filterFamily("familia:nope")).toBeNull();
    expect(filterFamily("claude-opus-5-5")).toBeNull();
    expect(filterLabel("familia:sol")).toBe("Sol (todas)");
    expect(filterLabel("claude-opus-5-5")).toBe("Opus 5.5");
  });

  it("matches every version of the family, never automatic reviews", () => {
    expect(matchesModel("claude-opus-5-5", "familia:opus")).toBe(true);
    expect(matchesModel("claude-opus-4-1", "familia:opus")).toBe(true);
    expect(matchesModel("claude-sonnet-5-5", "familia:opus")).toBe(false);
    expect(matchesModel("codex-auto-review", "familia:other")).toBe(false);
    expect(matchesModel("claude-opus-5-5", "claude-opus-5-5")).toBe(true);
    expect(matchesModel("claude-opus-4-1", "claude-opus-5-5")).toBe(false);
  });

  it("Sesiones keeps the sessions with any version of the family", () => {
    const families = new Set(mock.sessions.flatMap((s) => s.models.map((m) => parseModel(m).family)));
    for (const family of families) {
      const versions = new Set(
        mock.sessions.flatMap((s) => s.models).filter((m) => matchesModel(m, familyFilter(family))),
      );
      if (!versions.size) continue;
      const byFamily = filterSessions(mock.sessions, { q: "", project: "", model: familyFilter(family) });
      const byVersions = mock.sessions.filter((s) => s.models.some((m) => versions.has(m)));
      expect(byFamily.map((s) => s.id), family).toEqual(byVersions.map((s) => s.id));
      // A family covers at least what each of its versions does.
      for (const v of versions)
        expect(byFamily.length).toBeGreaterThanOrEqual(
          filterSessions(mock.sessions, { q: "", project: "", model: v }).length,
        );
    }
  });
});
