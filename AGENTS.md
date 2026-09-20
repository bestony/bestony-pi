# PROJECT KNOWLEDGE BASE

**Generated:** 2026-09-20

## OVERVIEW

Project: **bestony-pi-preset** — an npm package that bundles personal Pi coding-agent
resources (extensions / skills / prompts / themes) plus a set of third-party Pi packages,
so one `pi install` loads everything.
Stack: Node.js ESM (`"type": "module"`), no build step, no framework. Tests use the
built-in `node:test`. Release automation is GitHub Actions + npm Trusted Publisher (OIDC).

## STRUCTURE

*   `package.json` — the single source of truth: version, `pi` manifest, `dependencies`,
    `bundledDependencies`, `files`.
*   `extensions/`, `skills/`, `prompts/`, `themes/` — own resources (currently `.gitkeep` placeholders).
*   `.github/scripts/generate-release-notes.mjs` — dependency-free Conventional-Commits →
    Markdown release-notes generator (CLI + exported pure functions).
*   `.github/scripts/generate-release-notes.test.mjs` — its tests, kept beside the script.
*   `test/generate-release-notes.test.mjs` — 4-line wrapper so `node --test` finds them from the repo root.
*   `.github/workflows/daily-release.yml` — the whole release pipeline.
*   `.pi/npm/` — private local extensions workspace; **not** published (`files` excludes it).
*   `README.md` — user-facing, written in Chinese; update it when the install/release flow changes.

## COMMANDS

| Action           | Command |
|------------------|---------|
| Install          | `npm ci --allow-git=root` |
| Test             | `node --test` |
| Build            | none (nothing is compiled) |
| Load locally     | `pi -e .` (session only) or `pi install .` |
| Inspect manifest | `pi config` |
| Generate notes   | `node .github/scripts/generate-release-notes.mjs --base-ref <ref> --head-ref <ref> --tag <tag> --repository owner/repo --output -` |

`--allow-git=root` is required: npm 12 defaults `allow-git` to `none`, and
`commandcode-go-for-pi` is a root git dependency.

## CODING STANDARDS

*   **Language**: ESM only, `node:`-prefixed builtin imports, no TypeScript.
*   **Style**: double quotes, 2-space indent, semicolons, trailing commas; arrow functions and
    `const`; small exported pure functions (`buildReleaseNotes`, `compareDependencies`,
    `parseArgs`) with git/filesystem work isolated in the wrapper (`generateReleaseNotes`, `runGit`).
*   **Scripts stay dependency-free**: stdlib + `node:test` + `node:assert/strict` only. No linter
    or formatter is configured — match surrounding style.
*   **Comments** explain *why* (security, atomicity, escaping), not *what*. All code, comments,
    identifiers, and commit messages in English.
*   **Commits**: Conventional Commits (`feat(scope): ...`, `fix(ci): ...`). This feeds the
    release-notes grouping (`feat`→Features, `fix`→Fixes, `perf`→Performance, `docs`→Documentation,
    everything else→Maintenance).

## WHERE TO LOOK

*   **Source**: `.github/scripts/`
*   **Tests**: `.github/scripts/*.test.mjs` (entry point: `test/`)
*   **Release flow docs**: `README.md` sections "自动发布" / "GitHub Releases and release notes"
*   **CI**: `.github/workflows/daily-release.yml`

## NOTES

*   **Pushing to `main` publishes to npm.** Any push triggers a release; if the current version
    already exists on npm, CI bumps patch, commits `chore(release): X.Y.Z`, tags `vX.Y.Z`, pushes,
    and creates the GitHub Release. Only CI's own `chore(release):` pushes are skipped.
*   Version bumps: a manual bump is honored if unpublished; otherwise CI patches for you. Don't
    hand-edit `package-lock.json` versions — run `npm install`.
*   Daily `0 16 * * *` UTC cron runs `npm-check-updates` on **direct** deps only and releases only
    if something changed. `workflow_dispatch` with `force_publish: true` releases regardless.
*   Auth is OIDC — **never** add `NPM_TOKEN` or other secrets to the repo. Requires node >= 24 in
    CI and npm >= 11.5.1 (workflow upgrades npm).
*   Bundle a new Pi package by adding it to `dependencies` **and** `bundledDependencies`, then
    pointing `pi.extensions` / `pi.skills` at its `node_modules/...` path. Pi core packages
    (`@earendil-works/pi-*`, `typebox`) belong in `peerDependencies` as `"*"` and stay unbundled.
*   `.npmrc` sets `force=true` because bundled Pi packages sometimes pin **stale** peer ranges on
    Pi core packages the runtime provides (e.g. `@mohndoe/pi-atlas` wants `@earendil-works/pi-tui`
    `>=0.74.0 <0.77.0` while this preset tracks 0.84.x). `force` tolerates the conflict and still
    installs the peer tree. Do **not** switch to `legacy-peer-deps`: it drops the entire
    `@earendil-works/*` peer subtree from the lock (~1000 entries) and trips `EALLOWGIT` during
    re-resolution. `npm overrides` cannot express this — it does not apply to peer ranges.
*   Release-note text is Markdown-escaped on purpose (`escapeMarkdown` / `escapeCode`) — commit
    subjects are attacker-influenced input into `gh release create`.
*   Repo uses a `.gitlock` file as a commit lock: create it before committing, delete it after; if
    it already exists, wait 30s and re-check.
*   Global user rules live in `~/.claude/CLAUDE.md` (Chinese replies, English code/docs, `gh` CLI
    over web UI for GitHub operations).

## SELF-CHECK

`node --test` must pass (5 tests) before claiming the release-notes generator works.
