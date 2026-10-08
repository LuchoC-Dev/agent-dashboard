# Brief — publish: CI, dependency audit, release workflow

Branch `feat/backend`. Read `AGENTS.md`. The repo will be public on GitHub as `LuchoC-Dev/agent-dashboard` (default
branch `main`). Touch only `.github/`, `src-tauri/` (only if the audit needs a dependency bump) and `package.json` /
lockfiles if strictly needed. Do not touch `src/` or `docs/` (the frontend agent edits README and icons in parallel).

1. **CI** `.github/workflows/ci.yml`: on push to `main` and on pull requests; `windows-latest` (the app targets
   Windows); Node 20 + stable Rust with caching (npm and cargo); runs `npm ci`, `npm run check` and `npm run build`.
   Least-privilege `permissions: contents: read`; pin actions to a major version.
2. **Dependabot** `.github/dependabot.yml`: weekly updates for `npm` (/), `cargo` (/src-tauri) and `github-actions`,
   grouped minor/patch to keep PR noise low.
3. **Rust audit**: install and run `cargo audit` locally (dev tooling only); fix advisories by bumping dependencies if
   safe, otherwise report them. Add an audit job to CI (`rustsec/audit-check` or `cargo audit`), plus `npm audit
   --audit-level=high`.
4. **Release** `.github/workflows/release.yml`: on tags `v*`, build Windows MSI + NSIS installers with
   `tauri-apps/tauri-action` and attach them to a **draft** GitHub release named after the tag (never auto-publish).
   `permissions: contents: write` only in this workflow. The version comes from `tauri.conf.json` / `Cargo.toml` /
   `package.json` (currently 0.1.0; keep them in sync). Unsigned builds are fine; mention it in the release body.
5. Verify locally what you can: `npm run check`, `npm run build`, `npm run tauri build` produces the MSI and NSIS
   installers (report their paths and sizes; don't commit them), and lint the workflows if `actionlint` is available.

READ-ONLY app rules unchanged (`npm run check:readonly` must pass). Small conventional commits (git-commit skill, no
Co-Authored-By). Don't merge, don't push. Report ≤ 12 lines.
