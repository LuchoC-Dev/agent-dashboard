import { queryOptions } from "@tanstack/react-query";
import { getToolStats } from "../../api";
import type { DateRange } from "../../bindings/DateRange";
import type { Provider } from "../../bindings/Provider";
import type { Fixture } from "../../hooks/useFixture";
import type { MetricFilter } from "../../lib/filters";

export const toolQueries = {
  all: () => ["tools"] as const,
  stats: (
    range: DateRange,
    provider: Provider | null,
    fixture: Fixture,
    {
      projectKey = null,
      model = null,
      models = null,
      weekday = null,
      hour = null,
      tool = null,
    }: MetricFilter = {},
  ) =>
    queryOptions({
      queryKey: [
        ...toolQueries.all(),
        range,
        provider,
        fixture,
        projectKey,
        model,
        models,
        weekday,
        hour,
        tool,
      ],
      queryFn: () =>
        getToolStats(
          range,
          provider ?? undefined,
          undefined,
          model ?? undefined,
          weekday ?? undefined,
          hour ?? undefined,
          projectKey ?? undefined,
          models ?? undefined,
          tool ? { tool } : undefined,
        ),
    }),
};
