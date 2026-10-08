/**
 * The app's own history: the location keys it visited and where it is, so the top bar knows
 * whether Back and Forward are possible without leaving the app (a fresh window starts with
 * nothing behind it, whatever the browser holds).
 */
export type HistoryStack = {
  keys: string[];
  at: number;
  /** Where the app's own steps are headed until React commits that location. */
  pending?: string;
};

export const startHistory = (key: string): HistoryStack => ({ keys: [key], at: 0 });

/** The stack after a router navigation (`PUSH`, `REPLACE` or `POP`) to `key`. */
export function historyStep(
  stack: HistoryStack,
  action: "PUSH" | "REPLACE" | "POP",
  key: string,
): HistoryStack {
  if (stack.pending) {
    // While its own steps land, a POP commits either the destination or a location already
    // stepped past (skipped): neither moves the stack. Anything else is a new navigation.
    if (action === "POP")
      return key === stack.pending ? { keys: stack.keys, at: stack.at } : stack;
    stack = { keys: stack.keys, at: stack.at };
  }
  if (stack.keys[stack.at] === key) return stack;
  if (action === "PUSH")
    return { keys: [...stack.keys.slice(0, stack.at + 1), key], at: stack.at + 1 };
  if (action === "REPLACE")
    return { keys: stack.keys.map((k, i) => (i === stack.at ? key : k)), at: stack.at };
  const at = stack.keys.indexOf(key);
  // A POP to an entry it never saw (e.g. before a reload): that entry is now the only one.
  return at < 0 ? startHistory(key) : { keys: stack.keys, at };
}

/**
 * The stack after stepping `delta` itself, or null when that leaves the app's entries. Applied
 * right away: the router moves at once but React commits the new location later (a
 * transition), and a second press in between must see where the first one went.
 */
export function historyGo(stack: HistoryStack, delta: -1 | 1): HistoryStack | null {
  const at = stack.at + delta;
  return at < 0 || at >= stack.keys.length ? null : { keys: stack.keys, at, pending: stack.keys[at] };
}

export const canGoBack = (s: HistoryStack) => s.at > 0;
export const canGoForward = (s: HistoryStack) => s.at < s.keys.length - 1;

/** Alt+←/Alt+→ and the mouse's back/forward buttons (3 and 4). */
export const navKey = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; key: string }) =>
  e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
    ? e.key === "ArrowLeft"
      ? -1
      : e.key === "ArrowRight"
        ? 1
        : 0
    : 0;
export const navButton = (button: number) => (button === 3 ? -1 : button === 4 ? 1 : 0);
