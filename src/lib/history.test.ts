import { describe, expect, it } from "vitest";
import {
  canGoBack,
  canGoForward,
  historyGo,
  historyStep,
  navButton,
  navKey,
  startHistory,
} from "./history";

describe("app history stack", () => {
  it("pushes, steps back and forward, and drops the forward entries on a new push", () => {
    let s = startHistory("a");
    expect([canGoBack(s), canGoForward(s)]).toEqual([false, false]);
    s = historyStep(s, "PUSH", "b");
    s = historyStep(s, "PUSH", "c");
    s = historyStep(s, "POP", "b");
    expect([canGoBack(s), canGoForward(s)]).toEqual([true, true]);
    s = historyStep(s, "PUSH", "d");
    expect(s.keys).toEqual(["a", "b", "d"]);
    expect(canGoForward(s)).toBe(false);
  });

  it("replaces in place and restarts on an unknown entry", () => {
    const s = historyStep(historyStep(startHistory("a"), "PUSH", "b"), "REPLACE", "b2");
    expect(s).toEqual({ keys: ["a", "b2"], at: 1 });
    expect(historyStep(s, "POP", "zz")).toEqual({ keys: ["zz"], at: 0 });
    expect(historyStep(s, "POP", "b2")).toBe(s);
  });

  it("steps itself within the app's entries; the POP that follows changes nothing", () => {
    const s = historyStep(historyStep(startHistory("a"), "PUSH", "b"), "PUSH", "c");
    const back = historyGo(s, -1)!;
    expect(back.at).toBe(1);
    expect(historyStep(back, "POP", "b")).toEqual({ keys: ["a", "b", "c"], at: 1 });
    // A second press before the first is committed starts from where the first went.
    const twice = historyGo(back, -1)!;
    expect(twice.at).toBe(0);
    expect(historyGo(twice, -1)).toBeNull();
    // A late commit of the skipped location does not move it; the destination settles it.
    expect(historyStep(twice, "POP", "b")).toBe(twice);
    expect(historyStep(twice, "POP", "a")).toEqual({ keys: ["a", "b", "c"], at: 0 });
    // A new navigation meanwhile still drops the forward entries.
    expect(historyStep(twice, "PUSH", "d")).toEqual({ keys: ["a", "d"], at: 1 });
    expect(historyGo(s, 1)).toBeNull();
  });

  it("maps Alt+arrows and the mouse side buttons", () => {
    const k = { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false };
    expect(navKey({ ...k, key: "ArrowLeft" })).toBe(-1);
    expect(navKey({ ...k, key: "ArrowRight" })).toBe(1);
    expect(navKey({ ...k, altKey: false, key: "ArrowLeft" })).toBe(0);
    expect(navKey({ ...k, ctrlKey: true, key: "ArrowLeft" })).toBe(0);
    expect([navButton(3), navButton(4), navButton(0)]).toEqual([-1, 1, 0]);
  });
});
