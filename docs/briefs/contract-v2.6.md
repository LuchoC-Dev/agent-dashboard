# Contract v2.6 — tool filter everywhere, per-day tool errors

Owner: **backend agent** (`feat/backend`). Consumer: frontend agent. Additive; names are final.

## 1. Per-day tool errors
```rust
// DayBucket and DayPoint
/// Tool calls that ended in error that day (main session plus subagents). Absent means zero.
#[serde(default, skip_serializing_if = "Option::is_none")]
#[ts(optional)]
pub tool_errors: Option<u32>,
```
- Same attribution as the existing `tool_calls` of that bucket/point (same day, same group), so
  `tool_errors <= tool_calls` always holds. The backend always fills it (`Some(0)` is allowed).

## 2. Tool filter
- New optional arg `tool: Option<String>` on `get_metrics` and `get_tool_stats`; new field `tool: Option<String>` on
  `SessionFilter` (`list_sessions`). `api.ts`: `getMetrics(..., { tool })`, `getToolStats(..., { tool })`,
  `listSessions({ ..., tool })`, following the existing argument style.
- Match: exact, case-sensitive on `ToolCall.name` / `ToolStat.name`, nested calls and subagents included.
- **Session scope**: a session is in scope when at least one call to that tool is among the messages already selected
  by the other filters (range, provider, project, model/models, weekday, hour). Everything is then computed over those
  sessions exactly as today: sessions, messages, tokens, cost, active time, hourly activity, `by_project`, `by_model`,
  `by_provider`, every `series_by_*`; token kind still applies on top.
- **Tool figures count only that tool**: `totals.tool_calls`/`tool_errors`, `by_day[].tool_calls`/`tool_errors`,
  every `DayPoint.tool_calls`/`tool_errors`.
- `get_tool_stats` with `tool`: only that tool's row (or empty), with `by_project` over the same scope.
- Unknown tool → empty/zero results, not an error. Without `tool`, results are identical to today.

## Tests and limits
Rust tests for: errors per day/group summing to totals, tool scope combined with model/models, project,
weekday/hour and token kind, unknown tool, nested/subagent calls. Bindings and mock regenerated; the mock in
`src/api.ts` implements the same semantics. < 50 ms per call (release, real data).
