# Brief — review Dependabot PR #3: TypeScript 6.0.3 → 7.0.2

Branch `feat/frontend`. Read `AGENTS.md`. Do not touch `src-tauri/` or `src/bindings/` by hand.
Dependabot opened PR #3 on `LuchoC-Dev/agent-dashboard` (branch `dependabot/npm_and_yarn/typescript-7.0.2`); its CI
passes, but it is a major version. Decide whether it is safe to merge, and make it safe if needed.

1. Read the TypeScript 7.0 release notes / breaking changes (web search is fine) and list the ones that could affect
   this repo: `tsconfig.json`/`tsconfig.node.json` options (deprecated or changed defaults), module resolution,
   `lib`/DOM types, JSX, emitted checks, and compatibility of the toolchain that consumes TS here (Vite 8,
   `@vitejs/plugin-react`, Vitest 5, `@types/*`, ts-rs generated bindings, editor/`tsc` scripts).
2. `git fetch origin dependabot/npm_and_yarn/typescript-7.0.2` and merge it into `feat/frontend` (keep the
   Dependabot commit so GitHub closes the PR when it lands on `main`). Run `npm ci`, `npm run check`, `npm run build`,
   and the full suite also with `TZ=UTC`. Check `tsc` still type-checks everything it did (no files silently dropped,
   no options ignored with a warning) and that strictness did not weaken.
3. If something needs adjusting (tsconfig, types, code), fix it in small conventional commits. If TS 7 is not safe
   yet (e.g. a dependency doesn't support it), don't merge it: revert to the PR-free state and explain why.

Small conventional commits (git-commit skill, no Co-Authored-By). Don't merge into `main`, don't push. Report ≤ 10
lines: verdict (merge / don't merge), breaking changes that apply, what you changed, checks run.
