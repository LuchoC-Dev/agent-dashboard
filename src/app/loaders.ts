import type { QueryClient } from "@tanstack/react-query";
import { redirect, type LoaderFunctionArgs } from "react-router";
import type { DateRange } from "../bindings/DateRange";
import { overviewQueries } from "../features/overview/queries";
import { projectQueries } from "../features/projects/queries";
import { conversationPath } from "../features/sessions/focus";
import { sessionQueries } from "../features/sessions/queries";
import { toolQueries } from "../features/tools/queries";
import type { Provider } from "../bindings/Provider";
import { activeFixture, fixtureOf, type Fixture } from "../hooks/useFixture";
import { providerOf } from "../hooks/useProvider";
import { hasDate, matchesDays, resolveRange } from "../lib/dates";
import { isProjectKey } from "../lib/projects";
import { scope } from "../lib/providers";
import { scanSignature, scopeDone } from "../lib/scan";
import { scanQueries } from "./queries";

/*
 * Loaders only *start* queries (TanStack Query router integration, non-blocking variant):
 * they never await, so the shell and its scanning state render immediately, exactly as
 * before, while data and the lazy route chunk load in parallel. Components read the same
 * queries with `useQuery`.
 */

const noop = () => {};

type Ctx = {
  url: URL;
  fixture: Fixture;
  range: DateRange;
  provider: Provider | null;
};
function context(request: Request): Ctx | null {
  const url = new URL(request.url),
    fixture = fixtureOf(url.searchParams);
  // The mock API reads `?estado=` from the current hash at call time; until a navigation
  // commits that may still be the previous URL, so skip prefetching across fixtures.
  if (fixture !== activeFixture()) return null;
  const from = url.searchParams.get("from"),
    to = url.searchParams.get("to");
  return {
    url,
    fixture,
    range: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
    provider: providerOf(url.searchParams),
  };
}

export function createLoaders(client: QueryClient) {
  /** The scan report, then every session keyed by the providers already scanned. */
  const everything = async (c: Ctx) => {
    const report = await client.query(scanQueries.report(c.fixture)),
      all = await client.query(sessionQueries.everything(c.fixture, scanSignature(report)));
    return { report, all };
  };
  /** Starts the dashboard's unfiltered queries; resolves with the scanned sessions, if final. */
  const prefetchDashboard = async (c: Ctx, projectKey?: string) => {
    const { report, all } = await everything(c);
    if (!scopeDone(report, c.provider)) return null;
    const closed = resolveRange(c.range, scope(all, c.provider)),
      filter = projectKey ? { projectKey } : {};
    void client.query(overviewQueries.metrics(closed, c.provider, c.fixture, filter)).catch(noop);
    void client.query(toolQueries.stats(closed, c.provider, c.fixture, filter)).catch(noop);
    return all;
  };
  return {
    shell: ({ request }: LoaderFunctionArgs) => {
      const c = context(request);
      if (c) void everything(c).catch(noop);
      return null;
    },
    /**
     * Metrics and tool stats over the closed range, once the scope's scan is final: a result
     * fetched mid-scan must never be cached under the final key.
     */
    dashboard: ({ request }: LoaderFunctionArgs) => {
      const c = context(request);
      if (c) void prefetchDashboard(c).catch(noop);
      return null;
    },
    /** Hourly activity is included as compact counts in the dashboard metrics response. */
    overview: () => null,
    /**
     * A project dashboard is Resumen scoped to the project: the same metrics and tool stats
     * with its key, plus its sessions' details (files touched, per-branch series). A pre-v2.5
     * URL holds a path instead; the page redirects it once the sessions are known.
     */
    project: ({ request, params }: LoaderFunctionArgs) => {
      const c = context(request),
        key = params.key ?? "";
      if (c && isProjectKey(key))
        void prefetchDashboard(c, key)
          .then((all) => {
            if (!all) return;
            // The same ids, in the same order, as the dashboard's details query.
            const ids = scope(all, c.provider)
              .filter(
                (s) => matchesDays(s.startedAt, c.range) && hasDate(s.startedAt) && s.projectKey === key,
              )
              .map((s) => s.id);
            if (ids.length) void client.query(projectQueries.details(key, ids)).catch(noop);
          })
          .catch(noop);
      return null;
    },
    session: ({ request, params }: LoaderFunctionArgs) => {
      const c = context(request);
      if (c) void client.query(sessionQueries.detail(params.id ?? "", c.fixture)).catch(noop);
      return null;
    },
    /** `?vista=conversacion` predates the nested tab routes; keep those links working. */
    sessionIndex: ({ request, params }: LoaderFunctionArgs) => {
      const search = new URL(request.url).searchParams;
      if (search.get("vista") !== "conversacion") return null;
      search.delete("vista");
      const target = conversationPath(params.id ?? "");
      return redirect(target + (search.size ? "?" + search : ""));
    },
  };
}
