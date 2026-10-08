/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { palette } from "../../../lib/colors";
import { mock } from "../../../test/fixtures";
import { SessionsTable } from "./SessionsTable";

describe("session model badges", () => {
  it("skip automatic reviews, even when recorded first", () => {
    const reviewed = mock.sessions.find((s) => s.models[0] === "codex-auto-review")!;
    expect(reviewed).toBeTruthy();
    render(
      <MemoryRouter>
        <SessionsTable sessions={[reviewed]} colors={palette(mock.sessions)} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Revisiones automáticas|Auto-review/)).toBeNull();
    expect(screen.getByTitle(reviewed.models[1])).toBeTruthy();
  });
});
