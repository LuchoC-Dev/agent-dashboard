import { isRouteErrorResponse, useRevalidator, useRouteError } from "react-router";
import { ErrorState } from "../components/ui/states";

/**
 * Route-level error boundary for unexpected failures (a render bug, a chunk that failed to
 * load). Expected data errors keep their in-page states; this reuses the same presentation.
 */
export function RouteError() {
  const error = useRouteError(),
    revalidator = useRevalidator();
  return (
    <ErrorState
      error={
        isRouteErrorResponse(error)
          ? { message: `${error.status} ${error.statusText}` }
          : error
      }
      onRetry={() => void revalidator.revalidate()}
    />
  );
}
