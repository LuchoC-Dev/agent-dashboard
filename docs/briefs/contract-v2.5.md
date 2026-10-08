# Contract v2.5 — git-based projects, both Codex homes, multi-model filter

Owner: **backend agent** (`feat/backend`). Consumer: frontend agent. Additive; names are final.

## 1. Projects grouped by git (user decision: git only, never by name)
- `SessionSummary.project_key: String` — stable project id:
  - cwd inside a git repo → `git:<identity>` where identity is the normalized `remote.origin.url` if present,
    otherwise the **main** repository root (for worktrees, follow `.git` file → `gitdir:` → `commondir`).
  - no git (or no cwd) → `path:<normalized cwd>` (Windows: case-insensitive, `\` separators, no trailing slash).
  - Never merge two projects only because their names match.
- `SessionSummary.project_name` = repo name (from origin URL or main root folder); non-git = last path segment.
- `project_path` keeps the session's real cwd. New `ProjectInfo` is not needed: the UI groups by `project_key`.
- Git data is read **read-only from files** (`.git`, `.git/config`, `commondir`, `HEAD`): `File::open` only, never
  run `git` (`std::process::Command` is forbidden by the read-only guard). Cache it per directory.
- New optional filter `project_key: Option<String>` on `get_metrics`, `get_tool_stats` and `SessionFilter`
  (keep `project_path` working). `by_project`, `series_by_project` and tool `by_project` are keyed by `project_key`.

## 2. Both Codex homes
- Codex reads every existing directory among: `$CODEX_HOME`, `~/.codex`, `%APPDATA%/orca/codex-runtime-home/home`
  (deduplicated by canonical path).
- The same thread found in more than one home is one session (dedupe by thread id; keep the most complete copy:
  more lines / newer mtime). Report how many duplicates were merged.
- `ScanReport.sources`: one `SourceScan` per directory (provider repeated). `SessionSummary.source_dir?: String`
  = home the session was read from.

## 3. Multi-model filter (family click-to-filter)
- New optional `models: Option<Vec<String>>` on `get_metrics`, `get_tool_stats` and `SessionFilter`: messages of
  **any** of these models (per-message attribution, same semantics as `model`). The UI sends all versions of a family.

## Budget and tests
< 50 ms per metrics call in release; tests with fixtures for: worktree → same project as main repo, two clones with
the same origin → one project, two different repos with the same folder name → two projects, non-git folder, Codex
thread duplicated across homes, `models` filter. Regenerate bindings + mock; update `src/api.ts`.
