/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { aggregate } from "../../../lib/aggregate";
import { palette } from "../../../lib/colors";
import { mock } from "../../../test/fixtures";
import { ModelsByFamily } from "./ModelsByFamily";
import { tok } from "../../../lib/format";
import { totalTok } from "../../../lib/usage";

const details = Object.values(mock.details),
  colors = palette(mock.sessions);
const show = (provider?: "claude" | "codex") => {
  const sessions = mock.sessions.filter((s) => !provider || s.provider === provider);
  render(
    <MemoryRouter>
      <ModelsByFamily
        metrics={aggregate(sessions, mock.metrics.range, details)}
        colors={colors}
      />
    </MemoryRouter>,
  );
};

describe("Por modelo", () => {
  it("heads each provider's families when both have data", () => {
    show();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Claude")).toBeTruthy();
    expect(within(table).getByText("Codex")).toBeTruthy();
    // Families start collapsed: a version is one click away.
    expect(within(table).queryByText("Sol 6.1")).toBeNull();
    const family = within(table)
      .getAllByRole("button", { expanded: false })
      .find((b) => /Sol/.test(b.textContent!))!;
    fireEvent.click(family);
    expect(family.getAttribute("aria-expanded")).toBe("true");
    expect(within(table).getByText("Sol 6.1")).toBeTruthy();
  });

  it("collapses a provider's block from its row, by keyboard too", () => {
    show();
    const table = screen.getByRole("table"),
      codex = within(table).getByRole("button", { name: /Codex/ });
    expect(codex.getAttribute("aria-expanded")).toBe("true");
    expect(within(table).getByText("Revisiones automáticas")).toBeTruthy();
    // A native button: Enter and Space activate it as a click.
    codex.focus();
    fireEvent.click(codex);
    expect(codex.getAttribute("aria-expanded")).toBe("false");
    expect(within(table).queryByText("Revisiones automáticas")).toBeNull();
    expect(within(table).getByText("Claude")).toBeTruthy();
  });

  it("shows automatic reviews as their own row, not a model, and keeps totals", () => {
    show();
    const table = screen.getByRole("table");
    expect(within(table).queryByText(/Auto-review/)).toBeNull();
    const row = within(table).getByText(/Revisiones automáticas/).closest("tr")!;
    // Unpriced: no cost, flagged with the marker.
    expect(within(row).getByRole("img", { name: /sin precio/ })).toBeTruthy();
    // The Codex subtotal still counts the reviews' tokens.
    const metrics = aggregate(mock.sessions, mock.metrics.range, details),
      codex = metrics.byModel.filter((g) => g.key.startsWith("gpt-") || g.key.startsWith("codex-"));
    const header = within(table).getByText("Codex").closest("tr")!;
    expect(header.textContent).toContain(tok(codex.reduce((n, g) => n + totalTok(g.usage), 0)));
  });

  it("flags unpriced models and omits provider rows for one provider", () => {
    show("codex");
    expect(screen.queryByText("Claude")).toBeNull();
    expect(screen.getAllByRole("img", { name: /sin precio/ }).length).toBeGreaterThan(0);
  });
});
