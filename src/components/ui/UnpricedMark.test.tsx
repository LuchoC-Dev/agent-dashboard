/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnpricedMark } from "./UnpricedMark";

describe("UnpricedMark", () => {
  it("shows only the mark; the explanation is its label and a tooltip on focus", () => {
    render(<UnpricedMark tokens={1234} />);
    const mark = screen.getByRole("img", { name: /1\.234 tokens sin precio/ });
    expect(mark.textContent).toBe("*");
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(mark);
    expect(screen.getByRole("tooltip").textContent).toMatch(/sin precio/);
    fireEvent.blur(mark);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("is not a tab stop inside a button; focusing the button shows the tooltip", () => {
    render(
      <button>
        Costo <UnpricedMark tokens={10} />
      </button>,
    );
    expect(screen.getByRole("img").hasAttribute("tabindex")).toBe(false);
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });

  it("opens only the mark under the pointer when a control holds several", () => {
    render(
      <button>
        Total <UnpricedMark tokens={1} /> Codex <UnpricedMark tokens={2} />
      </button>,
    );
    const [first, second] = screen.getAllByRole("img"),
      button = screen.getByRole("button");
    fireEvent.mouseEnter(second);
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(screen.getByRole("tooltip").textContent).toMatch(/Incluye 2 tokens/);
    // The click focuses the button: still only the hovered mark's tooltip.
    fireEvent.pointerDown(second);
    fireEvent.focus(button);
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    fireEvent.mouseLeave(second);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(first);
    expect(screen.getByRole("tooltip").textContent).toMatch(/Incluye 1 tokens/);
  });

  it("keyboard focus on a control opens only its first mark", () => {
    render(
      <button>
        Total <UnpricedMark tokens={1} /> Codex <UnpricedMark tokens={2} />
      </button>,
    );
    fireEvent.focus(screen.getByRole("button"));
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(screen.getByRole("tooltip").textContent).toMatch(/Incluye 1 tokens/);
  });

  it("renders nothing without unpriced tokens", () => {
    const { container } = render(<UnpricedMark tokens={0} />);
    expect(container.textContent).toBe("");
  });
});
