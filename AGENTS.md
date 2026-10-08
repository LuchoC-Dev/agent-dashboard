# Agent Dashboard — agent guide

Desktop app (Tauri v2 + React/TS) that visualizes AI coding agent sessions.
v1 reads Claude Code sessions (`~/.claude/projects/**/*.jsonl`); v2 adds Codex (`~/.codex/sessions`).
Local only, no database: files are read live and cached in memory.

## Hard rule: READ-ONLY
The app must never create, modify, rename or delete any file — not under `~/.claude`, `~/.codex`, or anywhere else.
- Rust opens files only with `File::open` / `BufReader`. No `File::create`, `fs::write`, `OpenOptions`, `fs::remove_*`, `std::process::Command`.
- No Tauri plugins (`fs`, `shell`, `dialog`, `opener`, …). Capabilities stay at `core:default`.
- UI has no edit/delete/"open in editor" actions. Only filters, navigation and "Refresh".
- `npm run check:readonly` enforces this. It must pass before any commit.

## Layout
- `src-tauri/src/model.rs` — **the contract**. Provider-agnostic types, exported to `src/bindings/` via ts-rs.
- `src-tauri/src/sources/` — `SessionSource` trait + one impl per provider (`claude.rs`).
- `src-tauri/src/commands.rs` — Tauri commands: `list_sessions`, `get_session`, `get_metrics`, `get_tool_stats`, `refresh`.
- `src/api.ts` — the only place the UI talks to the backend. Falls back to `src/mocks/mock-data.json` outside Tauri or with `VITE_USE_MOCK=true`.
- `src/bindings/` — generated. Never edit by hand.
- Frontend: `src/app/` (data router, shell), `src/routes/` (one lazy module per route),
  `src/features/*` (components + `queries.ts`), `src/components/ui/`, `src/lib/` (pure logic),
  `src/styles/` (Tailwind tokens). See `docs/architecture/frontend.md`.

## Commands
- `npm run tauri dev` — run the app.
- `npm run dev:mock` — frontend only, in the browser, with mock data.
- `npm run bindings` — regenerate TS types after changing `model.rs` (commit them together).
- `npm run mock:gen` — regenerate mock data.
- `npm run check` — read-only guard + `tsc` + `cargo test`.
- `npm test` — Vitest: `lib/` logic, mock API, time zones, route smoke tests.

## Commits and branches
Follow the `git-commit` skill (`.agents/skills/git-commit/SKILL.md`): Conventional Commits
(`type(scope): description`, imperative, under 72 chars), one logical change per commit,
branches named `type/description` in lowercase, and **no `Co-Authored-By` trailers**.

## Contract changes
`model.rs` and the command signatures are shared by the backend and frontend tracks. Do not change them
unilaterally: if a change is needed, keep it additive (new optional fields), regenerate bindings,
and say so in your final report.
