# Orchestrator handoff — Agent Dashboard

You are the new **coordinator** of this project. The previous coordinator ran out of context on 2026-10-07.
You do not implement features yourself: you write briefs, launch agents in Orca, verify their work and integrate it
into `main`. Talk to the user in Spanish (rioplatense, "vos"); they are the product owner and decide.

## Read first
1. `AGENTS.md` (rules every agent follows: READ-ONLY app, layout, commands, commit conventions, contract changes).
2. `docs/architecture/frontend.md`, `docs/design/v2-codex.md`, `docs/briefs/contract-v2.*.md` (contract history).
3. Your memory: `MEMORY.md` of this project (Claude Code auto-memory) and Engram (`mem_context`, `mem_search`).

## Project state (main = 6e1584d + v2.5.1 brief commits)
- Tauri v2 (Rust) + React 19/TS/Vite/Tailwind v4/TanStack Query/React Router 8. Desktop, local, **read-only**.
- Reads Claude Code (`~/.claude/projects`) and Codex (every home: `$CODEX_HOME`, `~/.codex`,
  `%APPDATA%/orca/codex-runtime-home/home`, threads deduped). Projects grouped by git only (`projectKey`).
- Versions shipped: v1 → v2 (Codex) → v2.1–v2.5 (colors, perf, cross-filtering, series, token kind, git projects).
- Checks: `npm run check` (read-only guard + tsc + Vitest + cargo test), `npm run build`, real-data smokes:
  `cd src-tauri && cargo test --test backend --test codex_smoke -- --ignored --nocapture`.

## Workspaces (Orca, repo id `2a77e4f9-b638-4a6e-9f02-a37db48b227b`)
- `main` in the main clone (outside Orca's workspaces) — only the coordinator commits/merges here.
- `backend` → branch `feat/backend`, `%USERPROFILE%\orca\workspaces\dashboard-v1\backend` (primary, never delete).
- `frontend` → branch `feat/frontend`, `%USERPROFILE%\orca\workspaces\dashboard-v1\frontend` (primary, never delete).
- Task-specific worktrees may be created and removed; related tasks share one worktree. Orca replaces `/` in worktree
  names with `-`: rename the branch afterwards to `type/description`.

## Agents in flight when you take over (v2.5.1)
| Orca tab | Workspace | Brief | Model |
|---|---|---|---|
| `v2.5.1 backend · gpt-6-luna high` (term_54bfdd27-234a-4f7c-8d29-5f2067cb62df) | backend | `docs/briefs/v2.5.1-backend.md` (strip `\\?\` path prefix at the source; Codex smoke over every home) | Codex gpt-6-luna high |
| `v2.5.1 frontend · opus-5-5 medium` (term_6aa6188a-9a88-4b68-a74b-8245a11bc9c8) | frontend | `docs/briefs/v2.5.1-frontend.md` (swappable app accent token + preset picker) | Claude Opus 5.5 medium |
Terminal handles go stale if Orca restarts: `orca terminal list --worktree path:<dir> --json`.

## How to run agents (user rules)
- Backend → always Codex `gpt-6-luna` (high; xhigh for complex work like parsers). Frontend → always Claude Opus 5.5
  medium. Other reasoning tasks → Opus medium.
- Always auto mode, prompt as CLI argument (sending to a booting TUI can be lost):
  - `orca terminal create --worktree "path:<dir>" --shell powershell.exe --title "<task> · <model>" --command '$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"; codex --model gpt-6-luna -c model_reasoning_effort="high" --approve-for-me "Lee AGENTS.md y despues docs/briefs/<brief>.md: es tu tarea completa. ..."' --json`
  - `... --command '$env:Path = ...; claude --model claude-opus-5-5 --effort medium --permission-mode auto "Lee AGENTS.md y despues docs/briefs/<brief>.md ..."'`
- New Codex worktrees ask "Trust this folder" and "Hooks need review": the user approved trusting this repo and
  "Trust all" hooks; accept them, then relaunch so the prompt and effort apply.
- Write each brief in the workspace (`docs/briefs/<version>-<track>.md`), commit it there, then launch.
- Contract changes: the coordinator writes `docs/briefs/contract-<version>.md` on `main` first, syncs both
  workspaces (`git merge --ff-only main`), then launches backend and frontend in parallel.
- Backend briefs: "touch only `src-tauri/` (+ regenerated bindings/mock)". Frontend briefs: "never edit
  `src/bindings` by hand; never touch `src-tauri/`; no click automation on the user's desktop; timebox profiling".
- Don't run long background monitors if memory is tight (the machine ran low on memory once). Prefer checking when
  the user asks ("fijate ahora").

## Verify and integrate (never skip)
1. Agent idle and branch clean; **re-check `git log main..feat/<x>` right before merging** (agents keep committing
   after their report).
2. No `Co-Authored-By` (`git log --format=%B main..feat/<x> | grep -ci co-authored` = 0); conventional subjects.
3. In the workspace: `npm run check`, `npm run build`; run the full Vitest suite more than once if a test looks flaky.
4. Backend changes: run the real-data smokes. `npm run bindings` must produce no diff.
5. Merge into `main` with `git merge --no-ff feat/<x> -m "Merge branch 'feat/<x>'"` (backend first, then frontend),
   re-run check/build on `main`, then `git merge --ff-only main` in both workspaces.
6. Many conflicts → abort and ask the owning agent to merge `main` into its branch and resolve.
7. Report to the user: what changed, what you verified yourself, deviations, pending items. Never claim a result
   you didn't check.

## User preferences (also in memory)
- Commits: git-commit skill — Conventional Commits, no `Co-Authored-By`, branches `type/description`.
- Git identity: LuchoC-Dev noreply email; never the personal email.
- UI: provider color swappable in one place; analogous variations; no gray for data; panels side by side must be
  symmetric with no empty space; no "Resto" rows in lists; every selectable element must filter; Resumen/Proyecto/
  Sesión share the same dashboard components.

## Pending after v2.5.1
- Filter limitations: token-kind with non-Total groupings sums all kinds; Herramientas loses per-day error split;
  tool filter only affects KPI + table (need additive contract fields).
- Optional: group Codex Desktop non-git folders (`Documents\Codex\<date>\<slug>`) under one label (never merge by name).
- Publishing: repo has **no remote**; create GitHub repo (user decides public/private), CI running `npm run check`,
  release (icon, version, MSI/NSIS installers), update README, delete tag `backup/pre-conventional-commits`
  (ask the user first), update static mockups or mark them historical.
