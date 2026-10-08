# Brief — v2 design: Codex sessions

Branch `feat/backend`. Read `AGENTS.md`, `docs/architecture/frontend.md` and `src-tauri/src/model.rs` first.
**This is research and design only: write documents, not production code.** Another agent is editing
`src-tauri/src/sources/claude.rs` and `package.json` in this workspace; don't touch them.

## Research (read-only)
- Survey the real Codex session files on this machine: `~/.codex/sessions/**` (and
  `~/.codex/archived_sessions/**` if relevant). Document file layout, line/event types, how
  messages, reasoning, tool calls/results, token usage, model, cwd/project, git info, timestamps and
  sub-agents are represented. Note version differences between files.
- **Never open `~/.codex/auth.json`, `config.toml` secrets, caches or anything credential-like.**
  Only session logs. Quote at most short, anonymized snippets.
- Find how Codex reports token usage (per turn vs cumulative) and how to avoid double counting.
- Pricing: list the OpenAI models seen in the sessions (e.g. `gpt-6-luna`, `gpt-6.1-sol`) and their
  per-token prices from official sources. If a price can't be confirmed, mark it TBD; never invent it.

## Deliverable: `docs/design/v2-codex.md`
1. Codex log format (with a field mapping table to our `model.rs` types).
2. `CodexSource` design: discovery, parsing, dedupe, sub-agents, errors → `ScanReport`, caching.
3. Contract changes: keep them additive; specify exact Rust/TS fields and command changes
   (e.g. multi-source `AppState`, provider filter, per-provider scan report).
4. Pricing table + how `pricing.rs` should become provider-aware.
5. UI impact: provider filter, provider colors (tokens already exist), comparisons between
   providers, what each screen shows when only one provider has data.
6. Test plan with anonymized fixtures, and a step-by-step implementation plan split into
   backend tasks and frontend tasks that can run in parallel, with risks and open questions for the user.

## Done when
`docs/design/v2-codex.md` committed on `feat/backend` (conventional commit, e.g.
`docs(design): add v2 codex sessions design`), no other files changed. Don't merge, don't push.
Final report: summary of the format, proposed contract changes, and open questions.
