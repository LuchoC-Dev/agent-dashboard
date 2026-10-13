/** @vitest-environment jsdom */
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { projectHref } from "../lib/projects";
import { mock } from "../test/fixtures";
import { renderApp } from "../test/render";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

/*
 * The UI consistency rules (docs/architecture/frontend.md, "Tables and data lists") on every
 * screen with tables: no accent in table bodies, clickable cells carry the clickable style,
 * markers never push the figures of a column.
 */
const session = mock.sessions.find((s) => s.subagentCount > 0 && s.unpricedTokens)!;
const SCREENS: [string, string, number][] = [
  // [name, path, tables expected at least]
  ["Resumen", "/resumen", 4],
  ["Sesiones", "/sesiones", 1],
  ["Proyectos", "/proyectos", 1],
  ["project page", projectHref(session.projectKey), 3],
  ["Herramientas", "/herramientas?tool=Read", 2],
  ["session detail", "/sesion/" + encodeURIComponent(session.id), 2],
];

/** A class that paints with the accent; focus rings and selected states may. */
const accentPaint = (cls: string) => {
  const parts = cls.split(":"),
    utility = parts.pop()!;
  return (
    /^(text|bg|border|fill|stroke|outline|decoration)-accent/.test(utility) &&
    !parts.some((v) => /^(focus|focus-visible|aria-pressed|aria-selected|data-selected)$/.test(v))
  );
};

describe("UI rules in every table", { timeout: 60_000 }, () => {
  for (const [name, path, tables] of SCREENS)
    it(name, async () => {
      renderApp(path);
      await waitFor(
        () => {
          // Some tables may be legitimately empty (a session without errors).
          const filled = screen
            .getAllByRole("table")
            .filter((t) => t.querySelector("tbody tr:not(.empty-row)"));
          expect(filled.length).toBeGreaterThanOrEqual(tables);
        },
        { timeout: 20_000 },
      );
      const bodies = [...document.querySelectorAll("tbody")];
      const all = bodies.flatMap((b) => [...b.querySelectorAll<HTMLElement>("*")]);

      // 2. No accent inside table bodies (classes or inline styles).
      const accented = all.filter(
        (el) =>
          [...el.classList].some(accentPaint) || /accent/.test(el.getAttribute("style") ?? ""),
      );
      expect(accented.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);

      // 1. Links and buttons in a table are clickable at a glance: semibold, normal text color.
      const controls = all.filter((el) => el.matches("a, button"));
      expect(controls.length).toBeGreaterThan(0);
      // Same color for every one: no gray or other color to flag a data state (an untitled
      // session reads like a titled one).
      const textColors = (el: Element) =>
        [...el.classList].filter((c) => /^text-(?!size-|left|right|center|ellipsis)/.test(c));
      const plain = controls.filter(
        (el) => !el.classList.contains("font-semibold") || textColors(el).join() !== "text-ink",
      );
      expect(plain.map((el) => el.outerHTML.slice(0, 120))).toEqual([]);

      // 3. Markers sit before the figure: no cell ends with the unpriced mark or reads "7 · ⊗ 2".
      const cells = bodies.flatMap((b) => [...b.querySelectorAll("td")]);
      expect(cells.filter((td) => /\*\s*$/.test(td.textContent!)).map((td) => td.textContent)).toEqual([]);
      expect(cells.filter((td) => /\d · ⊗/.test(td.textContent!)).map((td) => td.textContent)).toEqual([]);
      for (const mark of bodies.flatMap((b) => [...b.querySelectorAll("[data-unpriced]")]))
        expect(mark.nextSibling?.textContent).toMatch(/\d/);
    });
});
