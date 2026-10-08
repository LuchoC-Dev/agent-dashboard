import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router";
import {
  canGoBack,
  canGoForward,
  historyGo,
  historyStep,
  navButton,
  navKey,
  startHistory,
} from "../../lib/history";

/**
 * Back and Forward through the app's history. Filters live in the URL, so stepping back
 * restores them. Also wires Alt+←/Alt+→ and the mouse's back/forward buttons, handled here
 * (the native gesture is cancelled) so they never step outside the app's own entries.
 */
export function useHistoryNav() {
  const location = useLocation(),
    action = useNavigationType(),
    navigate = useNavigate();
  const [stack, setStack] = useState(() => startHistory(location.key));
  useLayoutEffect(() => setStack((s) => historyStep(s, action, location.key)), [action, location.key]);
  const state = useRef(stack);
  useLayoutEffect(() => {
    state.current = stack;
  }, [stack]);
  // Steps from the latest stack, updated before navigating: the POP that follows finds its
  // key already current, and a press before React commits it starts from the right place.
  const go = useRef((delta: -1 | 1) => {
    const next = historyGo(state.current, delta);
    if (!next) return;
    state.current = next;
    setStack(next);
    navigate(delta);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const delta = navKey(e);
      if (!delta) return;
      e.preventDefault();
      go.current(delta as -1 | 1);
    };
    // Cancel the native gesture on press and release; step on release, as browsers do.
    const onMouse = (e: MouseEvent) => {
      const delta = navButton(e.button);
      if (!delta) return;
      e.preventDefault();
      if (e.type === "mouseup") go.current(delta as -1 | 1);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouse);
    window.addEventListener("mouseup", onMouse);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouse);
      window.removeEventListener("mouseup", onMouse);
    };
  }, []);
  return {
    canBack: canGoBack(stack),
    canForward: canGoForward(stack),
    back: () => go.current(-1),
    forward: () => go.current(1),
  };
}
