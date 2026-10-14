# AgentTeams inactive polling recovery implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent an inactive Team from consuming a model turn through endless status polling, without relaxing Profile or temporary-authority admission.

**Architecture:** AgentTeams retains ownership. Its model-facing status/error guidance gives a concrete recovery path; a process-local captain-only guard uses the existing official `agent/pre-step` reject boundary after three consecutive actual model status calls returning inactive. No new tool, settings control, durable Team field, host rewrite, or dependency is added.

**Tech Stack:** Existing TypeScript/Cordis/Harness 0.2.0-rc.2, Node offline AgentLoop fixtures, Windows Electron packaging.

**Spec:** Approved small-change description below, confirmed by the user's `采用防空转方案并生成 EXE（推荐）` reply on 2026-10-13. Native/inline implementation is the existing user-directed execution method; one independent final review follows.

## Approved scope

In Team mode, three consecutive inactive status queries in one turn pause that turn before another model request. Display the Profile settings/command recovery path. Active Team polling, Native mode and children are not paused by this rule. Build a new local EXE acceptance package after full regression. Do not pick a Profile, modify existing Teams/settings, commit or publish.

## Global constraints

- Canonical dirty `main` only; HEAD baseline `72dc27c090671d74873df44d44cbe562a690ffe4`. Review against new pre-edit dirty snapshots, not HEAD. Preserve prior rc.20/rc.21 and all user artifacts.
- Harness stays `0.2.0-rc.2`, upstream AgentTeams stays `v0.1.23`; candidate fork `0.1.23-desktop.4`, wrapper `0.2.0-rc.22`. No install/network in verification, no official tarball changes.
- `agent_teams_status` stays a read-only successful inactive probe with the same result shape. Only human/model-facing text improves; direct API/Web probes must not arm a model-turn guard.
- Use the effective persisted/installed delegation policy, not only global settings. Scope is root/captain actual model calls, not children or other sessions.
- A different tool, current direct-user message/new turn, changed binding, or newly active Team resets/cancels the consecutive streak. Plugin reminders and old/user-quoted text do not reset it or grant authority.
- Stop through the existing `agent/pre-step` rejection (`turn/end: blocked`); do not fabricate assistant evidence, alter Team halt state, change tasks/routes or call child gateway operations.
- Tighten the already incorrect inline-plan/Profile guidance while retaining captain prompt <=3500 and wrapper guidance <=500. No permission changes.
- Keep role/explicit routing, frozen Profiles, V2/CAS, quality, gateway, Native and Superpowers regressions intact.

## Review Focus

- Parallel tools/batched results: only complete, genuine inactive status calls count, not repeated pre-step invocations or manufactured output from another tool.
- Resume/HMR and newly arriving user/configuration input: no stale pause of productive work; guard cleanup follows plugin lifecycle.
- Active Team appearing between third result and pre-step: do not pause it; state reads remain zero-write.
- Native/fork/child identity: use actual live policy and actor identity; another session's three calls do not pause this one.
- Missing/corrupt state or permission failure: do not convert errors to inactive success; keep the existing strict state boundaries.

### Task 1: Inactive recovery and runtime stop

**Files:** Create `win-desktop/agent-teams-plugin/src/inactive-poll-guard.ts` and `scripts/inactive-poll-guard.test.mjs`; modify the existing `src/tools.ts`, `src/index.ts`, `src/profiles.ts` and plugin `package.json` verify chain only as needed for this capability. No UI or native package changes.

**Interfaces:** Consume official `agent/pre-step`, session own events, effective `liveDelegationPolicy`, volatile settings and existing Team reads. Produce one internal installation function `installInactiveTeamPollingGuard(ctx: Context, config: Pick<ToolsConfig, 'stateDir' | 'settings' | 'profiles'>): void`; use existing hook results, no public gateway/Team API changes.

- [ ] Write the actual AgentLoop RED test: an offline adapter returns status on each request; no Team/default is present. Expect exactly three status calls, `turn/end.reason.kind === 'blocked'`, zero fourth model request and no `.agent-teams` writes. Include recovery text in the returned status/error.
- [ ] Run `node --test scripts/inactive-poll-guard.test.mjs`; record a behavioral failure against current compiled code, not an import/setup failure.
- [ ] Implement the smallest guard and actionable missing-binding/inactive guidance. Correct model-facing inline plan/Profile wording, without widening creation admission.
- [ ] Add/run controls: active Team, Native, child, other session, non-status intervening tool, new direct user, new turn, binding save/Team creation before pre-step, duplicate/batched calls, direct API probe, error result. Assert legal Profile creation remains admitted and invalid creation remains zero-write.
- [ ] Run plugin build/verify and root `win-desktop/npm run verify:upstream` with offline/no-install settings. Expected actual exit 0, all existing stages retained. Record warnings/skips, not as passes.
- [ ] Record task completion locally; no commit under user instructions.

### Task 2: Candidate metadata and independent review

**Files:** Update AgentTeams `package.json`, `UPSTREAM.md`, README current notes and `release-notes/v0.1.23-desktop.4.md`; wrapper `package.json`, exact lock entries, `tests/agent-teams-integration.test.js`, `tests/desktop-settings-plugin.test.js`, `tests/local-capability-manifest.test.js`, `tests/local-plugin-artifacts.test.js`, both current READMEs, `docs/UPSTREAM_MAINTENANCE.md`, relevant AGENTS registration and `release-notes/v0.2.0-rc.22.md`. Preserve historical notes.

**Interfaces:** Consume Task 1 validated runtime/regression. Produce consistent `0.1.23-desktop.4` / `0.2.0-rc.22` manifests, installed file artifacts and fixed provenance; no host/other owner version changes.

- [ ] Synchronize version/lock/assertions and maintenance only after new behavior's gate passes.
- [ ] Build/sync local artifacts and run complete `npm run verify:upstream` again. Expected actual exit 0 and exact source/installed versions.
- [ ] Independently review only this delta versus actual pre-edit dirty snapshots, using a fresh reviewer; retain all Review Focus items and proof limits. Critical/Important findings receive one TDD fix pass and fresh full gate; Minor findings are disclosed, not silently promoted to success.
- [ ] Record task completion locally; no commit/push/tag/Release.

### Task 3: Local rc.22 test package

**Files:** New ignored output `win-desktop/dist/rc22-acceptance-20261013` only, plus this plan's own ignored evidence directory. Existing output/source/installed user app remains untouched.

**Interfaces:** Consume reviewed green source and real `win-desktop/node_modules`. Produce EXE/ZIP/blockmap and local acceptance receipt, not publication or installed-client acceptance.

- [ ] Confirm output absent, dependencies real, official whale assets and build configuration intact.
- [ ] Run `npm run dist:win -- --config.directories.output=dist/rc22-acceptance-20261013`. Expected fresh gate and builder actual exit 0; publish never.
- [ ] Verify unpacked and isolated ZIP createRequire closure, exact AT/host/wrapper versions and local runtime bytes, fixed Superpowers assets, actual PE whale icon and Authenticode.
- [ ] Record asset byte sizes/SHA-256, remaining limitations and any review rulings in an ignored acceptance receipt. Check main/HEAD and preserved user paths; do not clean/stage/upload.
