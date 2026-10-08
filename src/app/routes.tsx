import type { QueryClient } from "@tanstack/react-query";
import type { RouteObject } from "react-router";
import { DataGate } from "./DataGate";
import { createLoaders } from "./loaders";
import { RouteError } from "./RouteError";
import { AppShell } from "./shell/AppShell";
import type { RouteHandle } from "./shell/route-handle";

/** `lazy` loads only the screen component, so loaders start fetching in parallel. */
const screen = (load: () => Promise<{ Component: React.ComponentType }>) => ({
  Component: async () => (await load()).Component,
});
const handle = (title: string, detail = false, sections = false): RouteHandle => ({
  title,
  detail,
  sections,
});

/** The whole route tree. Every route has an error boundary inside the shell. */
export function createRoutes(client: QueryClient): RouteObject[] {
  const loaders = createLoaders(client);
  return [
    {
      id: "root",
      path: "/",
      Component: AppShell,
      loader: loaders.shell,
      ErrorBoundary: RouteError,
      HydrateFallback: () => null,
      children: [
        {
          Component: DataGate,
          loader: loaders.dashboard,
          ErrorBoundary: RouteError,
          children: [
            {
              index: true,
              loader: loaders.overview,
              handle: handle("Resumen", false, true),
              ErrorBoundary: RouteError,
              lazy: screen(() => import("../routes/overview")),
            },
            {
              path: "resumen",
              loader: loaders.overview,
              handle: handle("Resumen", false, true),
              ErrorBoundary: RouteError,
              lazy: screen(() => import("../routes/overview")),
            },
            {
              path: "sesiones",
              handle: handle("Sesiones"),
              ErrorBoundary: RouteError,
              lazy: screen(() => import("../routes/sessions")),
            },
            {
              path: "proyectos",
              handle: handle("Proyectos"),
              ErrorBoundary: RouteError,
              lazy: screen(() => import("../routes/projects")),
            },
            {
              path: "proyecto/:key",
              loader: loaders.project,
              handle: handle("Proyecto"),
              ErrorBoundary: RouteError,
              lazy: screen(() => import("../routes/project")),
            },
            {
              path: "herramientas",
              handle: handle("Herramientas"),
              ErrorBoundary: RouteError,
              lazy: screen(() => import("../routes/tools")),
            },
            {
              path: "*",
              ErrorBoundary: RouteError,
              lazy: screen(() => import("../routes/not-found")),
            },
          ],
        },
        {
          path: "sesion/:id",
          loader: loaders.session,
          handle: handle("Detalle de sesión", true),
          ErrorBoundary: RouteError,
          lazy: screen(() => import("../routes/session")),
          children: [
            {
              index: true,
              loader: loaders.sessionIndex,
              ErrorBoundary: RouteError,
              lazy: screen(() => import("../routes/session-summary")),
            },
            {
              path: "conversacion",
              ErrorBoundary: RouteError,
              lazy: screen(() => import("../routes/session-conversation")),
            },
          ],
        },
      ],
    },
  ];
}
