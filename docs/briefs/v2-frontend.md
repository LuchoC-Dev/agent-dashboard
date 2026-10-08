# Brief — v2 frontend: Codex support (F1–F6)

Branch `feat/frontend`. Read `AGENTS.md`, `docs/architecture/frontend.md` and `docs/design/v2-codex.md`
(§3 contract, §5 UI impact, §6.2 frontend steps, §7 decisions are final).

The contract (Step 0) is being committed on `feat/backend`. Start when `git log feat/backend` shows the
`feat(contract)` commit: run `git merge feat/backend`, then work against the mock data (it includes Codex
sessions). Merge `feat/backend` again later to test with the real backend.

Implement F1–F6 from §6.2: provider arg in `api.ts`/query keys; URL `proveedor` param + topbar segmented
control (hidden with one provider) driving `data-provider` colors; GPT model families with analogous colors;
`by_provider` KPI split, provider-colored trend, models grouped by provider; "sin precio" marker wherever
`unpricedTokens > 0`; session detail: `parentCallId` nesting, guardian toggle (D1), reasoning display,
discarded-branch groups (D4); Herramientas grouped by provider; scan notice per source. No comparison panel (D8).

Follow the existing structure (features, routes, ui, lib), keep files small, add Vitest coverage, light/dark,
≤640 px, read-only UI. Respect the approved visual language (`docs/mockups/`).

## Done when
`npm run check`, `npm run build` pass; screenshots with mock data (Claude-only, Codex-only, mixed);
conventional commits on `feat/frontend` (no Co-Authored-By). Don't merge into `main`, don't push.
