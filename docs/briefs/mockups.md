# Brief — Mockups v1 (navigable HTML prototypes)

You are working in the `mockups` worktree (branch `mockups`) of a Tauri v2 + React app that
visualizes Claude Code sessions. Read `AGENTS.md` first. The backend is being built in parallel by
another agent; after the user approves your mockups, a frontend agent will implement them in
React. **Your mockups are the visual spec for that agent.**

## Deliverable
Navigable HTML prototypes in `docs/mockups/`, viewable by opening `docs/mockups/index.html` in a
browser (no build step, no server). Navigation between screens must work (links, hash routing or
one file per screen — your call). Use realistic data: load the shared sample data in
`src/mocks/mock-data.json` (generate a `docs/mockups/mock-data.js` from it with a small script in
`scripts/` + an npm script, so `file://` works). Do not invent a different data shape: the fields
are defined by `src/bindings/*.ts` (generated from `src-tauri/src/model.rs`).

UI copy in **Spanish (rioplatense: "vos", "hacé click")**, the user is from Argentina.

## Hard rule: READ-ONLY app
The app never writes or edits data. The UI has **no** edit, delete, rename, "open in editor" or
"resume session" actions. Allowed interactions: navigation, filters, sorting, search, date range,
expand/collapse, and a "Refrescar" (rescan) button. Make the read-only nature visible but quiet.

## Screens (all required)
1. **Resumen (overview)**: totals for the selected range (estimated cost, tokens with cache share,
   sessions, tool calls + error rate), cost per day chart, breakdown by project and by model,
   recent sessions.
2. **Sesiones**: filterable/sortable list (search, project, model, date range). Each row: title or
   first prompt, project, branch, model(s), start, duration, messages, tool calls (+errors), tokens, cost.
3. **Detalle de sesión**: the full conversation as a timeline — user prompts, assistant text,
   thinking (present but empty in logs: show it as a collapsed/quiet marker), tool calls as
   expandable rows (name, key argument, duration, ok/error, input JSON, result), subagents nested
   where they belong. Session metadata (project path, branch, CLI version, duration) and a
   cost/token breakdown (input, output, cache read, cache write).
4. **Herramientas**: ranking of tools by calls, error rate, average duration, calls per project.
5. States: empty (no sessions found in `~/.claude/projects`), loading/scanning, and an error state
   (e.g. a session file that could not be read). These can be small variants on a separate page.

Desktop is the main target (window ~1360×860, min 960×600), but layouts should not break
at narrower widths. Support light and dark themes (`prefers-color-scheme`).

## Design
You own the visual direction: palette, typography, layout, charts. It's a developer tool used
daily: dense but calm, scannable, numbers aligned (tabular figures), clear hierarchy. Avoid generic
"AI dashboard" looks (purple gradients, glassmorphism, emoji icons, everything in rounded cards).
Charts: one axis per chart, thin marks, hover tooltips, legends when there are ≥2 series, colorblind-safe
categorical colors, status colors (ok/error) reserved and paired with icon or text.
Fonts: Google Fonts are fine. No external images.

Keep it implementable in React + Tailwind v4 + Recharts (the frontend stack). Define the design
tokens (colors, type scale, spacing, radii) in one place and document them in
`docs/mockups/README.md` together with a short description of each screen and its components, so
the frontend agent can translate them directly.

## Scope limits
- Only touch `docs/mockups/`, `scripts/` (data script) and `package.json` (one npm script).
- Do not modify `src/`, `src-tauri/`, or the contract.

## Done when
- All screens and states exist, navigation works, charts have tooltips, both themes look right.
- You checked it in a real browser render (screenshots or a headless browser if available).
- Committed on branch `mockups` with clear messages. Do not merge into `main`; do not push.
- Final report: what you built, design decisions in a few lines, anything you'd want the user to decide.

Work autonomously; don't stop to ask unless genuinely blocked.
