import { keepPreviousData, queryOptions } from "@tanstack/react-query";
import { getSession, listSessions } from "../../api";
import type { DateRange } from "../../bindings/DateRange";
import type { Provider } from "../../bindings/Provider";
import type { Fixture } from "../../hooks/useFixture";
import type { MessageFilter } from "../../lib/series";

export const sessionQueries = {
  all: () => ["sessions"] as const,
  /** `list({}, null, fixture)` is the whole dataset: providers, colors and range bounds. */
  list: (range: DateRange, provider: Provider | null, fixture: Fixture) =>
    queryOptions({
      queryKey: [...sessionQueries.all(), "list", range, provider, fixture],
      queryFn: () => listSessions(provider ? { ...range, provider } : range),
    }),
  /**
   * The whole dataset, keyed by the providers whose scan has finished (`scanSignature`): when
   * one finishes, the list is fetched again rather than trusting the partial one.
   */
  everything: (fixture: Fixture, scanned: string | null) =>
    queryOptions({
      queryKey: [...sessionQueries.all(), "list", {}, null, fixture, scanned],
      queryFn: () => listSessions({}),
      enabled: scanned !== null,
      placeholderData: keepPreviousData,
    }),
  /**
   * Sessions with a message in a local weekday/hour slot (contract v2.3) and/or a call to a
   * tool among the slot's messages (contract v2.6); under a tool each one also counts its calls
   * to it among the messages of the slot and the model or family (contract v2.6.1).
   */
  slot: (
    range: DateRange,
    provider: Provider | null,
    fixture: Fixture,
    {
      weekday = null,
      hour = null,
      projectKey = null,
      tool = null,
      model = null,
      models = null,
    }: MessageFilter & { projectKey?: string | null; tool?: string | null },
  ) =>
    queryOptions({
      queryKey: [...sessionQueries.all(), "slot", range, provider, fixture, projectKey, weekday, hour, tool, model, models],
      queryFn: () =>
        listSessions({
          ...range,
          ...(provider ? { provider } : {}),
          ...(projectKey ? { projectKey } : {}),
          ...(weekday != null ? { weekday } : {}),
          ...(hour != null ? { hour } : {}),
          ...(tool ? { tool } : {}),
          ...(model ? { model } : {}),
          ...(models ? { models } : {}),
        }),
    }),
  detail: (id: string, fixture: Fixture) =>
    queryOptions({
      queryKey: [...sessionQueries.all(), "detail", id, fixture],
      queryFn: () => getSession(id),
    }),
};
