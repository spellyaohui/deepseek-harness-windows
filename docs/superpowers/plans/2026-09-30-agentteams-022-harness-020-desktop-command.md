# AgentTeams 0.1.22 and Harness 0.2.0-rc.2 Windows Migration Implementation Plan

> Checkpoint 2026-09-30: implementation, the full offline gate, local acceptance packaging and installed-file verification have completed. The original constraints below describe the implementation stage. The user subsequently authorized local packaging and a source-only GitHub commit/push, but no tag, Release or installer upload. Functional user acceptance is still pending.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Windows wrapper to AgentTeams 0.1.22 and its recommended Harness 0.2.0-rc.2 while preserving proven local capabilities and exposing upstream-style Windows dsh-command management.

**Architecture:** Keep the current Electron wrapper and import one exact official Harness package graph. Keep AgentTeams as the single local fork, reapply only capabilities not proved upstream-equivalent, and adapt the official Windows command ownership protocol into an explicit tray action. No automatic PATH changes or second runtime graph.

**Tech Stack:** Node.js, Electron, TypeScript, PowerShell, npm/pnpm, Node test runner, official DeepSeek Harness source packages.

**Spec:** `docs/superpowers/specs/2026-09-30-agentteams-022-harness-020-desktop-command-design.md`

## Global Constraints

- Official Harness tag `dsh-v0.2.0-rc.2` resolves to `639ed015397290b3745d163aafe02ffee4aa3f84`; AgentTeams tag `v0.1.22` resolves to `9cba4fe4171f27c019991cafd2a107f87ef3517b`. Reject any different checkout or artifact identity.
- The local fork keeps the exact eight-host peer list, with `0.2.0-rc.2` recommended and the previous seven retained. The wrapper pins exactly `0.2.0-rc.2`, never `latest`.
- Preserve AgentTeams role Provider/model/reasoning, strict V2, Profiles, quality, Team/Native routing, Web CAS/auth, and one durable gateway; preserve the separate Native settings page and all other owners in `AGENTS.md`.
- Before importing, re-inventory the existing dirty paths (174 at planning time). They are user-owned. Never reset, clean, overwrite unknown untracked files, stage all files, or silently commit pre-existing changes. This checkout contains uncommitted 0.1.21 migration work; an isolated worktree would omit that base. Work in the current checkout only through exact-path, reviewed patches after recording overlapping files and their hashes; if a required edit cannot preserve an overlap, stop and ask rather than corrupting the baseline.
- `npm run verify:upstream` from `win-desktop` remains offline, install-free, network-free and package-free. Source fetch/install/packing, if necessary, happen separately before the gate. Generated `lib/`, tarballs, caches, sessions, logs and installers remain ignored and uncommitted.
- No GitHub push, tag, Release, EXE build, automatic HKCU PATH edit, or live provider call in this task. In-source task commits are permitted only for exact paths with no pre-existing user changes; otherwise leave the change unstaged and report its ownership boundary.

## Review Focus

1. A stale or partly upgraded Node closure must fail before boot, not mix 0.1.7 and 0.2.0 DSH packages (Task 1 test).
2. A saved Profile naming a model removed by the new catalog must remain saved but visibly unresolved, not silently routed to another model (Task 3 test).
3. A member's failed or stale child attempt must not bypass the durable gateway or change Team/Native authority (Task 2 test).
4. A pre-existing different `dsh` command, changed PATH fingerprint, or unavailable installed launcher must never be overwritten by the menu action (Task 5 tests).
5. The command launcher must quote its relative EXE and CLI paths, including paths with Unicode/spaces, and forward CLI arguments without invoking external Node/pnpm; the source test is static, while real installed-path execution remains a separate acceptance check (Task 5 test).

---

### Task 1: Pin and validate the official Harness source closure

**Files:**
- Modify: `win-desktop/package.json`, `win-desktop/package-lock.json` (only exact official package references; preserve local `file:` plugins)
- Create: `win-desktop/tests/host-cohort.test.js`
- Modify: `win-desktop/tests/verify-alpha2-runtime-closure.test.js`
- Create: `docs/UPSTREAM_020_SOURCE_MANIFEST.md`
- Ignored input/output: `upstream/dsh-v0.2.0-rc.2/` only after verifying the resolved path is within this repository

**Interfaces:**
- Consumes: the fixed upstream tag and source-packing procedure recorded in `docs/UPSTREAM_017_SOURCE_MANIFEST.md`.
- Produces: exact `0.2.0-rc.2` `file:` host graph with hashes and an installed package closure that later plugin builds consume.

- [ ] **Step 1: Record and test the baseline.** Save `git status --porcelain=v1 -uall`, exact paths and SHA-256 of any planned overlap in the task ledger. Run `npm run verify:upstream` from `win-desktop` before importing; record its real exit and any pre-existing failures. Create `tests/host-cohort.test.js` with this fail-first test:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
test('installed official host belongs to the pinned 0.2.0 cohort', () => {
  const wrapper = read('../package.json')
  const installedDsh = read('../node_modules/@deepseek-ai/dsh/package.json')
  assert.equal(installedDsh.version, '0.2.0-rc.2')
  for (const [name, reference] of Object.entries(wrapper.dependencies)) {
    if (/^@deepseek-ai\/dsh(?:-|$)/u.test(name) && reference.startsWith('file:../upstream/')) {
      assert.match(reference, /upstream\/dsh-v0\.2\.0-rc\.2\/tarballs\/dsh\//u)
    }
  }
})
```

Run: `node --test tests/host-cohort.test.js` from `win-desktop`. Expected: FAIL on the current `0.1.7-rc.2` pin.

- [ ] **Step 2: Prepare exact official input outside the gate.** Fetch the tag into a new ignored `upstream/dsh-v0.2.0-rc.2` directory only if that path does not already contain user files. Confirm `git rev-parse HEAD` equals `639ed015397290b3745d163aafe02ffee4aa3f84`, tracked source is clean, and the upstream package build/pack/install-verification commands succeed using its pinned pnpm 11 cohort. Pack every required DSH/vendor package from that one source; reject registry or mixed-version DSH substitutions. Record name, version, path and SHA-256 in `docs/UPSTREAM_020_SOURCE_MANIFEST.md`. Do not run this inside `verify:upstream`.

- [ ] **Step 3: Switch the graph mechanically.** Replace only the official host `file:` references in `win-desktop/package.json`; add and remove package names only as required by the official 0.2.0 runtime profile. Preserve all six local `file:` plugins and unrelated fields. Run an ordinary package-manager install outside the gate to regenerate the lockfile and real (not linked) `win-desktop/node_modules`. Do not use `--force` or `--legacy-peer-deps`. Keep the existing closure verifier strict: for each resolved `@deepseek-ai/dsh*` manifest, assert the exact target version:

```js
if (resolved.name === '@deepseek-ai/dsh' || resolved.name.startsWith('@deepseek-ai/dsh-')) {
  assert.equal(resolved.version, '0.2.0-rc.2')
}
```

- [ ] **Step 4: Verify and stage exactly.** Run `node --test tests/host-cohort.test.js tests/verify-alpha2-runtime-closure.test.js` and `npm run verify:runtime-closure`. Expected: PASS, no 0.1.7 DSH in the resolved closure. Commit only if every staged path was clean before this task; otherwise leave changed files unstaged with a ledger ownership note.

### Task 2: Merge AgentTeams v0.1.22 contract with the local fork

**Files:**
- Modify: `win-desktop/agent-teams-plugin/package.json`, `compatibility.json`, `pnpm-lock.yaml`, `UPSTREAM.md`
- Modify only where the v0.1.22 source comparison requires it: `win-desktop/agent-teams-plugin/scripts/compatibility.mjs`, `doctor.mjs`, `release-metadata.mjs` and their tests
- Test: `win-desktop/agent-teams-plugin/scripts/subagent-gateway-tdd.mjs`, `selection-policy-verify.mjs`, `hmr-member-runtime-verify.mjs`, `routing-policy-lifecycle-verify.mjs`, `lifecycle-verify.mjs`, `quality-gates-tdd.mjs`

**Interfaces:**
- Consumes: Task 1 exact host packages and existing `agentTeamsSubagentGateway(ctx)` API.
- Produces: `@nanmicoder/dsh-agent-teams@0.1.22-desktop.1` with recommended host `0.2.0-rc.2` and unchanged local Team API.

- [ ] **Step 1: Capture fail-first contract tests.** Add assertions to the existing compatibility and gateway suites:

```js
assert.equal(policy.recommendedHost, '0.2.0-rc.2')
assert.deepEqual(policy.supportedHosts.map((entry) => entry.version), [
  '0.2.0-rc.2', '0.1.7-rc.2', '0.1.5-rc.3', '0.1.5-rc.2',
  '0.1.5-rc.1', '0.1.2-rc.1', '0.1.2-alpha.5', '0.1.2-alpha.2',
])
```

Use the existing compatibility fixture and leave the current exact-live-Agent gateway assertions active. Run `node --test scripts/compatibility.test.mjs` and `node scripts/subagent-gateway-tdd.mjs` from the plugin. Expected: the new host/version assertion FAILS before migration; the existing gateway contract stays green.

- [ ] **Step 2: Import upstream-first.** Compare fixed `v0.1.21..v0.1.22` file-by-file. The official `src/` tree has no delta, so do not replace local Team runtime source wholesale. Bring over the compatibility/doctor/release metadata and test behavior needed for eight-host support; keep local offline `file:` dev pins and role-specific inject/peer additions. Keep generated upstream `lib/` ignored in this fork; generic host Git installation remains upstream-owned. Set package version to `0.1.22-desktop.1` and exact host development pins to Task 1's tarballs. Rebuild the fork.

- [ ] **Step 3: Run retained owner regressions.** Run the focused command below and then `pnpm test` from the plugin. Expected: every suite passes without disabling a test, especially exact-live-Agent gateway admission, frozen model/effort selection, failed-attempt settlement, strict V2, Web CAS and both Native/Team routing.

```powershell
node scripts/subagent-gateway-tdd.mjs
node scripts/selection-policy-verify.mjs
node scripts/hmr-member-runtime-verify.mjs
node scripts/routing-policy-lifecycle-verify.mjs
pnpm test
```

- [ ] **Step 4: Classify and record.** For each AgentTeams row in `docs/UPSTREAM_MAINTENANCE.md`, mark upstream-equivalent only when its retained regression passes against the imported owner; otherwise record `REAPPLY`. If an API or behavior change cannot preserve role routing or gateway safety, stop for the user's conflict decision. Do not commit pre-existing user edits.

### Task 3: Rebase Models and dependent local plugins on the 0.2.0 host

**Files:**
- Modify: `win-desktop/models-settings-plugin/package.json`, `pnpm-lock.yaml`, `src/index.ts`, `src/client/index.ts` and only the provider-neutral editor files changed by the official 0.2.0 editor
- Modify: host peer/development pins and owner versions in `win-desktop/cpa-provider-plugin/package.json` and lockfile; same for `desktop-settings-plugin`, `opencode-capabilities-plugin`, `tool-call-guidance-plugin` only where their existing manifests require it
- Test: Models package tests, CPA package tests, `win-desktop/tests/model-capability-probe-integration.test.js`, `win-desktop/tests/subagent-settings-card-visibility.test.js`

**Interfaces:**
- Consumes: Task 1 package graph and Task 2's shared model-catalog and AgentTeams role route expectations.
- Produces: host-compatible provider-neutral Models editor and the same CPA, Desktop Settings, OpenCode and guidance public behavior.

- [ ] **Step 1: Add fail-first host/cohort assertions** to the existing package/integration tests, keeping the saved-model choice unchanged. In `win-desktop/tests/local-plugin-artifacts.test.js`, which already imports `assert` and `readFileSync`, add:

```js
const modelsPackage = JSON.parse(readFileSync(new URL('../models-settings-plugin/package.json', import.meta.url), 'utf8'))
assert.equal(modelsPackage.version, '0.2.0-rc.2-desktop.1')
```

In `agent-teams-plugin/scripts/selection-policy-verify.mjs`, which already imports `selectMemberCandidate`, add:

```js
const savedRole = { provider: 'fixture', model: 'removed-model-id', reasoningMode: 'target-default' }
assert.deepEqual(selectMemberCandidate({
  captain: { provider: 'fixture', model: 'current-id', reasoningEffort: 'high' },
  role: savedRole,
}), { provider: 'fixture', model: 'removed-model-id' })
```

The synthetic removed ID is fixture-only. Run the affected Models, CPA and AgentTeams selection tests. Expected: version assertion FAILS before the rebase; the saved Profile must never be mutated by catalog hydration. Also keep the current editor invalid/unavailable-model UI regression active so the preserved route is visibly unresolved.

- [ ] **Step 2: Rebase official-first.** Compare the official `@deepseek-ai/dsh-client-ui-settings-models` 0.1.7 and 0.2.0 source and import its new editor behavior. Reapply only the existing neutral image-mode, draft-only probe, late-Remote, overwrite, validation and output-link fixes that the official source still lacks. Update each dependent plugin's host pins and build against the one Task 1 graph. Do not add CPA/OpenCode/woyaopro rules to Models. Do not restore AUTO or hide the Native Subagent page.

- [ ] **Step 3: Verify.** Run `pnpm test` in Models and CPA, their narrower package checks for other changed plugins, then `node --test tests/model-capability-probe-integration.test.js tests/subagent-settings-card-visibility.test.js` from `win-desktop`. Expected: all pass; existing provider settings, explicit text-only choices and removed model IDs are preserved without silent rewrites.

### Task 4: Adapt the wrapper startup and compatibility boundaries

**Files:**
- Modify only where the new host contract requires it: `win-desktop/src/dsh-service.js`, `main.js`, `preload.cjs`, `win-hide-console.mjs`, existing narrow rewrite modules under `src/`, and `config/*.patch.yml`
- Modify: corresponding `win-desktop/tests/*.test.js` for startup, auth, shell, OpenCode, exact grep, quota and plugin mounting
- Test: `win-desktop/tests/agent-teams-integration.test.js`, `heal-desktop-plugins.test.js`, `alpha2-runtime-dependencies.test.js`, `subagent-settings-card-visibility.test.js`

**Interfaces:**
- Consumes: Tasks 1–3 installed graph and rebuilt local plugin entrypoints.
- Produces: `startDshService()` and authenticated Web/client startup on the 0.2.0 host without duplicate or missing plugin modules.

- [ ] **Step 1: Run fail-first real startup regression** with the new packages and old wrapper integration. Record the exact missing module, changed Host API or incompatible patch failure; do not weaken the existing authenticated-URL, both-settings-visible or client-bundle assertions in the named tests.

- [ ] **Step 2: Repair only proven boundaries.** Point wrapper patch resolution at the new installed modules, preserve full-token URL handoff, real package-resolution healing, HMR client snapshots, hidden Windows console and the narrow grep/quota/OpenCode rewrites. An upstream fix may replace one rewrite only after its retained regression passes against the pure upstream implementation. Use `buildDshArgs()` and `resolveDshEntry()` as the existing launch seam; do not add a second launcher or reimplement upstream Web features.

- [ ] **Step 3: Verify.** Run `npm test` and the isolated Electron/loopback startup fixture already used by `heal-desktop-plugins.test.js`. Then launch one fresh Electron instance with an isolated temporary user-data directory and the pinned local host graph, observe the authenticated Web page and both settings surfaces, and close it without provider calls. Expected: no missing client module, both settings surfaces present, official new client behavior available, no unexpected browser opening, no token in diagnostics. If a safe isolated startup cannot be arranged, stop and report that acceptance gap rather than claiming the migration complete.

### Task 5: Adapt official Windows dsh-command management into the wrapper

**Files:**
- Create: `win-desktop/src/command-management.js`, `win-desktop/assets/cli/dsh.cmd`, `win-desktop/assets/cli/command-path.ps1`
- Modify: `win-desktop/src/main.js`, `win-desktop/package.json` (build files and tray action only)
- Create: `win-desktop/tests/command-management.test.js`
- Modify: `win-desktop/tests/verify-alpha2-zip-closure.test.js` to assert launcher assets in the packaged closure when packaging is separately authorized

**Interfaces:**
- Consumes: Task 1 pinned `@deepseek-ai/dsh/lib/bin.js`; Task 4 wrapper's Electron executable and `createTray()` action.
- Produces: `manageDshCommand({ inspect, mutate, confirm, installed })` with no write until an explicit user confirmation; installed launcher routes to the same embedded host CLI.

- [ ] **Step 1: Write fail-first tests** using injected worker/dialog functions and temporary path fixtures; never write real HKCU PATH in tests. Create `tests/command-management.test.js` with these exact first two cases and then extend it for occupied/launcher/Unicode cases:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { manageDshCommand } from '../src/command-management.js'

const state = { fingerprint: 'a'.repeat(64), managed: false, available: true, occupied: false }
test('cancel makes no PATH mutation', async () => {
  const mutations = []
  const result = await manageDshCommand({
    inspect: async () => state,
    mutate: async (operation) => mutations.push(operation),
    confirm: async () => false,
    installed: true,
  })
  assert.equal(result, 'cancelled')
  assert.deepEqual(mutations, [])
})

test('stale confirmation makes no PATH mutation', async () => {
  const mutations = []
  let reads = 0
  await assert.rejects(manageDshCommand({
    inspect: async () => ({ ...state, fingerprint: (++reads === 1 ? 'a' : 'b').repeat(64) }),
    mutate: async (operation) => mutations.push(operation),
    confirm: async () => true,
    installed: true,
  }), /changed after confirmation|stale/iu)
  assert.deepEqual(mutations, [])
})

test('foreign command is explicit and cancellation is non-mutating', async () => {
  const mutations = []
  const decisions = []
  const result = await manageDshCommand({
    inspect: async () => ({ ...state, occupied: true }),
    mutate: async (operation) => mutations.push(operation),
    confirm: async (decision) => { decisions.push(decision); return false },
    installed: true,
  })
  assert.equal(result, 'cancelled')
  assert.equal(decisions[0].foreignCommand, true)
  assert.deepEqual(mutations, [])
})

test('missing installed launcher fails before mutation', async () => {
  const mutations = []
  await assert.rejects(manageDshCommand({
    inspect: async () => ({ ...state, available: false }),
    mutate: async (operation) => mutations.push(operation),
    confirm: async () => true,
    installed: true,
  }), /launcher is unavailable/iu)
  assert.deepEqual(mutations, [])
})

test('remove only our managed entry after confirmation', async () => {
  const mutations = []
  const result = await manageDshCommand({
    inspect: async () => ({ ...state, managed: true }),
    mutate: async (...args) => mutations.push(args),
    confirm: async () => true,
    installed: true,
  })
  assert.equal(result, 'remove')
  assert.deepEqual(mutations, [['remove', state.fingerprint]])
})

test('cmd launcher quotes paths and forwards every argument', () => {
  const cmd = readFileSync(new URL('../assets/cli/dsh.cmd', import.meta.url), 'utf8')
  assert.match(cmd, /"%~dp0[^"\r\n]+DeepSeek Harness\.exe"/u)
  assert.match(cmd, /"%~dp0[^"\r\n]+@deepseek-ai\\dsh\\lib\\bin\.js" %\*/u)
  assert.match(cmd, /exit \/b %errorlevel%/iu)
})
```

The quoted `%~dp0` paths are relative to the command file and therefore work with Unicode/spaces without concatenating shell input. Run `node --test tests/command-management.test.js` from `win-desktop`. Expected: FAIL because the module/assets do not exist.

- [ ] **Step 2: Adapt the official Windows owner.** Use the upstream `apps/desktop/scripts/command-path.ps1` at `dsh-v0.2.0-rc.2` as the basis, retaining its mutex, owner key, fingerprint, stale-state and PATH preservation behavior. The wrapper worker passes fixed resource paths and only `inspect`, `install` or `remove`; it never accepts a model-provided path. The JS adapter uses this fail-closed sequence (the worker separately rechecks the fingerprint under its mutex):

```js
export async function manageDshCommand({ inspect, mutate, confirm, installed }) {
  if (!installed) throw new Error('dsh command management requires an installed application')
  const before = await inspect()
  if (!before.available) throw new Error('installed dsh launcher is unavailable')
  const operation = before.managed ? 'remove' : 'install'
  if (!(await confirm({ operation, state: before, foreignCommand: before.occupied && !before.managed }))) {
    return 'cancelled'
  }
  const fresh = await inspect()
  if (fresh.fingerprint !== before.fingerprint) throw new Error('PATH changed after confirmation')
  await mutate(operation, before.fingerprint)
  return operation
}
```

The confirmation text must explicitly name a foreign active `dsh` command; cancelling never calls `mutate`. Keep the product process write-free on startup.

- [ ] **Step 3: Wire the installed launcher.** Because this product uses `asar: false` and packages `assets/cli` under `resources/app`, `assets/cli/dsh.cmd` is:

```bat
@echo off
setlocal DisableDelayedExpansion
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0..\..\..\..\DeepSeek Harness.exe" --expose-internals "%~dp0..\..\node_modules\@deepseek-ai\dsh\lib\bin.js" %*
exit /b %errorlevel%
```

Derive the filename from the current `build.productName` and check the launcher statically; real installed-path execution remains unverified until a separately authorized package build. Add a tray item that calls the manager only when clicked. Include both assets in `build.files`; the runtime closure test must resolve the CLI package from the installed app when packaging is separately authorized. Do not copy the official `dsh-desktop-host` path: that package is not part of the npm host graph.

- [ ] **Step 4: Verify.** Run `node --test tests/command-management.test.js` plus `npm test`. Expected: all pass, no real PATH or registry changes. If source-level tests cannot prove installed-command behavior, mark it pending installed EXE acceptance; do not claim it works from a development checkout.

### Task 6: Reconcile provenance and run the mandatory final gate

**Files:**
- Modify: `docs/UPSTREAM_MAINTENANCE.md`, `win-desktop/agent-teams-plugin/UPSTREAM.md`, `win-desktop/models-settings-plugin/UPSTREAM.md`, `README.md`, `win-desktop/README.md` if current version text exists, relevant release notes, `win-desktop/tests/local-plugin-artifacts.test.js`, and the wrapper capability manifest test
- Test: `win-desktop/npm run verify:upstream`

**Interfaces:**
- Consumes: passing Tasks 1–5 and exact source/lockfile identities.
- Produces: one auditable capability classification and green offline source acceptance, without release artifacts.

- [ ] **Step 1: Audit every registered capability.** Record the upstream-equivalent/reapply/superseded result, retained test and owning file for every active row in `docs/UPSTREAM_MAINTENANCE.md`, including Native visibility, wrapper startup, Model input, CPA, gateway, quality, Web CAS, hidden console, grep, quota and OpenCode. Do not finalize provenance for an owner whose build or regression is failing.

- [ ] **Step 2: Add fail-first identity assertions** to the existing manifest/integration tests:

```js
const wrapper = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const agentTeams = JSON.parse(readFileSync(new URL('../agent-teams-plugin/package.json', import.meta.url), 'utf8'))
const compatibility = JSON.parse(readFileSync(new URL('../agent-teams-plugin/compatibility.json', import.meta.url), 'utf8'))
const sourceRecord = readFileSync(new URL('../../docs/UPSTREAM_020_SOURCE_MANIFEST.md', import.meta.url), 'utf8')
assert.equal(wrapper.version, '0.2.0-rc.2')
assert.equal(agentTeams.version, '0.1.22-desktop.1')
assert.equal(compatibility.recommendedHost, '0.2.0-rc.2')
assert.match(sourceRecord, /639ed015397290b3745d163aafe02ffee4aa3f84/u)
```

Run the focused manifest tests; Expected: FAIL until all metadata is synchronized. Update version text, lockfile references, release notes and provenance only after corresponding source and tests exist.

- [ ] **Step 3: Run the complete gate.** From `win-desktop`, run `npm run verify:upstream`. Expected: exit 0 without network, install, package or weakened regression. Run `git diff --check`, an exact-path sensitive-value scan, `git status --porcelain=v1 -uall`, and the package-closure verifier. Confirm the 174-path pre-existing baseline remains preserved, no runtime data or installer was staged, and all new changes are attributable to this plan.

- [ ] **Step 4: Report precise evidence.** State tested source behavior separately from packaged-app, live provider, overnight and user acceptance. Leave the checkout and any user-owned untracked files intact. If the gate cannot pass, report the exact failure and do not claim the migration complete.
