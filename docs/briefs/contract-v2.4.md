# Contract v2.4 — token-kind filter

Owner: **backend agent** (`feat/backend`). Consumer: frontend agent. Additive; names are final.

```rust
#[serde(rename_all = "camelCase")]
pub enum TokenKind { Input, Output, CacheRead, CacheWrite }
```
- New optional arg `token_kind: Option<TokenKind>` on `get_metrics` (and `api.ts` `getMetrics`).
- Semantics: every **token** and **cost** figure in `Metrics` counts only that kind — totals, `usage` (other kinds 0),
  `cost_usd` (= that kind's part of the cost breakdown), `cost_breakdown`, `by_day`, `by_project`, `by_model`,
  `by_provider`, and every `series_by_*` point (`tokens`, `cost_usd`). Unpriced tokens: only that kind.
- Sessions, messages, tool calls, active time and hourly activity are **not** affected by the token kind.
- Combines with all other filters. With no `token_kind`, results are identical to today.
- Tests for each kind, combined with model/project/weekday/hour; mock + bindings regenerated; < 50 ms per call.
