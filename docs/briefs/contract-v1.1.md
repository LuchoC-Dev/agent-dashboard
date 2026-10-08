# Contract v1.1 — additions requested by the approved mockups

Owner of the change: **backend agent** (branch `backend-core`). The frontend/integration agent
consumes it. Field names below are final; implement them exactly.

## 1. Cost per token type
```rust
/// Estimated cost split by token kind, USD. The four parts add up to the matching `cost_usd`.
pub struct CostBreakdown { pub input: f64, pub output: f64, pub cache_read: f64, pub cache_write: f64 }
```
- `SessionSummary.cost_breakdown: CostBreakdown` (main session + subagents)
- `Subagent.cost_breakdown: CostBreakdown`
- `Totals.cost_breakdown: CostBreakdown`
- `GroupBucket.cost_breakdown` and `DayBucket.cost_breakdown`: same type, so charts can stack cost by kind.
- `cache_write` includes both 5m and 1h writes at their own rates.

## 2. Scan report (partial scan errors)
```rust
pub struct ScanError { pub path: String, pub message: String }
pub struct ScanReport {
    pub source_dir: String,      // e.g. C:\Users\me\.claude\projects
    pub scanned_at: String,      // RFC 3339 UTC
    pub sessions: u32,           // sessions loaded
    pub errors: Vec<ScanError>,  // files that could not be read/parsed, skipped
}
```
- `refresh()` now returns `ScanReport` (was `u32`).
- New command `get_scan_report() -> Result<ScanReport, AppError>`: the last scan's report
  (runs the initial scan if none happened yet).

## 3. Semantics pinned down
- `SessionSummary.tool_call_count` / `tool_error_count` **include subagent calls** (current backend behavior). Document it in `model.rs`.
- `SessionSummary.models` is **distinct** (no duplicates), most used first.
- `message_count` includes subagent messages (current behavior). Document it.

## 4. Mock data (`scripts/gen-mock-data.mjs` → `src/mocks/mock-data.json`)
Update the generator to follow 1–3: `costBreakdown` everywhere, a `scanReport` object (one
example error), distinct `models`, `toolCallCount` including subagents, and several model versions
per family (e.g. `claude-opus-5-5` and `claude-opus-5`, `claude-sonnet-5-5` and `claude-sonnet-4-6`)
so the family shades in the mockups show up. Update `src/api.ts` with `getScanReport()` and the new
`refresh()` return type, with the mock fallback.

## Done when
`npm run bindings` regenerated, `npm run mock:gen` regenerated, `cargo test`, `npm run check`
pass, committed on `backend-core`.
