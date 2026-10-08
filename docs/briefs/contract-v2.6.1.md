# Contract v2.6.1 — per-session counts for the filtered tool

Owner: **backend agent** (`feat/backend`). Consumer: frontend agent. Additive; names are final.

```rust
// SessionSummary
/// Calls to the tool in `SessionFilter.tool` (main session plus subagents, nested included).
/// Present only when `list_sessions` was called with a `tool`; absent otherwise.
#[serde(default, skip_serializing_if = "Option::is_none")]
#[ts(optional)]
pub filtered_tool_calls: Option<u32>,
/// Errors among those calls. Same presence rule.
#[serde(default, skip_serializing_if = "Option::is_none")]
#[ts(optional)]
pub filtered_tool_errors: Option<u32>,
```
- Counted over the same messages the v2.6 tool scope uses (range, model/models, weekday, hour applied), so the sum
  over the listed sessions equals `get_metrics(..., tool).totals.tool_calls` / `tool_errors` for the same filters.
- `tool_call_count` / `tool_error_count` keep their meaning (every tool). `get_session` is unchanged.
- No `tool` → both absent, payload identical to today. Mock in `src/api.ts` implements the same; bindings regenerated.
- Tests: sums match metrics totals (combined with model/models, project, weekday/hour), nested/subagent calls,
  absent without tool. < 50 ms per call (release, real data).
