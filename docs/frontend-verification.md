# Frontend v1 + integration verification

Completed on branch `frontend`; no merge into `main` and no push.

## Implemented

- React Router routes for Resumen, Sesiones, Proyectos, Proyecto, Detalle de sesión and Herramientas.
- TanStack Query through `src/api.ts`, global date presets/custom dates and range-preserving URL drilldowns.
- Mockup tokens in Tailwind v4, provider-derived semantic colors, light/dark/system themes and local IBM Plex fonts.
- Metric/group selectors, stacked Recharts daily/per-answer charts, Argentina hour heatmap, project sparklines,
  model families/versions, files touched, sortable tables, tool/project breakdowns and duration histogram.
- Conversation pagination, thinking markers, grouped tool calls, JSON inputs/results, idle gaps, error deep links,
  and subagents attached by `parentToolCallId` or placed by recorded start time.
- Initial loading, empty directory, no results, I/O errors, session/project/page not-found and partial scan warnings.
- Backend v1.1 integrated from `backend-core` (`f05cb9f`): generated cost breakdown and scan report types.

## Checks

`npm run bindings`, `npm run mock:gen`, `npm run check`, `npm run test:frontend` (now `npm test`,
see `docs/architecture/frontend.md`) and `npm run build`.
The ignored real-data Rust smoke test also passed.

`npm run tauri dev` was tested through its actual WebView2 page, using the real Tauri commands:
35 sessions loaded, 9,619 messages and 11,955 calls. Of these, 33 sessions have timestamps;
the remaining two have no date and zero usage. List costs, dated metrics and tool counts agree
with the backend. The largest session has 891 messages; the conversation renders 40 at once,
paginates and opens error deep links. Real subagent navigation, every screen, missing sessions,
Refrescar and the 960 px minimum width were checked without runtime exceptions.

Browser/mock checks covered light/dark colors, partial scan paths, folder I/O error, empty directory,
initial loading, no results/clear filters, not-found recovery, preserved model/date filters, subagent
deep links and a 5,000-message fixture held only in browser memory. The last-message link opened
its correct page with at most 40 rendered messages. No document-level horizontal overflow.

Screenshots of the mockup, mock React app and native light/dark screens were inspected locally in
`.qa/` (ignored; real session screenshots are intentionally not included in the repository).

## Integration fixes and differences from the prototype

- `Todo` is sent to the metric commands as an explicit range, since their empty-range default is 30 days.
  Invalid/absent timestamps cannot narrow it to today or crash date formatting. Undated sessions are labeled.
- Backend filters, metric/tool buckets, mock aggregations and displayed dates use the machine's local timezone;
  an injected UTC−3 offset regression assigns `2026-10-06T01:30Z` to October 5 consistently.
  The hour heatmap follows local time, including fractional offsets and daylight-saving transitions.
  No model fields or command signatures were changed by
  the frontend beyond consuming the additive contract authored on `backend-core`.
- Scan progress is indeterminate: the contract returns the completed report, not streamed file counters.
  The app does not invent “412 of 1,204” values. Refresh retains and dims the visible content.
- Long tables/conversations are paginated instead of rendering every row/event as the static prototype does.
- The KPI strip also adapts to its available container width so large real-world values remain readable.
- Global model costs come from the backend. Project model attribution uses recorded main/subagent cost splits;
  when several models occur within the same main session or subagent, each token-kind cost is apportioned by
  that model's recorded usage because `SessionDetail` does not expose per-message monetary costs.
- Mock totals differ from the older prototype because v1.1 includes subagent calls/messages and revised sample
  prices/model versions. These are data changes, not hardcoded visual totals.

The read-only guard passes; no Tauri plugins, extra capabilities or file-changing actions were added.
