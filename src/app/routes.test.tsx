/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { describe, expect, it, vi } from "vitest";
import { refresh } from "../api";
import { mock } from "../test/fixtures";
import { createQueryClient } from "./queries";
import { createRoutes } from "./routes";

// Outside Tauri the API serves the mock fixture; a native call would be a bug.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => false,
  invoke: () => {
    throw Error("unexpected native call");
  },
}));

function renderRoute(path: string) {
  const client = createQueryClient(),
    router = createMemoryRouter(createRoutes(client), {
      initialEntries: [path],
    });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const session = mock.sessions.find((s) => s.subagentCount > 0)!;
const project = encodeURIComponent(session.projectKey);
const find = (text: string | RegExp) =>
  screen.findAllByText(text, undefined, { timeout: 20_000 });

// The first render pays for loading Recharts and the fixture.
describe("routes render with mock data", { timeout: 30_000 }, () => {
  it("Resumen", async () => {
    renderRoute("/resumen");
    await find("Costo estimado");
    expect(screen.getByText("Sesiones recientes")).toBeTruthy();
    expect(screen.getAllByText("Resumen").length).toBeGreaterThan(0);
  });

  it("the index route is Resumen", async () => {
    renderRoute("/");
    await find("Costo estimado");
  });

  it("Sesiones with URL filters", async () => {
    renderRoute("/sesiones?q=zzzz-no-match");
    await find("Ninguna sesión coincide con los filtros.");
    expect(screen.getAllByText("Limpiar filtros").length).toBe(2);
  });

  it("Sesiones filtered by a model family", async () => {
    renderRoute("/sesiones?modelo=familia:opus");
    await find("Limpiar filtros");
    const select = screen.getByLabelText("Modelo") as HTMLSelectElement;
    expect(select.value).toBe("familia:opus");
    expect(select.selectedOptions[0].textContent).toBe("Opus (todas)");
    // Family options head their group: every family with data is selectable.
    expect([...select.querySelectorAll("optgroup > option:first-child")].length).toBeGreaterThan(1);
  });

  it("Proyectos", async () => {
    renderRoute("/proyectos");
    await find(/\d+ proyectos ·/);
  });

  it("Proyecto", async () => {
    renderRoute("/proyecto/" + project);
    await find(/Primera sesión/);
    await find("Sesiones del proyecto");
  });

  it("a pre-v2.5 project URL (a path) redirects to its project, keeping the query", async () => {
    const router = renderRoute("/proyecto/" + encodeURIComponent(session.projectPath) + "?from=2000-01-01");
    await find(/Primera sesión/);
    expect(router.state.location.pathname).toBe("/proyecto/" + project);
    expect(router.state.location.search).toBe("?from=2000-01-01");
  });

  it("Herramientas", async () => {
    renderRoute("/herramientas?tool=Read");
    await find("Ranking de herramientas");
    await find(/sesiones en el rango\./);
  });

  it("Sesión › Resumen", async () => {
    renderRoute("/sesion/" + session.id);
    await find("Por respuesta");
    expect(screen.getByText("Detalle de sesión")).toBeTruthy();
  });

  it("Sesión › Conversación via the legacy ?vista= URL", async () => {
    const router = renderRoute(
      "/sesion/" + session.id + "?vista=conversacion",
    );
    await find("Siguiente error");
    expect(router.state.location.pathname).toBe(
      "/sesion/" + session.id + "/conversacion",
    );
  });

  it("missing session", async () => {
    renderRoute("/sesion/no-existe");
    await find("No encontramos esta sesión");
  });

  it("a failed scan stops the scanning indicator", async () => {
    // The mock API reads the fixture from the real location hash at call time.
    window.location.hash = "#/resumen?estado=error";
    try {
      renderRoute("/resumen?estado=error");
      await find("No pudimos leer los archivos");
      expect(await screen.findByText("Error al escanear")).toBeTruthy();
      expect(screen.queryByText(/Escaneando/)).toBeNull();
      expect(screen.queryByLabelText("Escaneo en curso")).toBeNull();
    } finally {
      window.location.hash = "";
    }
  });

  it("unknown page", async () => {
    renderRoute("/no-existe");
    await find("No encontramos esta página");
  });
});

describe("first scan", { timeout: 30_000 }, () => {
  // `?estado=escaneo`: Claude finishes at 0.9 s, Codex at 2.6 s (see api.ts).
  const scanning = async (path: string) => {
    window.location.hash = "#" + path;
    await refresh(); // restarts the mock scan
    renderRoute(path);
  };

  it("shows the final shell at once and skeletons until every source is scanned", async () => {
    try {
      await scanning("/resumen?estado=escaneo");
      const control = await screen.findByRole("group", { name: "Proveedor" }, { timeout: 5000 });
      expect(control.textContent).toContain("Codex");
      expect(screen.getAllByLabelText(/cargando/).length).toBeGreaterThan(3);
      expect(screen.queryByText("Costo estimado")).toBeNull();
      await find("Costo estimado");
      expect(screen.queryAllByLabelText(/cargando/)).toHaveLength(0);
      expect(screen.getByRole("link", { name: /Sesiones/ }).textContent).toContain(
        String(mock.sessions.length),
      );
    } finally {
      window.location.hash = "";
    }
  });

  it("a provider whose scan finished shows its data while the other still scans", async () => {
    try {
      await scanning("/resumen?estado=escaneo&proveedor=claude");
      await find("Costo estimado");
      expect(screen.getByText(/Escaneando/)).toBeTruthy();
    } finally {
      window.location.hash = "";
    }
  });
});

describe("providers", { timeout: 30_000 }, () => {
  it("filters every screen with the top bar control and recolors it", async () => {
    renderRoute("/resumen?proveedor=codex");
    await find("Costo estimado");
    expect(screen.getByRole("button", { name: "Codex" }).getAttribute("aria-pressed")).toBe("true");
    expect(document.documentElement.dataset.provider).toBe("codex");
  });

  it("splits Herramientas by provider when both are selected", async () => {
    renderRoute("/herramientas");
    await screen.findByRole("region", { name: "Codex" }, { timeout: 20_000 });
    expect(screen.getByRole("region", { name: "Claude" })).toBeTruthy();
    // Both providers together use the neutral app color, not Claude's.
    expect(document.documentElement.dataset.provider).toBe("all");
  });

  it("hides the control and names the missing source with one provider", async () => {
    window.location.hash = "#/resumen?estado=solo-claude";
    try {
      renderRoute("/resumen?estado=solo-claude");
      await find("Costo estimado");
      expect(screen.queryByRole("group", { name: "Proveedor" })).toBeNull();
      // One line per Codex home (contract v2.5).
      expect(screen.getAllByText(/Codex: no encontrado en/)).toHaveLength(2);
      expect(document.documentElement.dataset.provider).toBe("claude");
    } finally {
      window.location.hash = "";
    }
  });
});
