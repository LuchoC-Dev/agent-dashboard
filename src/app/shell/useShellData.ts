import { useEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { refresh } from "../../api";
import { sessionQueries } from "../../features/sessions/queries";
import { toolQueries } from "../../features/tools/queries";
import { useDateRange } from "../../hooks/useDateRange";
import { useFixture } from "../../hooks/useFixture";
import { useProvider } from "../../hooks/useProvider";
import { matchesDays, resolveRange } from "../../lib/dates";
import { activeProviders, scope } from "../../lib/providers";
import { scanSignature, scopeDone } from "../../lib/scan";
import { scanQueries } from "../queries";

/**
 * Everything the shell and the dashboard screens share. `all` is every session; `scoped` only
 * the URL provider's (`?proveedor=`), and `sessions` those of the URL range: both derived here
 * from `all`, so switching provider or range never waits for the backend. Tool stats need a
 * closed range and keep showing the previous result while the next one loads.
 *
 * `ready` says the selected scope is final: every source in it finished scanning and the list
 * was fetched after that. Until then the shell is complete but the screens show skeletons, so
 * a partial first scan (Claude before Codex) never flashes a different screen.
 */
export function useShellData() {
  const client = useQueryClient(),
    fixture = useFixture(),
    { range, setRange } = useDateRange(),
    { provider, setProvider } = useProvider();
  const report = useQuery(scanQueries.report(fixture)),
    scanned = scanSignature(report.data),
    all = useQuery(sessionQueries.everything(fixture, scanned));
  // A completed rescan (scannedAt moves while nothing is scanning) refreshes every query.
  // The first report only starts the data; scans in progress are handled by `scanned`.
  const scannedAt = report.data?.scanning ? null : report.data?.scannedAt,
    lastScan = useRef(scannedAt);
  useEffect(() => {
    if (!scannedAt || scannedAt === lastScan.current) return;
    const first = lastScan.current === undefined;
    lastScan.current = scannedAt;
    if (!first) void client.invalidateQueries();
  }, [client, scannedAt]);
  const scoped = useMemo(
      () => all.data && scope(all.data, provider),
      [all.data, provider],
    ),
    sessions = useMemo(
      () => scoped?.filter((s) => matchesDays(s.startedAt, range)),
      [scoped, range],
    ),
    providers = activeProviders(report.data, all.data),
    resolvedRange = useMemo(() => resolveRange(range, scoped), [range, scoped]),
    ready = scopeDone(report.data, provider) && !!all.data && !all.isPlaceholderData;
  const tools = useQuery({
    ...toolQueries.stats(resolvedRange, provider, fixture),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
  const error = all.error || report.error || tools.error;
  return {
    range,
    setRange,
    resolvedRange,
    provider,
    setProvider,
    /** Providers with sessions (or still scanning), in display order. */
    providers,
    all,
    scoped,
    sessions,
    tools,
    report,
    /** The selected provider scope finished scanning and its sessions are loaded. */
    ready,
    scanning: report.data?.scanning === true,
    loading: !error && !ready,
    error,
  };
}
export type ShellData = ReturnType<typeof useShellData>;

/** Refrescar: rescan the logs into memory, then refetch every query. */
export function useRefresh() {
  const client = useQueryClient(),
    [lastScan, setLastScan] = useState<number | null>(null);
  const mutation = useMutation({
    mutationFn: refresh,
    onSuccess: async (result) => {
      setLastScan(Date.parse(result.scannedAt));
      await client.invalidateQueries();
    },
  });
  return { mutation, lastScan, refresh: () => mutation.mutate() };
}

/** Current time, updated every `interval` ms. */
export function useNow(interval: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}
