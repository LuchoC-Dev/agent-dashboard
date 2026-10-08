import { queryOptions } from "@tanstack/react-query";
import { getSession } from "../../api";
import type { SessionDetail } from "../../bindings/SessionDetail";

export const projectQueries = {
  all: () => ["projects"] as const,
  /** Full details of a project's sessions in range, read four files at a time. */
  details: (key: string, ids: string[]) =>
    queryOptions({
      queryKey: [...projectQueries.all(), "details", key, ids],
      queryFn: async () => {
        const result: SessionDetail[] = [];
        for (let i = 0; i < ids.length; i += 4)
          result.push(...(await Promise.all(ids.slice(i, i + 4).map(getSession))));
        return result;
      },
    }),
};
