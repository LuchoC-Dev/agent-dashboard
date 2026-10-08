# Brief — v2 B2–B6: multi-source backend + Codex parser

Branch `feat/backend`. Read `AGENTS.md` and all of `docs/design/v2-codex.md` (it is your spec; §7 decisions are final).
Another agent writes `src-tauri/src/pricing.rs` in this workspace: **don't edit it**; use its API once it lands
(check `git log`), and until then call the existing pricing functions.

Implement §6.2 backend steps in order, each in its own commits:
- **B2** `SessionSource` trait refactor + multi-source `AppState` with only `ClaudeSource` (no behavior change; tests green).
- **B3** `sources/codex.rs` discovery + grouping (`~/.codex/sessions/**` and `archived_sessions/**`, segments, sub-agent trees, `session_index.jsonl` titles).
- **B4** Codex parser: messages, reasoning, tools incl. `exec` nesting (`parentCallId`), usage rules from §1.5 (no double counting), fork replay detection, discarded branches (`Message.branch`), guardian sub-agents, errors → scan report. Anonymized fixtures per shape (§6.1).
- **B5** register `CodexSource`; provider arg in `get_metrics`/`get_tool_stats`; `by_provider`; `ScanReport.sources`.
- **B6** real-data smoke test over `~/.codex` (ignored by default): parse everything, report counts, first-scan time and memory; fix outliers (risk R2: 1.7 GB — cache summaries and load details lazily if needed).

## Hard rules
- READ-ONLY: never open `~/.codex/auth.json`, config secrets or caches; only session logs. No writes anywhere.
- Never invent prices. Keep the contract exactly as committed in Step 0 (additive changes only, documented).

## Done when
`npm run check`, `npm run build` and both real-data smoke tests (Claude and Codex) pass; conventional commits
on `feat/backend`. Don't merge, don't push. Final report: counts, timings, memory, deviations from the design.
