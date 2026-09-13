# AgentTeams 0.1.18 Upstream-First Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the desktop AgentTeams fork from `0.1.17` to upstream
`0.1.18` while keeping Harness `0.1.5-rc.1`, replacing overlapping local
patches with upstream behavior, retaining only still-needed local governance,
and producing verified Windows artifacts.

**Architecture:** Apply the upstream `v0.1.17..v0.1.18` delta to the existing
dirty `0.1.17` desktop baseline. Upstream scheduling, mailbox, cleanup, and
attempt-recovery behavior becomes authoritative; local role routing, strict V2,
quality extensions, authenticated Web routes, Profiles, and durable gateway
remain narrow additive seams.

**Tech Stack:** TypeScript, React, Cordis, DeepSeek Harness `0.1.5-rc.1`, Node
test runners, pnpm plugin build, npm Windows wrapper gate, electron-builder.

## Global Constraints

- AgentTeams source is exactly `v0.1.18` at `68fe529d602b1eea1f1ecaee99857d20a4f94be0`.
- Recommended Harness stays exactly `0.1.5-rc.1`; no other Harness source or tarball is imported.
- Upstream fixes take precedence at every overlap; local code is retained only for a registered capability that upstream lacks.
- Every child start, delivery, interrupt, retirement, and drain operation stays behind the single durable-session gateway.
- Saved Profile role provider/model/reasoning policy, strict V2 state, quality contracts, Team/Native routing, and authenticated Web CAS behavior must not regress.
- Do not install packages during the offline gate and do not weaken, skip, or delete a regression to get green.
- Preserve all pre-existing tracked and untracked edits. Do not reset, clean, commit, push, publish, install, or upload.

---

### Task 1: Import the upstream scheduling and lifecycle delta

**Files:**
- Modify: `win-desktop/agent-teams-plugin/package.json`
- Create: `win-desktop/agent-teams-plugin/release-notes/v0.1.18.md`
- Create: `win-desktop/agent-teams-plugin/src/mailbox.ts`
- Modify: `win-desktop/agent-teams-plugin/src/harness-compat.ts`
- Modify: `win-desktop/agent-teams-plugin/src/index.ts`
- Modify: `win-desktop/agent-teams-plugin/src/members.ts`
- Modify: `win-desktop/agent-teams-plugin/src/quality-gates.ts`
- Modify: `win-desktop/agent-teams-plugin/src/scheduler.ts`
- Modify: `win-desktop/agent-teams-plugin/src/snapshot.ts`
- Modify: `win-desktop/agent-teams-plugin/src/state.ts`
- Modify: `win-desktop/agent-teams-plugin/src/tools.ts`
- Modify: `win-desktop/agent-teams-plugin/src/types.ts`
- Modify: `win-desktop/agent-teams-plugin/src/client/AgentTeamsCard.tsx`
- Modify/Create focused files under `win-desktop/agent-teams-plugin/scripts/` changed by upstream `v0.1.17..v0.1.18`, excluding benchmark evidence and historical audit artifacts.

**Interfaces:**
- Consumes: current local `agentTeamsSubagentGateway(ctx)` and role-selection / strict-V2 / quality-gate APIs.
- Produces: upstream atomic roster/task creation, dormant members, lazy start, mailbox de-duplication, cleanup, current-attempt recovery, and stability regressions.

- [ ] **Step 1: Port the upstream focused regression changes first**

  Copy the behavioral assertions from upstream `scripts/stability-tdd.mjs`,
  `lifecycle-verify.mjs`, `member-failure-tdd.mjs`,
  `quality-gates-tdd.mjs`, `stress-verify.mjs`, and
  `harness-compat-tdd.mjs`. Add `stability-tdd.mjs` to the local `verify`
  chain. Do not import upstream benchmark recordings or `/tmp` audit evidence.

- [ ] **Step 2: Run focused tests and record the expected pre-port failures**

  Run from `win-desktop/agent-teams-plugin`:

  ```powershell
  node scripts/stability-tdd.mjs
  node scripts/lifecycle-verify.mjs --modern-harness
  node scripts/member-failure-tdd.mjs --modern-harness
  node scripts/harness-compat-tdd.mjs
  ```

  Expected before implementation: new `0.1.18` scheduling/mailbox assertions
  fail while existing local assertions continue to execute.

- [ ] **Step 3: Port the upstream implementation**

  Apply the exact upstream algorithms from the fixed checkout for the new
  `mailbox.ts`, dormant member state, atomic plan initialization, lazy member
  activation, next-step delivery, obsolete-message removal, descendant/input
  cleanup, missing-attempt response, depth default, and delivery-gate rules.
  Where an upstream function overlaps a local patch, retain the upstream body
  and reconnect the local capability through an explicit seam.

- [ ] **Step 4: Reapply only uncovered local invariants**

  Preserve role-level provider/model/reasoning selection, strict V2 validators,
  quality fields, Profiles, Team/Native routing markers, authenticated Web
  revision/credential checks, compact prompt limits, and local task-scope
  contracts. Do not restore any superseded local queue, steer, cleanup, or
  retry implementation.

- [ ] **Step 5: Integrate the durable gateway with upstream delivery**

  Ensure all start/delivery/interrupt/retire/drain paths still call
  `agentTeamsSubagentGateway(ctx)`. Upstream host queue and steer primitives are
  invoked through the gateway/harness-compat boundary, with live-parent
  resolution and child locking preserved.

- [ ] **Step 6: Build and run the plugin verification**

  ```powershell
  pnpm build
  pnpm test
  ```

  Expected: build exit `0`; all upstream `0.1.18` focused tests and every local
  regression pass with no skipped or weakened assertion.

### Task 2: Synchronize provenance and wrapper integration

**Files:**
- Modify: `win-desktop/agent-teams-plugin/UPSTREAM.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `win-desktop/package-lock.json` only where the local AgentTeams package identity is recorded.
- Modify: `win-desktop/tests/agent-teams-integration.test.js`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`
- Modify: other wrapper tests only when an exact `0.1.17` marker or changed exported contract requires it.

**Interfaces:**
- Consumes: Task 1 package version and actual source/test evidence.
- Produces: synchronized `0.1.18` provenance without changing the `0.1.5-rc.1` host closure.

- [ ] **Step 1: Update exact identity assertions**

  Change AgentTeams identity markers from `0.1.17` / commit `ca86dfc...` to
  `0.1.18` / commit `68fe529...`. Keep wrapper version, Harness source closure,
  dependency tarball paths, Models fork cohort, and all Harness peer ranges at
  `0.1.5-rc.1`.

- [ ] **Step 2: Record capability ownership classification**

  Mark the new scheduling/mailbox/cleanup/attempt/depth behavior
  `UPSTREAM_EQUIVALENT`. Mark local role routing, strict V2, quality extensions,
  authenticated Web CAS, Profiles, and the durable gateway admission seam
  `REAPPLY`, explaining the remaining behavioral gap.

- [ ] **Step 3: Run marker and wrapper-focused tests**

  ```powershell
  node --test tests/agent-teams-integration.test.js tests/local-capability-manifest.test.js tests/local-plugin-artifacts.test.js
  ```

  Expected: all selected tests pass and no stale current `0.1.17` identity
  remains outside dated history/release notes.

### Task 3: Full gate and Windows artifacts

**Files:**
- Generated but untracked: `win-desktop/dist/DeepSeek-Harness-0.1.5-rc.1-windows-x64.exe`
- Generated but untracked: `win-desktop/dist/DeepSeek-Harness-0.1.5-rc.1-windows-x64.zip`
- Generated but untracked: matching `.blockmap`

**Interfaces:**
- Consumes: Tasks 1-2 source, generated plugin lib output, existing real `node_modules`.
- Produces: verified local installer artifacts; no publication.

- [ ] **Step 1: Run the mandatory offline gate**

  ```powershell
  npm run verify:upstream
  ```

  Expected: exit `0`, including Models, CPA, AgentTeams, Alpha.2 closure, and
  wrapper suites.

- [ ] **Step 2: Confirm packaging preconditions**

  Verify `win-desktop/node_modules` is a real directory and not a reparse point,
  official whale icons remain configured, `signAndEditExecutable` is `true`,
  and the working tree contains no credential/session files added by this task.

- [ ] **Step 3: Build Windows artifacts**

  ```powershell
  npm run dist:win
  ```

  Expected: electron-builder completes and emits EXE, ZIP, and blockmap for
  wrapper `0.1.5-rc.1`.

- [ ] **Step 4: Verify packaged closure and integrity**

  Resolve the required Harness/Cordis modules from unpacked
  `src/dsh-service.js`, compare ZIP manifest closure, compute SHA-256 for all
  three artifacts, and query Authenticode status. Report `NotSigned` plainly if
  applicable.

- [ ] **Step 5: Final safety check**

  Run `git diff --check` and `git status --short`. Confirm installers, caches,
  upstream checkouts, sessions, logs, and credentials are not staged or
  tracked. Do not delete pre-existing untracked files.
