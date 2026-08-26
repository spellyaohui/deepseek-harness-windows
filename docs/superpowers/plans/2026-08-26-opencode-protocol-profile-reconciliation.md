# OpenCode Protocol Profile Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route verified OpenCode Go models through their documented API transport before Harness starts, without retrying arbitrary server failures over another endpoint.

**Architecture:** `win-desktop/src/model-fetcher.js` gains a protocol-profile registry and a pure catalog reconciler. The reconciler moves known IDs into their documented API group and replaces only verified routing/capability fields. Startup invokes it before settings hydration and after live catalog synchronization; unknown IDs retain the existing Completions fallback.

**Tech Stack:** Node.js ESM, `node:test`, JSON catalogs, Electron Builder.

## Global Constraints

- Keep the repair in the Windows wrapper; do not change CPA, Models, AgentTeams, or Desktop Settings.
- Do not read, write, or expose credentials, API addresses, sessions, or runtime settings.
- Never retry a `500` through another protocol.
- Profile only `muse-spark-1.2-contributor`, `gpt-5.6-luna`, `qwen3.7-max`, and `qwen3.7-plus`.
- Keep unknown models on the existing generic Completions fallback.
- Bump wrapper version from `0.1.1-rc.12` to `0.1.1-rc.13`; do not push, tag, or publish before the user accepts the installer.
- Run `npm run verify:upstream` before package artifacts are produced.

---

### Task 1: Define and prove the pure reconciliation contract

**Files:**

- Modify: `win-desktop/tests/model-fetcher.test.js`
- Modify: `win-desktop/src/model-fetcher.js`

**Interfaces:**

- Produces: `OPENCODE_GO_PROTOCOL_PROFILES`, an immutable profile map keyed by model ID.
- Produces: `reconcileOpencodeCatalog(catalog)`, returning a repaired independent catalog.

- [ ] **Step 1: Write failing tests for all four documented mismatches**

```js
import { reconcileOpencodeCatalog } from '../src/model-fetcher.js'

test('reconciles every documented OpenCode transport mismatch exactly once', () => {
  const repaired = reconcileOpencodeCatalog(staleTransportFixture())
  assert.equal(repaired['openai-responses']['muse-spark-1.2-contributor'].api, 'openai-responses')
  assert.equal(repaired['openai-responses']['gpt-5.6-luna'].api, 'openai-responses')
  assert.equal(repaired['openai-completions']['qwen3.7-max'].api, 'openai-completions')
  assert.equal(repaired['openai-completions']['qwen3.7-plus'].api, 'openai-completions')
  assert.equal(countCatalogId(repaired, 'muse-spark-1.2-contributor'), 1)
})
```

- [ ] **Step 2: Write failing tests for unknown-model preservation and Muse metadata**

```js
test('preserves unknown models while applying the verified Muse profile', () => {
  const repaired = reconcileOpencodeCatalog(staleTransportFixture({ future: true }))
  assert.deepEqual(repaired['openai-completions']['future-model'], minimalModel('future-model'))
  assert.deepEqual(repaired['openai-responses']['muse-spark-1.2-contributor'].input, ['text', 'image'])
  assert.equal(repaired['openai-responses']['muse-spark-1.2-contributor'].contextWindow, 1048576)
})
```

- [ ] **Step 3: Run RED**

Run: `node --test tests/model-fetcher.test.js`

Expected: FAIL because `reconcileOpencodeCatalog` is not exported.

- [ ] **Step 4: Implement the smallest registry and pure reconciler**

```js
export const OPENCODE_GO_PROTOCOL_PROFILES = Object.freeze({
  'muse-spark-1.2-contributor': { api: 'openai-responses', input: ['text', 'image'] },
  'gpt-5.6-luna': { api: 'openai-responses', input: ['text', 'image'] },
  'qwen3.7-max': { api: 'openai-completions', input: ['text'] },
  'qwen3.7-plus': { api: 'openai-completions', input: ['text', 'image'] },
})
```

Remove a profiled ID from every API group, then insert it exactly once in the profile API group with verified metadata.

- [ ] **Step 5: Run GREEN and commit the slice**

Run: `node --test tests/model-fetcher.test.js`

Expected: PASS.

```bash
git add win-desktop/src/model-fetcher.js win-desktop/tests/model-fetcher.test.js
git commit -m "fix: reconcile OpenCode model protocols"
```

### Task 2: Reconcile every wrapper catalog input path

**Files:**

- Modify: `win-desktop/src/model-fetcher.js`
- Modify: `win-desktop/tests/model-fetcher.test.js`

**Interfaces:**

- Consumes: `reconcileOpencodeCatalog(catalog)` from Task 1.
- Produces: startup hydration and live synchronization that repair known profiles before returning model lists.

- [ ] **Step 1: Write a failing startup repair test**

```js
test('startup repair fixes stale static entries before settings hydration', () => {
  writeFileSync(catalogPath, JSON.stringify(staleTransportFixture()))
  hydrateOpencodeCatalogFromSettings({ catalogPath, settingsPath })
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  assert.equal(catalog['openai-responses']['muse-spark-1.2-contributor'].api, 'openai-responses')
})
```

- [ ] **Step 2: Run RED**

Run: `node --test tests/model-fetcher.test.js`

Expected: FAIL because hydration currently only adds missing entries.

- [ ] **Step 3: Apply reconciliation before hydration and after live sync**

Read the catalog, call the pure reconciler, and write only when its serialized JSON changed. Keep the current unavailable-endpoint fallback unchanged.

- [ ] **Step 4: Run GREEN and commit the slice**

Run: `node --test tests/model-fetcher.test.js`

Expected: PASS; known mismatches repair and an unknown live ID remains Completions.

```bash
git add win-desktop/src/model-fetcher.js win-desktop/tests/model-fetcher.test.js
git commit -m "fix: repair OpenCode protocols before startup"
```

### Task 3: Synchronize release metadata and retained regression coverage

**Files:**

- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `AGENTS.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`

- [ ] **Step 1: Update the root package and root lockfile identity to `0.1.1-rc.13`**

- [ ] **Step 2: Add a user-facing release note**

State that documented OpenCode Go profiles are repaired before startup, Responses models cannot accidentally use Completions, and unknown models remain unchanged.

- [ ] **Step 3: Add the Windows-wrapper ownership and upstream `REAPPLY` rule**

The future refresh gate must retain the protocol-profile tests until upstream DSH and Pi versions are demonstrably equivalent.

- [ ] **Step 4: Run focused regressions and commit metadata**

Run: `node --test tests/model-fetcher.test.js tests/local-capability-manifest.test.js`

Expected: PASS.

```bash
git add AGENTS.md README.md docs/UPSTREAM_MAINTENANCE.md win-desktop/package.json win-desktop/package-lock.json win-desktop/README.md win-desktop/tests/local-capability-manifest.test.js
git commit -m "docs: record OpenCode protocol reconciliation"
```

### Task 4: Verify and package the user-test installer

**Files:**

- Inspect: `win-desktop/dist/DeepSeek-Harness-0.1.1-rc.13-windows-x64.exe`
- Inspect: `win-desktop/dist/DeepSeek-Harness-0.1.1-rc.13-windows-x64.zip`

- [ ] **Step 1: Run the mandatory regression gate**

Run: `npm run verify:upstream`

Expected: every wrapper, CPA, Models, AgentTeams, Session Markdown, Desktop Settings, and OpenCode regression passes.

- [ ] **Step 2: Build without publishing**

Run: `npm run dist:win`

Expected: NSIS EXE and ZIP named `0.1.1-rc.13`; no upload.

- [ ] **Step 3: Inspect package contents and public diff**

Assert that the unpacked package has version `0.1.1-rc.13` and contains `reconcileOpencodeCatalog`, then run `git diff --check` and inspect every tracked change for secrets, runtime state, logs, screenshots, and package artifacts.

- [ ] **Step 4: Deliver only the local EXE for user testing**

Report the absolute path and SHA-256. Do not push, tag, create a Release, or upload an asset until the user reports the installer works.
