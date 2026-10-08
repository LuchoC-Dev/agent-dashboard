# Contract v2.3 — precomputed daily series and weekday/hour filter

Owner: **backend agent** (`feat/backend`). Consumer: frontend agent. All additive; names are final.

## 1. Precomputed daily series (replaces client-side computation of the trend)
```rust
pub struct DayPoint {
    pub date: String,        // YYYY-MM-DD, local day
    pub cost_usd: f64,
    #[ts(type = "number")] pub tokens: u64,
    #[ts(type = "number")] pub active_ms: u64,
    pub sessions: u32,
    pub tool_calls: u32,
    pub messages: u32,
}
pub struct DailySeries {
    pub key: String,         // provider id, model id or project path
    pub label: String,
    pub points: Vec<DayPoint>, // only days with data, sorted by date
}
// in Metrics:
pub series_by_provider: Option<Vec<DailySeries>>,
pub series_by_model: Option<Vec<DailySeries>>,
pub series_by_project: Option<Vec<DailySeries>>,
```
- **Per-message attribution** for models: cost, tokens, messages and tool calls go to the model that produced
  each message; `sessions` counts a session under every model it used that day; `active_ms` goes to the
  session's main model. `codex-auto-review` is never a model series: its usage goes to a series with
  key `"auto-review"`, label `"Revisiones automáticas"`.
- Every series honors all filters of the call (range, provider, project, model, weekday/hour). With a model
  filter, `series_by_model` contains only that model and every other series counts only that model's messages.
- Sorted by total cost desc. Compact JSON; report payload sizes.

## 2. Weekday/hour filter
Optional `weekday: Option<u8>` (0 = Monday … 6 = Sunday, local time) and `hour: Option<u8>` (0–23, local)
on `get_metrics`, `get_tool_stats` and `list_sessions` (in `SessionFilter`). They select **messages** whose
local timestamp falls in that slot (usage/cost attributed per message) and sessions with at least one message
there. Either can be used alone (whole weekday, or that hour on every day).

## 3. Budget
Every `get_metrics` call (any filter combination, including series) < 50 ms after the first scan, release build.

## 4. Mock + API
`src/api.ts`: optional `weekday`/`hour` args, mock computes the series and applies the filter. Regenerate bindings and mocks.
