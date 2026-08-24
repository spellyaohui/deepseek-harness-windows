# Native CPA Settings and Desktop Autosave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show CPA exactly once through the native provider editor, preserve CPA-specific profile semantics through a provider-owned normalization seam, autosave the desktop close behavior, document the release, and publish `v0.1.1-rc.9`.

**Architecture:** The provider-neutral Models fork gains a synchronous waterfall extension that normalizes a provider draft immediately before validation and mutation. The CPA client plugin registers the only CPA-specific listener and enriches the native draft with its stable endpoint, credential, protocol, capacity, and reasoning semantics without rendering a dedicated card. The desktop plugin changes only its renderer state machine; Electron IPC and persistence remain the source of truth.

**Tech Stack:** TypeScript, React 18, Cordis client events, Node.js test runner, Electron IPC, electron-builder, GitHub CLI.

## Global Constraints

- The Models page renders `CPA / CLIProxyAPI` exactly once as the native configured-provider row.
- CPA remains on `openai-responses`, `CPA_API_KEY`, normalized `/v1`, and model-specific English R mappings.
- Raw positive integer `contextWindow` and `maxTokens` values remain unscaled in persisted profiles.
- Main-session and AgentTeams CPA model visibility must remain covered by regressions.
- The Desktop page contains only the close-window selector and saves on change with failure rollback.
- `AGENTS.md`, `docs/UPSTREAM_MAINTENANCE.md`, and README release notes must preserve these behaviors across upstream refreshes.
- Public Git history must exclude credentials, sessions, logs, screenshots, exports, installers, archives, generated package output, and local upstream checkouts.
- Release version and tag are `0.1.1-rc.9` / `v0.1.1-rc.9`.

---

### Task 1: Add a provider-neutral native-profile normalization seam

**Files:**
- Create: `win-desktop/models-settings-plugin/src/client/provider-profile.ts`
- Modify: `win-desktop/models-settings-plugin/src/client/index.ts`
- Modify: `win-desktop/models-settings-plugin/src/client/ModelsSection.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/ProviderEditor.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/CustomProviderCard.tsx`
- Test: `win-desktop/models-settings-plugin/tests/provider-profile.test.js`

**Interfaces:**
- Produces `ProviderProfileDraft`, `ProviderProfileNormalization`, and `ProviderProfileNormalizer`.
- Produces injected `normalizeProviderProfile(provider, value)` used by both existing-row and custom-provider writes.
- Consumed by the CPA client listener in Task 2.

- [ ] **Step 1: Write the failing normalizer test**

```js
test('provider normalization composes the registered transformer', () => {
  const normalized = normalizeProviderProfile(
    'cpa',
    { models: [{ id: 'gpt-5.6-sol' }] },
    (_provider, value) => ({ ok: true, value: { ...value, api: 'openai-responses' } }),
  )
  assert.equal(normalized.ok, true)
  assert.equal(normalized.value.api, 'openai-responses')
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- provider-profile` from `win-desktop/models-settings-plugin`.

Expected: FAIL because `provider-profile.ts` does not exist.

- [ ] **Step 3: Implement the provider-neutral types and identity fallback**

```ts
export type ProviderProfileDraft = Record<string, unknown>

export type ProviderProfileNormalization =
  | { ok: true; value: ProviderProfileDraft }
  | { ok: false; message: string }

export type ProviderProfileNormalizer = (
  provider: string,
  value: ProviderProfileDraft,
) => ProviderProfileNormalization

export function normalizeProviderProfile(
  provider: string,
  value: ProviderProfileDraft,
  normalize?: ProviderProfileNormalizer,
): ProviderProfileNormalization {
  return normalize?.(provider, value) ?? { ok: true, value }
}
```

- [ ] **Step 4: Declare and dispatch the Cordis waterfall**

Add an event payload whose `value` is replaceable and whose `failure` is optional:

```ts
export interface ProviderProfileNormalizationPayload {
  provider: string
  value: ProviderProfileDraft
  failure?: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'settings.models/normalize-provider-profile'(
      payload: ProviderProfileNormalizationPayload,
      next: () => ProviderProfileNormalizationPayload,
    ): ProviderProfileNormalizationPayload
  }
}
```

Construct `normalizeProviderProfile` in `apply(ctx)` with `ctx.waterfall(...)`, return `{ ok: false, message }` when a listener sets `failure`, and inject it into `ModelsSection`.

- [ ] **Step 5: Apply normalization before both native mutation paths**

In `ProviderEditor.applyOnce`, normalize the complete draft after generic `apiKeyEnv` materialization and before schema/model validation:

```ts
const normalized = normalizeProviderProfile(provider, next, props.normalizeProviderProfile)
if (!normalized.ok) return normalized.message
const normalizedNext = normalized.value
```

Use `normalizedNext` for validation and path ops. In `CustomProviderCard`, normalize the complete new custom-provider value before settings mutation and surface the returned message as the existing apply failure.

- [ ] **Step 6: Run Models tests and typecheck**

Run: `pnpm typecheck && pnpm test` from `win-desktop/models-settings-plugin`.

Expected: all tests pass.

- [ ] **Step 7: Commit the seam**

```powershell
git add -- win-desktop/models-settings-plugin
git commit -m "feat: add native provider profile normalization seam"
```

---

### Task 2: Move CPA configuration entirely into the native provider editor

**Files:**
- Modify: `win-desktop/cpa-provider-plugin/src/profile.ts`
- Modify: `win-desktop/cpa-provider-plugin/src/client/index.tsx`
- Delete: `win-desktop/cpa-provider-plugin/src/client/CpaProviderCard.tsx`
- Delete: `win-desktop/cpa-provider-plugin/src/client/CpaProviderCard.module.css`
- Delete: `win-desktop/cpa-provider-plugin/src/client/controller.ts`
- Delete: `win-desktop/cpa-provider-plugin/src/client/capacity.ts`
- Delete: `win-desktop/cpa-provider-plugin/src/client/view-model.ts`
- Delete: `win-desktop/cpa-provider-plugin/src/client/locales.ts`
- Modify: `win-desktop/cpa-provider-plugin/package.json`
- Modify: `win-desktop/cpa-provider-plugin/tests/client-registration.test.js`
- Modify: `win-desktop/cpa-provider-plugin/tests/profile.test.js`
- Modify: `win-desktop/tests/cpa-provider-integration.test.js`

**Interfaces:**
- Consumes Task 1 event `settings.models/normalize-provider-profile`.
- Produces `normalizeCpaProviderProfile(value)` and a client listener that applies it only to provider `cpa`.

- [ ] **Step 1: Write failing CPA native-profile tests**

```js
test('native CPA normalization preserves capacities and installs R mappings', () => {
  const value = normalizeCpaProviderProfile({
    baseURL: 'https://proxy.example',
    models: [{ id: 'gpt-5.6-sol', contextWindow: 1050000, maxTokens: 131072 }],
  })
  assert.equal(value.baseURL, 'https://proxy.example/v1')
  assert.equal(value.apiKeyEnv, 'CPA_API_KEY')
  assert.equal(value.api, 'openai-responses')
  assert.equal(value.models[0].contextWindow, 1050000)
  assert.equal(value.models[0].maxTokens, 131072)
  assert.deepEqual(Object.values(value.models[0].reasoningEfforts), [
    'none', 'low', 'medium', 'high', 'xhigh', 'max',
  ])
})
```

Update the client registration test to assert the source listens for the normalization event and does not contain `settings.models.card` or `id: 'cpa'` card registration.

- [ ] **Step 2: Run CPA tests and verify failure**

Run: `pnpm test` from `win-desktop/cpa-provider-plugin`.

Expected: FAIL because the native normalizer and listener are absent.

- [ ] **Step 3: Implement CPA-owned native normalization**

```ts
export function normalizeCpaProviderProfile(value: Record<string, unknown>): CpaProviderProfile {
  const baseURL = typeof value['baseURL'] === 'string' ? value['baseURL'] : ''
  const models = Array.isArray(value['models']) ? value['models'] : []
  return {
    ...value,
    displayName: 'CPA / CLIProxyAPI',
    apiKeyEnv: 'CPA_API_KEY',
    api: 'openai-responses',
    baseURL: normalizeCpaBaseURL(baseURL),
    models: models.map(model => {
      if (typeof model !== 'object' || model === null || Array.isArray(model)) return model
      const id = typeof model.id === 'string' ? model.id.trim() : ''
      return id === '' ? model : { ...model, id, reasoningEfforts: reasoningEffortsForModel(id) }
    }),
  }
}
```

Preserve unknown profile/model fields and raw capacities. Convert thrown URL errors into `payload.failure` in the client listener.

- [ ] **Step 4: Replace the dedicated card registration with the listener**

```ts
export function apply(ctx: ClientContext): void {
  ctx.on('settings.models/normalize-provider-profile', (payload, next) => {
    if (payload.provider !== 'cpa') return next()
    try {
      payload.value = normalizeCpaProviderProfile(payload.value)
      return next()
    } catch (error) {
      payload.failure = error instanceof Error ? error.message : String(error)
      return payload
    }
  })
}
```

Remove the unused dedicated-card UI files and unneeded locale/slot client injections.

- [ ] **Step 5: Update wrapper integration assertions**

Assert the installed CPA bundle contains the normalization event and contains no dedicated card registration. Retain assertions for package installation, redacted credentials, profile/reasoning tests, model capacity support, and AgentTeams catalog integration.

- [ ] **Step 6: Run CPA, Models, and wrapper integration tests**

Run:

```powershell
pnpm typecheck
pnpm test
node --test tests/cpa-provider-integration.test.js tests/agent-teams-integration.test.js
```

Expected: all tests pass and the CPA browser bundle has no duplicate card.

- [ ] **Step 7: Commit native-only CPA**

```powershell
git add -- win-desktop/cpa-provider-plugin win-desktop/tests/cpa-provider-integration.test.js
git commit -m "feat: use native Models editor for CPA"
```

---

### Task 3: Autosave the desktop close behavior

**Files:**
- Modify: `win-desktop/desktop-settings-plugin/lib/client.js`
- Modify: `win-desktop/tests/desktop-settings-plugin.test.js`

**Interfaces:**
- Continues to consume `window.dshDesktop.getSettings()` and `setSettings(patch)`.
- Produces immediate select-change persistence with rollback.

- [ ] **Step 1: Write failing integration assertions**

Add assertions that the client has no `保存设置` button, its select `onChange` invokes an async persistence function, the select is disabled while saving, success uses an accessible status, and failure restores the previous committed settings.

- [ ] **Step 2: Run the desktop settings test and verify failure**

Run: `node --test tests/desktop-settings-plugin.test.js` from `win-desktop`.

Expected: FAIL because the current client still renders the save button.

- [ ] **Step 3: Implement immediate persistence and rollback**

Replace draft-plus-button handling with:

```js
const persistCloseBehavior = async (closeBehavior) => {
  const previous = settings
  setSettings((current) => ({ ...current, closeBehavior }))
  setSaving(true)
  setMessage('正在保存…')
  try {
    const committed = await bridge.setSettings({ closeBehavior })
    setSettings(committed)
    setMessage('已保存')
  } catch (error) {
    setSettings(previous)
    setMessage(`保存失败：${String(error)}`)
  } finally {
    setSaving(false)
  }
}
```

Bind `onChange` to `void persistCloseBehavior(event.target.value)`, bind `disabled: saving`, delete button/action CSS and markup, and render the message with `role="status"`, `aria-live="polite"` or `role="alert"` for failure.

- [ ] **Step 4: Run desktop settings and wrapper tests**

Run: `node --test tests/desktop-settings-plugin.test.js tests/desktop-settings.test.js`.

Expected: all tests pass.

- [ ] **Step 5: Commit desktop autosave**

```powershell
git add -- win-desktop/desktop-settings-plugin/lib/client.js win-desktop/tests/desktop-settings-plugin.test.js
git commit -m "feat: autosave desktop close behavior"
```

---

### Task 4: Register regressions, versions, and release notes

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `win-desktop/models-settings-plugin/UPSTREAM.md`
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/cpa-provider-plugin/package.json`
- Modify: `win-desktop/desktop-settings-plugin/package.json`
- Modify: relevant version assertions in `win-desktop/tests/*.test.js`

**Interfaces:**
- Produces release identity `0.1.1-rc.9`, CPA plugin `0.1.2`, Desktop Settings plugin `0.1.1`, and Models fork `0.1.1-rc.2-desktop.2`.

- [ ] **Step 1: Add failing release/version assertions**

Update integration tests to expect the new wrapper and local package versions and the maintenance registry phrases `single native CPA provider row` and `desktop autosave`.

- [ ] **Step 2: Run targeted tests and verify failure**

Run: `node --test tests/cpa-provider-integration.test.js tests/desktop-settings-plugin.test.js tests/upstream-regression-gate.test.js`.

Expected: FAIL on old versions and missing registry text.

- [ ] **Step 3: Update versions and lockfile metadata**

Use `npm version 0.1.1-rc.9 --no-git-tag-version` in `win-desktop`, update local package versions, then run `npm install --package-lock-only --ignore-scripts` so local `file:` dependency records agree. Do not install or publish packages.

- [ ] **Step 4: Update governance and README release notes**

Add a top-level `v0.1.1-rc.9` update section describing:

- one native CPA provider row with expandable editing;
- desktop close behavior saved immediately;
- retained CPA R levels/capacities, AgentTeams explicit selection, session Markdown export, OpenCode stream recovery, and sandbox normalization;
- mandatory `npm run verify:upstream` preservation after upstream updates.

Update the capability registry ownership rows and required regressions. Record the generic normalization seam as the only intentional Models-fork difference.

- [ ] **Step 5: Run targeted tests**

Run: `node --test tests/cpa-provider-integration.test.js tests/desktop-settings-plugin.test.js tests/upstream-regression-gate.test.js`.

Expected: all tests pass.

- [ ] **Step 6: Commit release metadata**

```powershell
git add -- AGENTS.md README.md docs/UPSTREAM_MAINTENANCE.md win-desktop
git commit -m "docs: prepare v0.1.1-rc.9 release"
```

---

### Task 5: Verify, build, review, merge, and publish

**Files:**
- Generated only, untracked: `win-desktop/dist/DeepSeek-Harness-0.1.1-rc.9-windows-x64.exe`
- Generated only, untracked: `win-desktop/dist/DeepSeek-Harness-0.1.1-rc.9-windows-x64.zip`

**Interfaces:**
- Produces public branch `main`, tag `v0.1.1-rc.9`, and GitHub Release assets.

- [ ] **Step 1: Run the complete regression gate**

Run from `win-desktop`:

```powershell
npm run verify:upstream
npm test
```

Expected: zero failures.

- [ ] **Step 2: Perform code and public-repository review**

Run `git diff origin/main...HEAD --check`, inspect every changed path, scan tracked content for credential-like values, and classify untracked files. Verify no `dist`, sessions, logs, screenshots, exported Markdown, credentials, or local upstream checkouts are staged.

- [ ] **Step 3: Build the Windows artifacts**

Run: `npm run dist:win` from `win-desktop`.

Expected: exit code 0 and both rc.9 assets exist with non-zero sizes.

- [ ] **Step 4: Verify artifact identity**

Record SHA-256 hashes with `Get-FileHash`, confirm filenames and package version, and inspect the packaged `resources/app/package.json` for `0.1.1-rc.9`.

- [ ] **Step 5: Integrate to main without dropping the root ignore commit**

Merge `feature/agentteams-and-session-export` into local `main`, preserving `d789e77` and all feature commits. Re-run `npm run verify:upstream` from the merged main worktree before pushing.

- [ ] **Step 6: Push source and tag**

```powershell
git push origin main
git tag -a v0.1.1-rc.9 -m "Release v0.1.1-rc.9"
git push origin v0.1.1-rc.9
```

- [ ] **Step 7: Create the GitHub Release and upload assets**

Use `gh release create v0.1.1-rc.9` with curated Chinese release notes from README and upload the `.exe` and `.zip`. Confirm `gh release view v0.1.1-rc.9` lists both assets.

- [ ] **Step 8: Final verification**

Confirm remote `main` and the tag resolve to the release commit, the GitHub Release is public, both asset sizes are non-zero, and source worktrees contain no staged or unknown sensitive files.
