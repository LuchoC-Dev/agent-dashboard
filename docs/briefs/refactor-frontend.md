# Brief — Frontend structure refactor

Branch `refactor/frontend-structure`. Read `AGENTS.md` first (read-only rule, commit conventions).

## Why
v1 works and the user approved how it looks, but the frontend structure is not acceptable:
- `src/App.tsx` (~550 lines) holds the router, layout, filters/state and page logic.
- Only 2 page files (`src/pages/Lists.tsx`, `src/pages/Session.tsx`) for at least 4 routes, each
  with several views; only 3 component files, `src/components/dashboard.tsx` is ~1,050 lines.
- `src/index.css` is ~2,400 lines of hand-written CSS although the stack is Tailwind v4.

Goal: a modern, idiomatic structure for **React 19 + React Router v8 + TanStack Query v5 +
Tailwind v4 + Vite**, with **no visible or behavioral change**.

## Research first
Before designing, read the **current** official docs for the installed versions (check
`package.json` / `node_modules`): React Router v8 (data routers, route modules, `lazy`,
loaders, error boundaries, which router fits a Tauri SPA), TanStack Query v5 (`queryOptions`,
query key factories, `ensureQueryData` in loaders, suspense), React 19 patterns, Tailwind v4
(`@theme`, `@utility`, `@custom-variant` for dark mode). Use web docs; if a Context7 tool is
available, use it. Write a short `docs/architecture/frontend.md` with the chosen structure and
why, citing the docs you relied on, before moving code.

## Target (adapt to what the docs recommend)
- **Routing**: a data router defined in its own module; one route module per route and per view
  (Resumen, Sesiones, Proyectos, Proyecto detalle, Sesión detalle with its tabs as nested
  routes, Herramientas, not-found). Layout route for the app shell. Route-level `lazy` loading,
  loaders that prefetch with TanStack Query, and an error boundary per route.
- **Data**: `src/api.ts` stays the only backend entry point; add query option factories /
  key factories per feature (`features/<x>/queries.ts`). URL search params are the source of
  truth for filters and date range (no global ad-hoc state in `App.tsx`).
- **Folders**: feature-based (`src/features/{overview,sessions,projects,tools}/` with their
  components, hooks and queries), shared `src/components/ui/`, `src/lib/` (format, dates,
  colors, aggregations from `data.ts`), `src/routes/` or `src/app/` for router and shell.
  Small, single-purpose components; no file over ~250 lines unless justified.
- **Styles**: design tokens in Tailwind v4 `@theme` (from the approved `docs/mockups/tokens.css`);
  move component styles to Tailwind utilities (or small `@utility`/component classes where
  utilities hurt readability); delete dead CSS. Light/dark must stay identical.
- **Tests**: add Vitest + Testing Library for pure logic (`lib/`) and a few route-level smoke
  tests; port or keep `scripts/test-frontend.mjs` regressions (timezones, aggregations).

## Constraints
- **No visual or behavioral change.** Capture screenshots of every screen and state in light and
  dark (`npm run dev:mock`, plus the `?estado=` fixtures) **before** you start, and compare after.
  Real-data check with `npm run tauri dev` at the end.
- Do not change `src-tauri/`, `src/bindings/` or the contract. Keep `npm run check:readonly` green.
- Work incrementally in small commits following the `git-commit` skill (Conventional Commits,
  e.g. `refactor(router): …`, `refactor(sessions): …`, no Co-Authored-By). App must build after
  each commit.

## Done when
- `npm run check`, `npm run build` and the new test suite pass.
- Before/after screenshots match for every screen/state in both themes; `npm run tauri dev` works on real data.
- `App.tsx` is a thin entry (providers + router); routes, features and UI are split as above.
- `docs/architecture/frontend.md` written; README updated if commands changed.
- Committed on `refactor/frontend-structure`. Do not merge into `main`; do not push.
- Final report: new structure (tree), what docs you followed, line counts before/after, anything you deferred.

Work autonomously; don't stop to ask unless genuinely blocked.
