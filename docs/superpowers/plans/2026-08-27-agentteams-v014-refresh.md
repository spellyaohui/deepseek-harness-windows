# AgentTeams v0.1.14 refresh and Windows release

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` for implementation tasks and `verification-before-completion` before claiming completion.

## Goal

Refresh the locally forked AgentTeams plugin from upstream v0.1.13 to v0.1.14, preserve every project-owned capability and regression, resolve only evidence-backed ownership changes, run the complete upstream regression gate, and produce the Windows EXE/ZIP without publishing or committing generated release output.

## Architecture and ownership

- AgentTeams owns team planning, routing, member defaults, model-catalog use, lifecycle, quality gates, staged approval, and team controls.
- The wrapper owns Windows integration, plugin mounting, OpenCode compatibility, and startup behavior.
- CPA, Models, Desktop Settings, and Session Markdown remain separate owners; do not move their behavior into AgentTeams.
- The current release invariants in `AGENTS.md` and `docs/UPSTREAM_MAINTENANCE.md` are acceptance criteria.

## Constraints

- Work only in `.worktrees/agentteams-v014-refresh` on `codex/agentteams-v014-refresh`.
- Read `docs/UPSTREAM_MAINTENANCE.md` before importing source.
- Never delete local-only code, tests, settings, rewrites, provenance, or unknown user files to make a merge clean.
- The gate must not run package installation, publishing, or network access.
- Do not commit credentials, runtime state, logs, screenshots, installers, package output, or local upstream checkouts.
- Use a three-way comparison against upstream v0.1.13, classify each registry capability as `UPSTREAM_EQUIVALENT`, `REAPPLY`, or `SUPERSEDED_BY_DESIGN`, and retain a regression for every preserved capability.

## Tasks

### 1. Establish an isolated baseline

- Confirm branch, HEAD, clean/dirty state, Node/npm/pnpm versions, and package manifests.
- Install dependencies only as setup (`npm ci` in `win-desktop`; frozen pnpm installs for local plugin packages as required).
- Run `npm run verify:upstream` from `win-desktop` before modifying source; capture the result and generated-artifact diff.
- If the baseline fails, diagnose the exact failure before changing implementation.

### 2. Audit upstream v0.1.14

- Reconfirm live upstream refs for DeepSeek Harness, AgentTeams, and auto mode.
- Compare AgentTeams v0.1.13 source to v0.1.14 with a three-way merge against the local fork.
- Read the v0.1.14 release notes and inspect all changed source, tests, scripts, package metadata, and lockfile changes.
- Produce an ownership matrix for every registered local capability and every new upstream capability.

### 3. Apply the smallest compatible refresh

- Update upstream-equivalent AgentTeams behavior while retaining local Windows/project patches.
- Reapply or migrate project-only compatibility behavior where upstream does not provide it.
- Resolve dependency and API changes without moving CPA-specific rules into the Models fork or AgentTeams.
- Add or update focused regression tests before final implementation claims.
- Synchronize AgentTeams package version, wrapper file dependency metadata, lockfile, integration assertions, README/release notes, and `UPSTREAM.md` only after source and tests prove the new revision.
- Use an atomic commit for the source/metadata increment and keep generated `lib` output limited to what the repository gate expects.

### 4. Verify and review

- Run focused AgentTeams tests and build/type checks.
- Run `npm run verify:upstream` from `win-desktop` and confirm it passes without package-manager or network activity.
- Run the full relevant test suite, packaging preflight, and `npm audit --omit=dev`; record pre-existing findings separately from refresh regressions.
- Perform an adversarial fresh-context review covering ownership loss, protocol/session invariants, secrets, generated files, version/provenance consistency, and rollback.
- Resolve all actionable findings or stop and ask the user to choose when evidence shows a genuine product/design conflict.

### 5. Build and verify release artifacts

- From `win-desktop`, run `npm run dist:win` only after the gate is green.
- Verify the generated EXE and ZIP exist, contain the expected version, and have recorded SHA-256 hashes.
- Verify the final worktree status, branch, HEAD, and tracked/untracked classification; do not publish or upload.
- Report exact artifact paths, hashes, tests, unresolved findings, and any user decision required.

## Verification commands

```powershell
git status --short --branch
git log -1 --format=fuller
npm ci
npm run verify:upstream
npm test
npm audit --omit=dev
npm run dist:win
Get-FileHash .\dist\*.exe -Algorithm SHA256
Get-FileHash .\dist\*.zip -Algorithm SHA256
```

## Stop conditions

Stop and ask the user to choose if upstream changes the visible ownership of a project-only feature, if a required dependency cannot be reconciled without dropping a local invariant, if security/release verification cannot establish a safe artifact, or if the mandatory regression gate remains failing after evidence-backed fixes.
