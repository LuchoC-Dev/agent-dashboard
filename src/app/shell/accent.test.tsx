/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ACCENTS, DEFAULT_ACCENT } from "../../lib/accents";
import { dashboardReady, renderApp } from "../../test/render";

// v2.5.1: the app accent is one swappable token set, chosen beside the theme switch.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

const css = readFileSync("src/styles/theme.css", "utf8");
/** Every declaration of `prop` in theme.css. */
const declared = (prop: string) =>
  [...css.matchAll(new RegExp(`\\s${prop}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim());

describe("accent token wiring", () => {
  it("links, focus and selection read the app accent, in both themes", () => {
    expect(declared("--color-accent")).toEqual(["var(--app-accent-ink)"]);
    expect(declared("--color-accent-wash")).toEqual(["var(--app-accent-wash)"]);
  });

  it("Todos is the app accent", () => {
    const all = css.slice(css.indexOf(':root[data-provider="all"]'));
    const block = all.slice(0, all.indexOf("}"));
    for (const [brand, app] of [
      ["base", ""],
      ["alt-1", "-alt-1"],
      ["alt-2", "-alt-2"],
      ["alt-3", "-alt-3"],
      ["ink", "-ink"],
      ["on", "-on"],
      ["wash", "-wash"],
    ])
      expect(block).toContain(`--brand-${brand}: var(--app-accent${app});`);
  });

  it("the default preset also applies without the attribute", () => {
    expect(css).toContain(`:root:not([data-accent]),\n  [data-accent="${DEFAULT_ACCENT}"] {`);
  });
});

describe("accent picker", { timeout: 30_000 }, () => {
  it("applies the choice and keeps it across navigation, like the theme", async () => {
    const router = renderApp("/resumen");
    await dashboardReady();
    const html = document.documentElement,
      picker = () => screen.getByRole("group", { name: "Color de acento" });
    expect(html.dataset.accent).toBe(DEFAULT_ACCENT);
    expect(within(picker()).getAllByRole("button")).toHaveLength(ACCENTS.length);

    fireEvent.click(within(picker()).getByRole("button", { name: "Violeta" }));
    fireEvent.click(screen.getByRole("button", { name: "Oscuro" }));
    expect(html.dataset.accent).toBe("violeta");

    await act(() => router.navigate("/sesiones"));
    expect(html.dataset.accent).toBe("violeta");
    expect(html.dataset.theme).toBe("dark");
    const pressed = within(picker()).getByRole("button", { pressed: true });
    expect(pressed.getAttribute("aria-label")).toBe("Violeta");
    // Each swatch shows its own preset, whatever the current one.
    for (const [id, label] of ACCENTS)
      expect(within(picker()).getByRole("button", { name: label }).dataset.accent).toBe(id);
  });
});
