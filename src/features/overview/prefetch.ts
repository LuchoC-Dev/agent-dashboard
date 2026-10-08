import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "../../bindings/DateRange";
import type { Provider } from "../../bindings/Provider";
import type { ScanReport } from "../../bindings/ScanReport";
import type { SessionSummary } from "../../bindings/SessionSummary";
import type { Fixture } from "../../hooks/useFixture";
import { presetRange, RANGE_PRESETS, resolveRange } from "../../lib/dates";
import { scope } from "../../lib/providers";
import { scopeDone } from "../../lib/scan";
import { toolQueries } from "../tools/queries";
import { overviewQueries } from "./queries";

const noop = () => {};
const idle = () =>
  new Promise<void>((resolve) =>
    "requestIdleCallback" in window
      ? window.requestIdleCallback(() => resolve(), { timeout: 500 })
      : setTimeout(resolve, 50),
  );

/**
 * Once the first screen is on, warms the cache for the other provider buttons and range presets
 * (without cross-filters), one request at a time while the page is idle, so switching them
 * shows final data at once. Only scopes whose scan finished are fetched: a partial result
 * must never be cached under a final key.
 */
export function usePrefetchOverview({
  enabled,
  all,
  report,
  provider,
  providers,
  range,
  fixture,
}: {
  enabled: boolean;
  all: SessionSummary[] | undefined;
  report: ScanReport | undefined;
  provider: Provider | null;
  providers: Provider[];
  range: DateRange;
  fixture: Fixture;
}) {
  const client = useQueryClient(),
    // A string, so a new array (or a scan report poll) with the same scopes does not restart it.
    done = [...new Set([provider, null, ...providers])]
      .filter((p) => scopeDone(report, p))
      .map((p) => p ?? "")
      .join(",");
  useEffect(() => {
    if (!enabled || !all?.length) return;
    let cancelled = false;
    const scopes = done.split(",").map((p) => (p || null) as Provider | null),
      ranges = [range, ...RANGE_PRESETS.map(([p]) => presetRange(p))];
    const jobs = scopes.flatMap((p) =>
      ranges.map((r) => {
        const closed = resolveRange(r, scope(all, p));
        return () =>
          Promise.all([
            client.query(overviewQueries.metrics(closed, p, fixture)).catch(noop),
            client.query(toolQueries.stats(closed, p, fixture)).catch(noop),
          ]);
      }),
    );
    void (async () => {
      for (const job of jobs) {
        await idle();
        if (cancelled) return;
        await job();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, all, done, range, fixture, client]);
}
