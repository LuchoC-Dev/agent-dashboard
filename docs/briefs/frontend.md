# Brief — Frontend v1 + integration

You work in the `frontend` worktree (branch `frontend`). Read `AGENTS.md` first. You own two
things: **(A)** the React frontend and **(B)** integrating it with the real backend so the
desktop app works end to end.

## Inputs
- **Visual spec (approved by the user):** `docs/mockups/` — open `docs/mockups/index.html` in a
  browser; `docs/mockups/README.md` lists every screen, component and interaction;
  `docs/mockups/tokens.css` has the design tokens. Match the mockups closely: layout, density, copy
  (Spanish rioplatense), colors, charts and states. `docs/mockups/app.js` holds reference logic
  (aggregations, formatting, palettes) you can port.
- **Contract:** `src/bindings/*.ts` (generated from `src-tauri/src/model.rs`) and `src/api.ts`,
  the only place the UI talks to the backend (it falls back to mock data outside Tauri).
- **Contract v1.1:** `docs/briefs/contract-v1.1.md` (cost per token type, scan report). The
  backend agent is implementing it right now on branch `backend-core`. Build those parts against
  the spec; integrate them once that branch has the commit (see B).

## Hard rule: READ-ONLY
No edit/delete/rename/"open in editor"/"resume" actions. Only navigation, filters, sorting,
search, date range, expand/collapse and "Refrescar". No Tauri plugins. `npm run check:readonly`
must pass.

## A. Frontend
- Stack already installed: React 19, TypeScript, Vite, Tailwind v4 (`@tailwindcss/vite`),
  TanStack Query, React Router, Recharts. Don't add a UI kit; small focused deps only if needed.
- Port `docs/mockups/tokens.css` into the Tailwind v4 theme (`@theme`), light + dark.
- Build every screen in `docs/mockups/README.md` (Resumen, Sesiones, Proyectos, Detalle de
  sesión, Herramientas) and the states (loading/scanning, empty, error, not found, partial scan
  warning, no results). Routing with React Router; data with TanStack Query through `src/api.ts`.
- Components never call `invoke` directly. Keep components small; follow the component list in the README.
- Performance: sessions can have thousands of messages; virtualize or paginate the conversation
  timeline and long tables.
- `npm run dev:mock` must show the full app in a browser with mock data.

## B. Integration
1. Add a `.gitattributes` (`* text=auto eol=lf`, binaries as `binary`) and renormalize, so
   generated bindings stop showing CRLF/LF noise on Windows. Commit it separately.
2. When `backend-core` has the contract v1.1 commit (check `git log backend-core`), merge it into
   `frontend` (`git merge backend-core`), regenerate bindings (`npm run bindings`) and resolve
   any type errors. Until then, keep building against the spec and mock data.
3. Run the real app: `npm run tauri dev`. Verify against real data in `~/.claude/projects`
   (35+ sessions): lists load, a large session's detail renders smoothly, metrics match the
   backend, Refrescar works, errors from the scan report surface as the banner.
4. Update `README.md` (how to run, read-only guarantee, screens) briefly.

## Done when
- `npm run check` (read-only guard + tsc + cargo test) and `npm run build` pass.
- `npm run tauri dev` works on real data; all screens and states reachable; light and dark OK.
- Screens visually match the mockups (compare side by side; take screenshots if you can).
- Committed on branch `frontend` with clear, separate commits. Do not merge into `main`; do not push.
- Final report: what you built, how you verified it, anything that deviates from the mockups and why.

Work autonomously; don't stop to ask unless genuinely blocked.
