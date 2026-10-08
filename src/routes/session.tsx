import { Outlet, useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useShell } from "../app/shell/context";
import { ErrorState, LoadingState } from "../components/ui/states";
import {
  SessionHeader,
  SessionTabs,
} from "../features/sessions/components/detail/SessionHeader";
import { conversationPath } from "../features/sessions/focus";
import { sessionQueries } from "../features/sessions/queries";
import type { SessionContext } from "../features/sessions/session-context";
import { useFixture } from "../hooks/useFixture";

/** Sesión (`/sesion/:id`): header and tabs; the tabs are nested routes. */
export function Component() {
  const { id = "" } = useParams(),
    { colors, refresh } = useShell(),
    navigate = useNavigate(),
    query = useQuery(sessionQueries.detail(id, useFixture()));
  if (query.isPending) return <LoadingState />;
  if (query.error)
    return (
      <ErrorState
        error={query.error}
        onRetry={() => {
          refresh();
          void query.refetch();
        }}
      />
    );
  const detail = query.data;
  return (
    <>
      <SessionHeader session={detail.summary} colors={colors} />
      <SessionTabs session={detail.summary} />
      <Outlet
        context={
          {
            detail,
            colors,
            onFocus: (f) => navigate(conversationPath(id, f)),
          } satisfies SessionContext
        }
      />
    </>
  );
}
