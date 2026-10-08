# Brief — v2 B1: provider-aware pricing

Branch `feat/backend`. Read `AGENTS.md` and `docs/design/v2-codex.md` §4 and §7 (D2, D7).
Another agent works on the rest of the backend in this workspace: **only touch `src-tauri/src/pricing.rs`**
(and its tests). If you need a change elsewhere, describe it in your final report instead.

- Make pricing provider-aware as in §4.3, with the OpenAI table from §4.1 (Standard tier, short and long
  context > 272K input, cached input, cache write) next to the existing Claude table.
- Unknown/unpriced models (§7 D2): cost 0, logged once, and their tokens reported so callers can fill
  `unpriced_tokens`.
- Tests: every listed model, long-context switch at 272K, unpriced models, longest-prefix matching.

## Done when
`cargo test` passes; conventional commits on `feat/backend` (e.g. `feat(pricing): …`). Don't merge, don't push.
