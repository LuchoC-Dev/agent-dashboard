/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SessionDetail } from "../../../../bindings/SessionDetail";
import { ErrorsTable } from "./SubagentsTable";

const detail = {
  messages: [
    {
      id: "m1",
      role: "assistant",
      timestamp: "2026-10-05T10:00:00Z",
      blocks: [
        { type: "toolCall", id: "c1", name: "Grep", input: {}, isError: true },
      ],
    },
  ],
  subagents: [],
} as unknown as SessionDetail;

describe("Errores table", () => {
  it("shows the tool name in monospace, like every other tool name", () => {
    render(<ErrorsTable detail={detail} onFocus={() => {}} />);
    expect(screen.getByText("Grep").className).toContain("mono");
  });
});
