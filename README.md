# Agent Dashboard

Read-only desktop dashboard for AI coding agent sessions. v1 supports Claude Code; Codex is next.

Built with Tauri v2 (Rust) and React + TypeScript. It reads session logs from `~/.claude/projects`
on your machine and never writes to them.

## Requirements
- Rust (stable, MSVC toolchain on Windows) and Visual Studio Build Tools with C++
- Node 20+
- WebView2 (preinstalled on Windows 11)

## Run
```sh
npm install
npm run tauri dev     # desktop app
npm run dev:mock      # UI only, in the browser, with sample data
npm run check         # read-only guard, typecheck, Rust tests
npm test              # Vitest: lib, mock API, time zones and route smoke tests
npm run build         # production frontend
```

See [AGENTS.md](AGENTS.md) for architecture and conventions, and
[docs/architecture/frontend.md](docs/architecture/frontend.md) for the frontend structure
(data router, feature folders, query factories, Tailwind tokens).

## Screens and navigation

Resumen shows selectable metrics, daily trends, hourly activity, projects, models and recent
sessions. Sesiones supports URL search/project/model/date filters and sorting. Proyectos opens
a dashboard scoped to a project; Herramientas shows rankings and a project matrix. Session
details have a summary and a paginated conversation with tool inputs/results, error links and
subagents attached to their recorded parent call (or positioned by time when the link is absent).
Tables show at most 50 rows and conversations 40 messages per page. Light, dark and system
themes use the approved mockup tokens; IBM Plex fonts are bundled locally.

The only data action is **Refrescar**, which rescans the logs into memory. There are no filesystem,
shell or other Tauri plugins; capabilities remain `core:default`. The app does not write logs,
launch tools, resume agents or offer file editing. Scan errors show the skipped paths and messages.
Date filters, daily charts, the hour heatmap and displayed timestamps use the machine's local timezone
(UTC−3 in Argentina). Sessions without a timestamp remain visible with **Todo**, labeled “Sin fecha”,
and are excluded from dated metrics. “Tiempo activo” sums recorded session spans, including pauses.

In browser/mock mode, state fixtures can be reviewed at `/#/resumen?estado=vacio`,
`estado=cargando` or `estado=error`; `/#/sesion/no-existe` exercises not-found. The sample scan
report includes a partial-read warning. These fixtures never change real logs and are ignored
by the native app. See [frontend verification](docs/frontend-verification.md) for the checks performed.
