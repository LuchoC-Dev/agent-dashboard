/** @vitest-environment jsdom */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usd } from "../../lib/format";
import { mock } from "../../test/fixtures";
import { dashboardReady, renderApp } from "../../test/render";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

const costFigure = () =>
  screen.getAllByText(/^Costo /)[0].closest(".kpi")!.querySelector(".kpi-main")!.children[1];

describe("session detail cost (v2.9)", { timeout: 30_000 }, () => {
  it("the cost tile marks unpriced tokens before the amount, like the header", async () => {
    const s = mock.sessions.find((x) => x.unpricedTokens)!;
    renderApp("/sesion/" + s.id);
    await dashboardReady();
    const figure = costFigure(),
      mark = figure.querySelector("[data-unpriced]")!;
    expect(mark).toBeTruthy();
    expect(figure.firstElementChild).toBe(mark);
    expect(figure.textContent).toBe("*" + usd(s.costUsd));
  });

  it("a fully priced session's cost tile has no mark", async () => {
    const s = mock.sessions.find((x) => !x.unpricedTokens)!;
    renderApp("/sesion/" + s.id);
    await dashboardReady();
    expect(costFigure().querySelector("[data-unpriced]")).toBeNull();
  });
});
