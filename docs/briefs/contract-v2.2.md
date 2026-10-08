# Contract v2.2 — cross-filtering and per-source scan state

Owner: **backend agent** (`feat/backend`). Consumer: frontend agent (`feat/frontend`). All additive;
names below are final.

## 1. Filters on metric commands
`get_metrics(range?, provider?, project_path?, model?)` and `get_tool_stats(range?, provider?, project_path?, model?)`:
- `project_path: Option<String>` — exact match on `SessionSummary.project_path`.
- `model: Option<String>` — keep only usage/cost/messages produced by that model (per-message attribution,
  like `by_model`), and sessions that used it. `codex-auto-review` is a valid value but never listed as a model.
- A single day is `range = { from: day, to: day }`.
- All filters combine (AND). With no new args, results are identical to today.
- The hourly activity (`HourlyActivity` in `Metrics`) honors the same filters.

## 2. Per-source scan state
`SourceScan.scanning?: boolean` — `true` while that provider is still being scanned. `ScanReport.scanning`
stays as the global flag. The UI shows the final shell immediately and per-section loading until every
source reports `scanning = false`.

## 3. Performance budget (real corpus: ~42 Claude + ~260 Codex sessions)
- Any `get_metrics` / `get_tool_stats` call with any filter combination: < 50 ms after the first scan, release build.
- Payloads stay compact (no per-message data in metrics). Measure and report sizes.

## 4. Mock + API
`src/api.ts`: add the optional `projectPath` and `model` args to `getMetrics`/`getToolStats`; the mock fallback
applies them. Regenerate bindings and mock data.
