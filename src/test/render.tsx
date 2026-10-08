import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { createQueryClient } from "../app/queries";
import { createRoutes } from "../app/routes";

/** The whole app (shell, route tree, fresh query cache) at `path`, on the mock API. */
export function renderApp(path: string) {
  const client = createQueryClient(),
    router = createMemoryRouter(createRoutes(client), { initialEntries: [path] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}
export type AppRouter = ReturnType<typeof renderApp>;

export const searchOf = (router: AppRouter) => new URLSearchParams(router.state.location.search);
/** The dashboard's KPI strip is on screen. */
export const dashboardReady = () =>
  screen.findAllByText("Costo estimado", undefined, { timeout: 20_000 });
export const panelOf = (title: string) =>
  screen.getByRole("heading", { name: title }).closest("section")!;
