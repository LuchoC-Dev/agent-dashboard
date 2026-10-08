import { afterEach } from "vitest";

// DOM-only setup for test files that opt into jsdom (route smoke tests).
if (typeof window !== "undefined") {
  // jsdom lacks layout APIs that Recharts and the conversation timeline use.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView ??= () => {};
  const { cleanup } = await import("@testing-library/react");
  afterEach(cleanup);
}
