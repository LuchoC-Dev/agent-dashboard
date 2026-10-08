/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Block } from "../../../../bindings/Block";
import type { Message } from "../../../../bindings/Message";
import type { Role } from "../../../../bindings/Role";
import type { Subagent } from "../../../../bindings/Subagent";
import { palette } from "../../../../lib/colors";
import { Timeline } from "./Timeline";

const call = (id: string, isError = false): Block =>
  ({ type: "toolCall", id, name: "Bash", input: {}, isError }) as Block;
const message = (id: string, role: Role, timestamp: string, blocks: Block[]) =>
  ({ id, role, timestamp, model: null, blocks, usage: null }) as Message;
const agent = (
  id: string,
  agentType: string,
  startedAt: string,
  messages: Message[],
  parentToolCallId: string | null = null,
) =>
  ({
    id,
    agentType,
    parentToolCallId,
    startedAt,
    endedAt: startedAt,
    messages,
    usage: {},
    costUsd: 0,
  }) as unknown as Subagent;

const t = (s: number) => `2026-10-05T10:00:${String(s).padStart(2, "0")}Z`;
const messages = [
  message("u1", "user", t(0), [{ type: "text", text: "hola" } as Block]),
  message("a1", "assistant", t(10), [call("failed", true)]),
];
const subagents = [
  // Placed by time inside the user message.
  agent("by-time", "Placed", t(5), [message("p1", "assistant", t(6), [])]),
  // Attached to the failed call.
  agent(
    "attached",
    "Attached",
    t(11),
    [message("n1", "assistant", t(12), [call("inner")])],
    "failed",
  ),
];

const chevron = (button: HTMLElement) => within(button).getByText("›");
const openSubagent = (name: string) => {
  const button = screen.getByRole("button", { name: new RegExp(name) });
  fireEvent.click(button);
  return button;
};

describe("conversation styles stay on their own element", () => {
  const renderTimeline = () =>
    render(
      <Timeline
        messages={messages}
        subagents={subagents}
        colors={palette([])}
        focus={{ call: "failed" }}
      />,
    );

  it("only the expanded call's chevron turns", () => {
    renderTimeline();
    const failed = document.querySelector<HTMLElement>("#call-failed > button")!;
    expect(failed.getAttribute("aria-expanded")).toBe("true");
    expect(chevron(failed).className).toContain("rotate-90");
    const sub = openSubagent("Attached");
    expect(chevron(sub).className).toContain("rotate-90");
    const inner = document.querySelector<HTMLElement>("#call-inner > button")!;
    expect(inner.getAttribute("aria-expanded")).toBe("false");
    expect(chevron(inner).className).not.toContain("rotate-90");
  });

  it("rows nested inside a failed call keep their own background", () => {
    renderTimeline();
    openSubagent("Attached");
    const failed = document.querySelector("#call-failed > button")!,
      inner = document.querySelector("#call-inner > button")!;
    expect(failed.className).toContain("bg-error-wash");
    expect(inner.className).not.toContain("bg-error-wash");
  });

  it("only user messages get a filled dot", () => {
    renderTimeline();
    openSubagent("Placed");
    const dot = (id: string) =>
      document.querySelector(`#msg-${id} i`)!.className;
    expect(dot("u1")).toContain("bg-ink");
    expect(dot("p1")).not.toContain("bg-ink");
    expect(dot("a1")).not.toContain("bg-ink");
  });
});

describe("Codex conversation", () => {
  const wrapper = call("exec-1"),
    inner = { ...call("inner-1"), parentCallId: "exec-1" } as Block;
  const codex = [
    message("cu", "user", t(0), [{ type: "text", text: "probá" } as Block]),
    message("ca", "assistant", t(5), [wrapper, inner]),
    { ...message("cb", "assistant", t(8), [{ type: "text", text: "descartado" } as Block]), branch: "b1" },
  ];
  const show = () =>
    render(<Timeline messages={codex} colors={palette([])} agentName="Codex" />);

  it("names the provider and nests calls under their wrapper", () => {
    show();
    expect(screen.getAllByText("Codex").length).toBeGreaterThan(0);
    const parent = document.getElementById("call-exec-1")!;
    expect(parent.contains(document.getElementById("call-inner-1"))).toBe(true);
  });

  it("groups a discarded branch and can hide every branch", () => {
    show();
    const group = screen.getByRole("region", { name: "Rama descartada" });
    expect(within(group).queryByText("descartado")).toBeNull();
    fireEvent.click(within(group).getByRole("button"));
    expect(within(group).getByText("descartado")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ocultar ramas descartadas/ }));
    expect(screen.queryByRole("region", { name: "Rama descartada" })).toBeNull();
  });
});
