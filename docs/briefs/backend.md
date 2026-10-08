# Brief — Backend v1 (ClaudeSource, cache, metrics, pricing, commands)

You are working in the `backend-core` worktree (branch `backend-core`) of a Tauri v2 + React app
that visualizes Claude Code sessions. Read `AGENTS.md` first. The frontend and the mockups are
being built in parallel by other agents against the same contract, so **do not change the
contract unilaterally** (see "Contract" below).

## Hard rule: READ-ONLY
The app must never create, write, rename or delete any file. Open files only with `File::open` +
`BufReader`. No `File::create`, `fs::write`, `OpenOptions`, `fs::remove_*`, `std::process::Command`
in `src-tauri/src`. No Tauri plugins. `npm run check:readonly` must pass. (Tests may write to a
`tempfile` directory — tests live in `src-tauri/tests/` or `#[cfg(test)]` modules and only touch temp dirs.)

## Goal
Implement every command in `src-tauri/src/commands.rs` for real, reading
`~/.claude/projects` (use `dirs::home_dir()`; allow override with env var `AGENT_DASHBOARD_CLAUDE_DIR`
for tests/dev).

## Contract (do not break)
- Types: `src-tauri/src/model.rs` (exported to `src/bindings/` with `npm run bindings`).
- Commands and their argument names: `list_sessions(filter)`, `get_session(id)`,
  `get_metrics(range)`, `get_tool_stats(range)`, `refresh()`. All return `Result<_, AppError>`.
- Allowed: additive changes only (new optional fields) if truly needed. Regenerate the bindings,
  commit them together, and list the change in your final report.
- Fill every field with real data and respect the doc comments in `model.rs` (sorting,
  truncation, every day present in `by_day`, etc.).

## Data format (verified on this machine — inspect real files to confirm details)
- `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` — main session.
- `~/.claude/projects/<encoded-cwd>/<sessionId>/subagents/agent-<agentId>.jsonl` — subagents
  (`isSidechain: true`, `agentId`). Attach them to their parent session; they are not separate sessions.
- One JSON event per line. Common fields: `type`, `uuid`, `parentUuid`, `timestamp`, `sessionId`,
  `cwd`, `gitBranch`, `version`.
- Relevant `type`s: `user`, `assistant`, `ai-title`. Ignore everything else (`attachment`, `mode`,
  `permission-mode`, `file-history-*`, `queue-operation`, `last-prompt`, …) with a tolerant enum
  (`#[serde(other)]`). There are many unknown types; never fail on them.
- `assistant`: `message.model`, `message.id`, `message.content[]` (blocks `text`, `thinking`,
  `tool_use {id, name, input}`), `message.usage` (`input_tokens`, `output_tokens`,
  `cache_read_input_tokens`, `cache_creation_input_tokens`, possibly a `cache_creation` object with
  `ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`).
- **Streaming repeats the same `message.id` over several lines** (one per content block). Merge the
  blocks into one `Message` and count usage **once per `message.id`** (take the last/most complete usage).
- `user`: `message.content` is either a string or an array; arrays may contain `tool_result`
  blocks (`tool_use_id`, `content` string-or-array, `is_error`). Join each result to its `tool_use`
  → `ToolCall.result` / `is_error` / `duration_ms` (result timestamp − call timestamp). A `user`
  event that only carries tool results is not a user message for `message_count`.
- Skip synthetic/meta entries (e.g. model `<synthetic>`, `isMeta: true`) when counting messages.
- Session title: last `ai-title` event. `first_prompt`: first real user text, ~200 chars.
- A corrupt/partial line (files are being written live) must be skipped, never fail the session.
- Session `id` = `sessionId` (file stem). `project_path` = `cwd` of the events (not the encoded dir name).

## Pricing (`src-tauri/src/pricing.rs`)
USD per million tokens. Match the model id by **longest prefix** (logs may carry date suffixes,
e.g. `claude-haiku-4-5-20251001`). Unknown models → cost 0 (log once, don't fail).
Cache write: 5m = 1.25 × input, 1h = 2 × input (if no 5m/1h breakdown, treat all as 5m).
Cache read: the explicit value below, otherwise 0.1 × input.

| model prefix | input | output | cache read |
|---|---|---|---|
| claude-fable-5-1, claude-fable-5, claude-mythos-5-1 | 10 | 50 | 0.25 (fable-5-1); 1.0 others |
| claude-opus-5-5 | 4 | 20 | 0.20 |
| claude-opus-5, claude-opus-4-8, claude-opus-4-7, claude-opus-4-6, claude-opus-4-5 | 5 | 25 | 0.1× |
| claude-opus-4-1, claude-opus-4-0, claude-opus-4-2025 | 15 | 75 | 0.1× |
| claude-sonnet-5-5 | 2 | 10 | 0.20 |
| claude-sonnet-5 | 2 | 10 | 0.1× |
| claude-sonnet-4-6, claude-sonnet-4-5, claude-sonnet-4-0, claude-sonnet-4-2025, claude-3-7-sonnet | 3 | 15 | 0.1× |
| claude-haiku-4-5 | 1 | 5 | 0.1× |
| claude-3-5-haiku | 0.8 | 4 | 0.1× |
| claude-3-haiku | 0.25 | 1.25 | 0.1× |

Keep the table as data (one `const` slice) so it is easy to update. Cost is computed per API
message with that message's model.

## Cache (`src-tauri/src/cache.rs`)
In-memory only. Keyed by file path; re-parse a file only if its `(mtime, size)` changed. Parse in
parallel with `rayon`. Hold it in Tauri managed state (`Mutex`/`RwLock`). `refresh` rescans the
directory (new/removed/changed files). The first command call triggers the initial scan.
Store parsed `SessionDetail`s so `get_session` doesn't re-read; summaries derive from them.

## Metrics (`src-tauri/src/metrics.rs`)
- `range` filters by session `started_at` day (local timezone, `chrono::Local`). Default range when
  both are `None`: the last 30 days ending today.
- `by_day`: every day in the range, including empty ones.
- `by_project` / `by_model`: sorted by cost desc. For `by_model`, attribute usage/cost per message
  model (a session using two models contributes to both proportionally to its messages' usage).
- `get_tool_stats`: per tool name, calls, errors, error rate, avg duration, calls per project desc;
  sorted by calls desc. Include subagent tool calls.

## Structure
`model.rs` (exists), `sources/mod.rs` (trait exists), `sources/claude.rs` (implement),
`cache.rs`, `pricing.rs`, `metrics.rs`, `commands.rs` (wire to state), `lib.rs` (`.manage(...)`).
Keep `SessionSource` provider-agnostic: Codex will be added later as another impl.

## Tests (required)
- Small, hand-written JSONL fixtures in `src-tauri/tests/fixtures/` (anonymized, a few lines
  each) covering: streaming duplicates of one `message.id` (usage counted once), tool_use ↔
  tool_result join incl. `is_error`, a subagent file, an `ai-title`, unknown event types,
  a corrupt last line, string vs array `user.content`.
- Pricing: prefix matching, date-suffixed ids, unknown model.
- Metrics: empty days present, range filtering.
- **Read-only test**: copy fixtures to a `tempfile` dir, run a full scan + load of every
  session + `refresh`, and assert every file's size, mtime and SHA-256 are unchanged and no
  file was added/removed.
- A smoke run against the real `~/.claude/projects` (ignored by default: `#[ignore]`) that
  parses all sessions without errors and prints totals.

## Done when
- `cargo test` passes (in `src-tauri`), `npm run check:readonly` passes, `npm run bindings`
  produces no diff (or the diff is your documented additive change).
- `cargo test -- --ignored` against real data parses all sessions with no errors.
- Commit on branch `backend-core` with clear messages. Do not merge into `main`; do not push.
- Final report: what you built, test results, any contract changes, known gaps.

Work autonomously; don't stop to ask unless genuinely blocked.
