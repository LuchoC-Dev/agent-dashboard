import { afterEach, vi } from "vitest";
import mockData from "../mocks/mock-data.json";

// The mock fixture is anchored to the moment it was generated (scripts/gen-mock-data.mjs NOW,
// written as its scan time). Every date range (presets, "today", defaults) is computed from the
// clock, so tests start the clock there: they never depend on the real date. Only `Date` is
// faked and it keeps ticking, so timers, waitFor and the mock's scan progress behave as usual.
vi.useFakeTimers({
  toFake: ["Date"],
  now: Date.parse(mockData.scanReport.scannedAt),
  shouldAdvanceTime: true,
});

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
