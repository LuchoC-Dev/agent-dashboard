import { QueryClient, queryOptions } from "@tanstack/react-query";
import { getScanReport } from "../api";
import type { Fixture } from "../hooks/useFixture";

/** Local files: no retries, no refetch on focus; Refrescar invalidates everything. */
export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: false },
    },
  });

export const scanQueries = {
  report: (fixture: Fixture) =>
    queryOptions({
      queryKey: ["scan-report", fixture],
      queryFn: getScanReport,
      refetchInterval: (query) => (query.state.data?.scanning ? 500 : false),
    }),
};
