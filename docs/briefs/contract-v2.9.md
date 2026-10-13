# Contract v2.9 — per-message cost

Owner: **backend agent** (`feat/backend`). Consumer: frontend agent. Additive; names are final.

```rust
// Message (assistant messages with usage; absent otherwise)
/// Estimated USD cost of this API message, same pricing as every aggregate.
#[serde(default, skip_serializing_if = "Option::is_none")]
#[ts(optional)]
pub cost_usd: Option<f64>,
#[serde(default, skip_serializing_if = "Option::is_none")]
#[ts(optional)]
pub cost_breakdown: Option<CostBreakdown>,
/// Tokens of this message whose model has no known price. Absent means zero.
#[serde(default, skip_serializing_if = "Option::is_none")]
#[ts(optional, type = "number")]
pub unpriced_tokens: Option<u64>,
```
- Same values the aggregates already use (`MessageMetric.cost`): for every session, the sum over its messages (main +
  subagents, main history only — not discarded Codex rollback branches, exactly like the totals) equals
  `SessionSummary.cost_usd` / `cost_breakdown` / `unpriced_tokens`.
- `cost_usd` = sum of `cost_breakdown` parts. User messages and assistant messages without usage: all three absent.
- Mock in `src/api.ts` + mock data implement it; bindings regenerated. `get_session` payload grows only by these fields.
