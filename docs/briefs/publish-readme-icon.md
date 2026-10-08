# Brief — publish: README and app icon

Branch `feat/frontend`. Read `AGENTS.md` and `docs/architecture/frontend.md`. The repo will be public on GitHub as
`LuchoC-Dev/agent-dashboard`, MIT licensed. Touch only `README.md`, `docs/images/` (new), `src-tauri/icons/` and the
icon source you add (e.g. `src-tauri/icons/icon.svg`). Do not touch other `src-tauri/` files, `.github/` (the backend
agent adds CI and a release workflow in parallel) or `src/`. Do not automate clicks on the user's desktop.

1. **README** (English) for a first-time visitor: what it is (read-only desktop dashboard for Claude Code and Codex
   sessions: costs, tokens, models, projects, tools, activity, session timelines), why read-only matters, features
   in short bullets, 2–3 screenshots, install (download the Windows installer from Releases; note the builds are
   unsigned so SmartScreen may warn), where it reads data (`~/.claude/projects`, Codex homes), build from source
   (requirements + commands), how it was built (link `AGENTS.md`, `docs/`), license. Concise; no internal process
   noise, no personal paths. Remove the stale v1-only text.
2. **Screenshots**: capture with headless Chrome/Edge from `npm run dev:mock` (mock data is anonymized): Resumen
   (light), a session detail and one view in dark; ~1440 px wide, optimized PNG/WebP under ~300 KB each, in
   `docs/images/`. Check no real user data or personal path appears in them.
3. **Icon**: replace the default Tauri icons with an original, simple icon that reads at 16–32 px and fits the app
   (dashboard/agent theme, using the app accent palette). Author it as SVG and generate every size with
   `npm run tauri icon <svg>` (or the Tauri CLI equivalent). Show it in the README header.

`npm run check` and `npm run build` must pass. Small conventional commits (git-commit skill, no Co-Authored-By).
Don't merge, don't push. Report ≤ 10 lines.
