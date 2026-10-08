# Brief — v2 Step 0: contract commit

Branch `feat/backend`. Read `AGENTS.md` and `docs/design/v2-codex.md` (§3 contract, §6.1 fixtures, §6.2 Step 0, §7 decisions).

Implement **only Step 0**, exactly as specified in §3, so the backend and frontend tracks can then work in parallel:
- `src-tauri/src/model.rs`: every additive field in §3.1 (`Usage.reasoning_tokens`, `ToolCall.parent_call_id`,
  `Message.branch`, `unpriced_tokens` on SessionSummary/Subagent/Totals/DayBucket/GroupBucket,
  `Metrics.by_provider`, `ScanError.provider`, per-provider scan report `sources`) with the documented
  serde/ts attributes and doc comments.
- `src-tauri/src/commands.rs`: optional `provider` argument on `get_metrics` and `get_tool_stats` (§3.2).
  Wire it minimally: with only Claude data, `provider = codex` returns empty results; real multi-source
  work is a later step. Fill the new fields with `None`/defaults where the Claude parser has no data.
- Regenerate bindings (`npm run bindings`).
- `src/api.ts`: optional provider arg on `getMetrics`/`getToolStats`; mock fallback filters by provider.
- `scripts/gen-mock-data.mjs`: also emit Codex sessions (sub-agents incl. guardian, `exec` nesting via
  `parentCallId`, reasoning tokens, a discarded branch, one unpriced model) and `scanReport.sources`;
  regenerate `src/mocks/mock-data.json`.

Do not implement the Codex parser, pricing or the multi-source cache yet.

## Done when
`npm run check` and `npm run build` pass; small conventional commits on `feat/backend`
(e.g. `feat(contract): …`, `chore(mocks): …`, no Co-Authored-By). Don't merge into `main`, don't push.
Final report: exact fields/args added and anything that deviates from §3.
