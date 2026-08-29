# Model Image Capability Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-neutral per-model image-input controls with safe automatic fallback, explicit image/text overrides, and provider-scoped bulk actions, then ship a regression-tested Windows rc.27 installer and portable ZIP.

**Architecture:** Keep persistence on pi-ai's existing model-level `input` field and isolate the three-state mapping in a pure client helper. The Models settings fork renders and validates the controls without CPA, OpenCode, or `woyaopro` branches; CPA normalization and the Windows OpenCode catalog remain independent lower-level capability sources. Existing profile records stay structurally open, so only `input` changes when the user touches this control.

**Tech Stack:** TypeScript 5.9, React 18, CSS Modules, Node.js `node:test`, pnpm plugin builds, npm Windows wrapper regression/build scripts, Electron Builder/NSIS.

## Global Constraints

- Persist `auto` by deleting `model.input`, `image` as `['text', 'image']`, and `text-only` as `['text']`.
- Missing or empty `input` means automatic; a valid non-empty list containing `image` means image; a valid text-only list means text-only.
- Reject malformed `input` values without filtering, clearing, or silently downgrading them.
- Preserve every unedited model field, including protocol, capacities, reasoning, cost, and compat records.
- Do not add CPA, OpenCode, `woyaopro`, or model-name heuristics to the Models settings fork.
- Do not expand `llm.models` or `llm.discoverModels`, probe models with paid image requests, or add an old-format migration layer.
- Unknown automatic models remain fail-closed through pi-ai's text-only default; manual model-level declarations win over installed catalogs and provider defaults.
- Preserve all existing rc.26 AgentTeams, CPA, OpenCode, Desktop Settings, Session Markdown, Windows wrapper, and provenance changes in the dirty worktree.
- Keep the untracked `SFConflict` document and all unknown files untouched and out of commits.
- Models settings fork release is `0.1.1-rc.2-desktop.3`; Windows wrapper release is `0.1.1-rc.27`.
- Run `npm run verify:upstream` from `win-desktop` before any release build; do not skip or weaken a failing regression.

---

### Task 1: Freeze the three-state model-input contract

**Files:**
- Create: `win-desktop/models-settings-plugin/src/client/model-input.ts`
- Create: `win-desktop/models-settings-plugin/tests/model-input.test.js`

**Interfaces:**
- Consumes: structurally open `Readonly<Record<string, unknown>>` model rows.
- Produces: `ImageInputChoice`, `ImageInputState`, `readImageInputChoice(model)`, `applyImageInputChoice(model, choice)`, and `applyImageInputChoiceToAll(models, choice)`.

- [ ] **Step 1: Write failing pure-function tests**

```js
import {
  applyImageInputChoice,
  applyImageInputChoiceToAll,
  readImageInputChoice,
} from '../lib/client/model-input.js'

test('missing and empty input use automatic resolution', () => {
  assert.equal(readImageInputChoice({ id: 'unset' }), 'auto')
  assert.equal(readImageInputChoice({ id: 'empty', input: [] }), 'auto')
})

test('valid explicit input lists map to image or text-only', () => {
  assert.equal(readImageInputChoice({ input: ['text', 'image'] }), 'image')
  assert.equal(readImageInputChoice({ input: ['image', 'text'] }), 'image')
  assert.equal(readImageInputChoice({ input: ['text'] }), 'text-only')
})

test('invalid input is reported instead of normalized', () => {
  for (const input of [null, 'image', ['audio'], ['text', 1]]) {
    assert.equal(readImageInputChoice({ input }), 'invalid')
  }
})

test('one-model edits preserve unknown fields and do not mutate the source', () => {
  const original = { id: 'vision', api: 'openai-responses', compat: { strict: false }, input: ['image', 'text'] }
  const changed = applyImageInputChoice(original, 'text-only')
  assert.deepEqual(changed, { ...original, input: ['text'] })
  assert.deepEqual(original.input, ['image', 'text'])
  assert.notEqual(changed, original)
})

test('automatic mode deletes only the model-level override', () => {
  assert.deepEqual(
    applyImageInputChoice({ id: 'known', input: ['text'], maxTokens: 8192 }, 'auto'),
    { id: 'known', maxTokens: 8192 },
  )
})

test('bulk operations affect every supplied row and preserve other fields', () => {
  const models = [{ id: 'a', marker: 1 }, { id: 'b', input: ['text'], marker: 2 }]
  assert.deepEqual(applyImageInputChoiceToAll(models, 'image'), [
    { id: 'a', marker: 1, input: ['text', 'image'] },
    { id: 'b', marker: 2, input: ['text', 'image'] },
  ])
  assert.deepEqual(applyImageInputChoiceToAll(models, 'auto'), [
    { id: 'a', marker: 1 },
    { id: 'b', marker: 2 },
  ])
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm build && node --test tests/model-input.test.js` in `win-desktop/models-settings-plugin`.

Expected: FAIL because `src/client/model-input.ts` / `lib/client/model-input.js` does not exist.

- [ ] **Step 3: Implement the minimal immutable mapping**

```ts
export type ModelInputDraft = Readonly<Record<string, unknown>>
export type ImageInputChoice = 'auto' | 'image' | 'text-only'
export type ImageInputState = ImageInputChoice | 'invalid'

function isModality(value: unknown): value is 'text' | 'image' {
  return value === 'text' || value === 'image'
}

export function readImageInputChoice(model: ModelInputDraft): ImageInputState {
  const input = model['input']
  if (input === undefined) return 'auto'
  if (!Array.isArray(input)) return 'invalid'
  if (input.length === 0) return 'auto'
  if (!input.every(isModality)) return 'invalid'
  return input.includes('image') ? 'image' : 'text-only'
}

export function applyImageInputChoice(
  model: ModelInputDraft,
  choice: ImageInputChoice,
): Record<string, unknown> {
  const next = { ...model }
  if (choice === 'auto') Reflect.deleteProperty(next, 'input')
  else next['input'] = choice === 'image' ? ['text', 'image'] : ['text']
  return next
}

export function applyImageInputChoiceToAll(
  models: readonly ModelInputDraft[],
  choice: ImageInputChoice,
): Record<string, unknown>[] {
  return models.map(model => applyImageInputChoice(model, choice))
}
```

- [ ] **Step 4: Run the focused test and plugin typecheck**

Run: `pnpm build && node --test tests/model-input.test.js && pnpm typecheck`.

Expected: all model-input tests pass and both TypeScript projects exit 0.

- [ ] **Step 5: Commit the pure contract**

```powershell
git add win-desktop/models-settings-plugin/src/client/model-input.ts win-desktop/models-settings-plugin/tests/model-input.test.js
git diff --staged
git commit -m "feat: add model image input override contract"
```

### Task 2: Validate and render per-model image choices

**Files:**
- Modify: `win-desktop/models-settings-plugin/src/client/DeepSeekModelsEditor.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/ModelListEditor.tsx`
- Modify: `win-desktop/models-settings-plugin/src/client/locales.ts`
- Modify: `win-desktop/models-settings-plugin/src/client/ModelsSection.module.css`
- Create: `win-desktop/models-settings-plugin/tests/model-input-ui.test.js`

**Interfaces:**
- Consumes: Task 1 `ImageInputChoice`, `readImageInputChoice`, `applyImageInputChoice`, and `applyImageInputChoiceToAll`.
- Produces: a save-blocking `modelInputInvalid` validation key, one accessible three-state select per pi-ai model, and provider-local unsaved bulk actions.

- [ ] **Step 1: Write failing validation and static UI contract tests**

```js
test('model validation accepts automatic and supported modality lists', () => {
  for (const input of [undefined, [], ['text'], ['image'], ['image', 'text']]) {
    const model = input === undefined ? { id: 'model' } : { id: 'model', input }
    assert.equal(validateDeepSeekModels([model]), undefined)
  }
})

test('model validation rejects malformed modality lists', () => {
  for (const input of [null, 'image', ['audio'], ['text', 1]]) {
    assert.deepEqual(validateDeepSeekModels([{ id: 'model', input }]), {
      index: 0,
      key: 'modelInputInvalid',
    })
  }
})

test('pi-ai model rows expose provider-neutral image controls and bulk actions', () => {
  assert.match(editor, /readImageInputChoice/)
  assert.match(editor, /applyImageInputChoiceToAll\(models, 'image'\)/)
  assert.match(editor, /applyImageInputChoiceToAll\(models, 'auto'\)/)
  assert.match(editor, /aria-invalid/)
  assert.doesNotMatch(editor, /woyaopro|opencode|cpa/i)
  assert.match(locales, /modelImageAutoHint/)
  assert.match(locales, /无法确认时按仅文本处理/)
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm build && node --test tests/model-input.test.js tests/model-input-ui.test.js`.

Expected: FAIL on the missing validation key and missing controls.

- [ ] **Step 3: Extend save validation without normalizing bad data**

Import `readImageInputChoice`, add `'modelInputInvalid'` to `DeepSeekModelsValidationFailure['key']`, and return that failure when a row's state is `invalid`. Do not mutate the row or filter its `input` list.

```ts
const inputChoice = readImageInputChoice(model)
if (inputChoice === 'invalid') return { index, key: 'modelInputInvalid' }
```

- [ ] **Step 4: Add the three-state control and bulk draft actions**

In each expanded pi-ai row, render a native `<select>` with `auto`, `image`, and `text-only` options. If the current row is invalid, render a disabled `invalid` option, set `aria-invalid`, and leave the malformed record untouched until the user explicitly selects a valid state. Route changes only through `applyImageInputChoice`; route bulk actions only through `applyImageInputChoiceToAll`.

```tsx
const imageChoice = readImageInputChoice(model)
<select
  className={`${styles['input']} ${styles['selectInput']} ${styles['modelInputChoice']}`}
  value={imageChoice}
  aria-invalid={imageChoice === 'invalid'}
  disabled={disabled}
  onChange={(event) => {
    const choice = event.target.value as ImageInputChoice
    onChange(models.map((entry, at) => at === index
      ? applyImageInputChoice(entry, choice)
      : entry))
  }}
>
  {imageChoice === 'invalid' ? <option value="invalid" disabled>{t('modelImageInvalid')}</option> : null}
  <option value="auto">{t('modelImageAuto')}</option>
  <option value="image">{t('modelImageSupported')}</option>
  <option value="text-only">{t('modelImageTextOnly')}</option>
</select>
```

The heading actions call:

```tsx
onClick={() => { onChange(applyImageInputChoiceToAll(models, 'image')) }}
onClick={() => { onChange(applyImageInputChoiceToAll(models, 'auto')) }}
```

- [ ] **Step 5: Add bilingual copy and token-based layout**

Add English/Chinese labels for image input, all three choices, invalid data, the three explanatory states, restart semantics, `Set all to image`, and `Restore all to auto`. Use the existing semantic tokens for `.modelListActions`, `.modelFieldHint`, and `.modelInputChoice`; keep native buttons and selects keyboard reachable and make the heading actions wrap at narrow widths.

- [ ] **Step 6: Run the plugin suite**

Run: `pnpm test && pnpm typecheck`.

Expected: build succeeds and every Models plugin test passes with no skipped test.

- [ ] **Step 7: Commit the complete settings-page slice**

```powershell
git add win-desktop/models-settings-plugin/src/client/DeepSeekModelsEditor.tsx win-desktop/models-settings-plugin/src/client/ModelListEditor.tsx win-desktop/models-settings-plugin/src/client/locales.ts win-desktop/models-settings-plugin/src/client/ModelsSection.module.css win-desktop/models-settings-plugin/tests/model-input-ui.test.js win-desktop/models-settings-plugin/lib
git diff --staged
git commit -m "feat: edit model image capability in settings"
```

### Task 3: Lock runtime ownership and cross-plugin regressions

**Files:**
- Modify: `win-desktop/tests/model-fetcher.test.js`
- Modify: `win-desktop/tests/cpa-provider-integration.test.js`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`
- Modify: `win-desktop/tests/local-plugin-artifacts.test.js`

**Interfaces:**
- Consumes: built Models fork, CPA normalization seam, OpenCode catalog hydration, and wrapper capability registry.
- Produces: proof that settings profile bytes survive OpenCode hydration, CPA keeps ownership of defaults, and the new Models owner/tests cannot disappear during an upstream refresh.

- [ ] **Step 1: Add a failing OpenCode profile-preservation regression**

Create a temporary settings profile containing both `input: [text, image]` and `input: [text]`, run `hydrateOpencodeCatalogFromSettings`, and assert the settings file is byte-for-byte unchanged. Also assert a newly hydrated unknown catalog entry remains `['text']`, proving the wrapper does not copy the manual profile override into its static catalog or erase it from the higher-precedence profile.

- [ ] **Step 2: Add integration and ownership assertions**

Assert the Models source/installed/lockfile versions agree, the built browser bundle contains the image-choice copy, CPA still registers only `normalize-provider-profile`, and the capability manifest requires `src/client/model-input.ts`, `tests/model-input.test.js`, and `tests/model-input-ui.test.js` plus their critical markers.

- [ ] **Step 3: Run focused wrapper regressions**

Run from `win-desktop`:

```powershell
node --test tests/model-fetcher.test.js tests/cpa-provider-integration.test.js tests/local-capability-manifest.test.js tests/local-plugin-artifacts.test.js
```

Expected: all selected tests pass after the Models plugin build artifacts have been synchronized.

- [ ] **Step 4: Commit runtime regression ownership**

```powershell
git add win-desktop/tests/model-fetcher.test.js win-desktop/tests/cpa-provider-integration.test.js win-desktop/tests/local-capability-manifest.test.js win-desktop/tests/local-plugin-artifacts.test.js
git diff --staged
git commit -m "test: preserve model image capability ownership"
```

### Task 4: Synchronize release identity and maintenance records

**Files:**
- Modify: `win-desktop/models-settings-plugin/package.json`
- Modify: `win-desktop/models-settings-plugin/README.md`
- Modify: `win-desktop/models-settings-plugin/README.zh.md`
- Modify: `win-desktop/models-settings-plugin/UPSTREAM.md`
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `AGENTS.md`
- Modify: wrapper tests that assert the wrapper release version.

**Interfaces:**
- Consumes: verified source and regressions from Tasks 1-3.
- Produces: Models fork `0.1.1-rc.2-desktop.3`, wrapper `0.1.1-rc.27`, user-facing update notes, and future-upstream invariants.

- [ ] **Step 1: Bump package and lockfile identities atomically**

Set the Models fork to `0.1.1-rc.2-desktop.3`; set root lock entry `node_modules/@deepseek-ai/dsh-client-ui-settings-models` to the same version; set wrapper package/lock root to `0.1.1-rc.27`. Update every wrapper test that intentionally pins the current wrapper version, without changing AgentTeams `0.1.14-desktop.9`.

- [ ] **Step 2: Document user-visible behavior and ownership**

Describe the per-model automatic/image/text-only selector, provider-scoped bulk actions, unknown-model text-only fallback, restart requirement, and field preservation in both READMEs. Update Models fork bilingual READMEs and `UPSTREAM.md` so future imports retain the provider-neutral tri-state editor. Add a dedicated rc.27 Models invariant section to `AGENTS.md`; keep the existing AgentTeams rc.26 section unchanged.

- [ ] **Step 3: Update the capability registry**

Set the wrapper and Models fork versions in `docs/UPSTREAM_MAINTENANCE.md`, expand the Models ownership row with model-level image controls and tests, and record that OpenCode hydration must never rewrite Provider profiles.

- [ ] **Step 4: Run version/provenance tests and inspect staged scope**

Run: `node --test tests/local-capability-manifest.test.js tests/local-plugin-artifacts.test.js tests/cpa-provider-integration.test.js tests/opencode-capabilities-integration.test.js` from `win-desktop`.

Expected: all version, artifact, ownership, and plugin-boundary checks pass.

- [ ] **Step 5: Commit the release metadata**

Stage only the intended rc.27 package, lockfile, docs, tests, and generated Models artifacts; inspect `git diff --staged` and a case-insensitive secret scan before committing.

```powershell
git commit -m "chore: prepare rc27 model capability release"
```

### Task 5: Full acceptance gate, review, and Windows artifacts

**Files:**
- Verify: all tracked source/docs/tests.
- Generate but do not commit: `win-desktop/dist/DeepSeek-Harness-0.1.1-rc.27-windows-x64.exe`
- Generate but do not commit: `win-desktop/dist/DeepSeek-Harness-0.1.1-rc.27-windows-x64.zip`

**Interfaces:**
- Consumes: complete rc.27 working tree.
- Produces: fresh gate evidence, reviewed diffs, installable artifacts, sizes, and SHA-256 digests.

- [ ] **Step 1: Run the mandatory upstream regression gate**

Run: `npm run verify:upstream` from `win-desktop`.

Expected: every local plugin build/test and wrapper regression group reports PASS; no install, publish, package, or network step is invoked by the gate.

- [ ] **Step 2: Inspect generated changes and run a five-axis code review**

Compare `git status --short` and `git diff --check` against the pre-gate snapshot. Keep only expected committed Models `lib` artifacts, remove no user-owned file, and review correctness, readability, architecture boundaries, secrets, and performance. Resolve every Critical/Required finding and rerun the affected tests.

- [ ] **Step 3: Build the Windows installer and portable ZIP**

Run: `npm run dist:win` from `win-desktop` only after Step 1 is green.

Expected: Electron Builder exits 0 and produces both exact rc.27 artifact names.

- [ ] **Step 4: Verify artifact identity and integrity**

```powershell
$artifacts = Get-Item 'dist\DeepSeek-Harness-0.1.1-rc.27-windows-x64.exe','dist\DeepSeek-Harness-0.1.1-rc.27-windows-x64.zip'
$artifacts | Select-Object FullName,Length,LastWriteTime
$artifacts | Get-FileHash -Algorithm SHA256
```

Expected: both files exist, are non-empty and freshly timestamped, and each has a recorded SHA-256 digest. Open the ZIP listing and confirm `DeepSeek Harness.exe`, local Models plugin metadata, and its built client bundle are present.

- [ ] **Step 5: Final repository and release handoff**

Run `git status --short --branch`, `git log -8 --oneline`, and `git diff --check`. Do not commit `dist`, logs, screenshots, runtime sessions, credentials, the `SFConflict` file, or `.agent-teams`. Report exact tests, artifact paths/sizes/hashes, commits, and any remaining user-owned dirty files. Push/tag/GitHub Release only if the user's existing release authorization still applies and remote verification can be performed for the tag plus each uploaded asset.

## Self-review record

- Spec coverage: Tasks 1-2 cover three-state semantics, invalid values, field preservation, bilingual/accessibility copy, discovery adoption, and bulk controls; Task 3 covers OpenCode/CPA/runtime ownership; Tasks 4-5 cover provenance, full regression, and packaging.
- Placeholder scan: no deferred implementation placeholder is used; each code-bearing step supplies the exact contract or concrete edit.
- Type consistency: every UI and test consumer uses `ImageInputChoice`, `ImageInputState`, `readImageInputChoice`, `applyImageInputChoice`, and `applyImageInputChoiceToAll` with the signatures declared in Task 1.
