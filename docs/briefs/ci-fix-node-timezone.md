# Brief — fix CI: Node version and time-zone-dependent tests

Branch `feat/frontend`. Read `AGENTS.md`. Do not touch `src-tauri/` or `src/bindings/`. The repo is public and CI
(`.github/workflows/ci.yml`, GitHub `windows-latest`, runner time zone **UTC**) fails on `main` for two reasons:

1. **Node 20 is too old**: 21 Vitest files fail to start (`webidl.util.markAsUncloneable is not a function`, jsdom/undici
   need a newer Node). Local development uses Node 24. Add `.nvmrc` (`24`), use `node-version-file: .nvmrc` in
   `ci.yml` and `release.yml`, add `"engines": { "node": ">=24" }` to `package.json`, and update the README
   requirement (Node 20+ → Node 24+).
2. **Tests depend on the machine's time zone** (the owner's machine is UTC−3, CI is UTC). Reproduced locally:
   `TZ=UTC npx vitest run src/lib/dates.test.ts` fails at line 58 (`when(...).endsWith("22:30")` in `Etc/GMT+3`)
   because `src/lib/format.ts` builds `timeFormat`/`dayFormat` once at module load, before `useTimeZone()` switches
   `process.env.TZ`. Fix it properly (e.g. formatters that follow the current zone, or tests that set the zone before
   import) without changing what the app shows. Check `src/lib/dates.ts` `TZ` and any other value captured at load.
   The 21 files that never ran in CI may hide more zone assumptions: **run the full suite with `TZ=UTC`,
   `TZ=America/New_York` and `TZ=Asia/Kathmandu`** and fix every failure (tests or code), then the normal run.

Done when `npm run check` passes in all three zones and normally, and `npm run build` passes. Small conventional
commits (git-commit skill, no Co-Authored-By). Don't merge, don't push. Report ≤ 8 lines.
