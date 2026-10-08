import { queryOptions } from "@tanstack/react-query";
import { getMetrics } from "../../api";
import type { DateRange } from "../../bindings/DateRange";
import type { Provider } from "../../bindings/Provider";
import type { Fixture } from "../../hooks/useFixture";
import { kindArg, type MetricFilter } from "../../lib/filters";

export const overviewQueries = {
  all: () => ["metrics"] as const,
  /** Always called with a closed range: the command defaults an open one to 30 days. */
  metrics: (
    range: DateRange,
    provider: Provider | null,
    fixture: Fixture,
    {
      projectKey = null,
      model = null,
      models = null,
      weekday = null,
      hour = null,
      tokenKind = null,
      tool = null,
    }: MetricFilter = {},
  ) =>
    queryOptions({
      queryKey: [
        ...overviewQueries.all(),
        range,
        provider,
        fixture,
        projectKey,
        model,
        models,
        weekday,
        hour,
        tokenKind,
        tool,
      ],
      queryFn: () =>
        getMetrics(
          range,
          provider ?? undefined,
          undefined,
          model ?? undefined,
          weekday ?? undefined,
          hour ?? undefined,
          tokenKind ? kindArg(tokenKind) : undefined,
          projectKey ?? undefined,
          models ?? undefined,
          tool ? { tool } : undefined,
        ),
    }),
};
