# CPA Per-Model Capacity Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users enter optional raw decimal `contextWindow` and `maxTokens` values independently for every CPA model.

**Architecture:** Keep persisted/discovered model capacities numeric, but keep editable capacity text in a separate client-only `Map` so blank and temporarily invalid input survive rendering. A pure parser converts drafts to model candidates immediately before the existing profile save path. The CPA card owns presentation; the existing profile builder remains the persistence authority.

**Tech Stack:** TypeScript, React 18, Node test runner, CSS modules, Harness Models settings API.

## Global Constraints

- Values display and persist as raw base-10 integers such as `1050000`; no K/M conversion or separators.
- No model-name inference or automatic GPT-family defaults.
- `contextWindow` and `maxTokens` are independently optional; blank omits the property and preserves provider fallback.
- Non-blank values must be safe positive decimal integers.
- Existing endpoint, credential, model selection, reasoning, and retry behavior remains unchanged.

---

### Task 1: Add pure capacity draft parsing

**Files:**
- Create: `win-desktop/cpa-provider-plugin/src/client/capacity.ts`
- Create: `win-desktop/cpa-provider-plugin/tests/capacity.test.js`

**Interfaces:**
- Produces: `capacityDraftsFromModels()`, `mergeCapacityDrafts()`, `applyCapacityDrafts()`, `CpaCapacityField`, and `CpaCapacityDraft`.
- Consumes: `CpaModelCandidate` from `src/types.ts`.

- [ ] **Step 1: Write failing parser tests**

Create assertions for exact values, independent blanks, invalid formats, and discovery merge:

```js
import { applyCapacityDrafts, capacityDraftsFromModels, mergeCapacityDrafts } from '../lib/client/capacity.js'

const models = [{ id: 'gpt-5.6-sol', selected: true }]
const valid = new Map([['gpt-5.6-sol', { contextWindow: '1050000', maxTokens: '128000' }]])
assert.deepEqual(applyCapacityDrafts(models, valid), {
  ok: true,
  models: [{ id: 'gpt-5.6-sol', selected: true, contextWindow: 1050000, maxTokens: 128000 }],
})

assert.deepEqual(applyCapacityDrafts(models, new Map([['gpt-5.6-sol', {
  contextWindow: '', maxTokens: '128000',
}]])), {
  ok: true,
  models: [{ id: 'gpt-5.6-sol', selected: true, maxTokens: 128000 }],
})

for (const value of ['0', '-1', '+1', '1.5', '1e6', '1,000', '1 000', '9007199254740992']) {
  const result = applyCapacityDrafts(models, new Map([['gpt-5.6-sol', {
    contextWindow: value, maxTokens: '',
  }]]))
  assert.deepEqual(result, { ok: false, modelId: 'gpt-5.6-sol', field: 'contextWindow' })
}
```

Also assert that existing text survives discovery that omits capacity while a new discovered model receives its exact returned numbers.

- [ ] **Step 2: Build to prove RED**

Run: `pnpm build`

Expected: FAIL because `src/client/capacity.ts` does not exist.

- [ ] **Step 3: Implement the pure draft module**

Use the following shapes and parser:

```ts
export type CpaCapacityField = 'contextWindow' | 'maxTokens'
export interface CpaCapacityDraft { contextWindow: string; maxTokens: string }
export type CpaCapacityDrafts = ReadonlyMap<string, CpaCapacityDraft>

function parseCapacity(value: string): number | undefined | false {
  if (value === '') return undefined
  if (!/^[0-9]+$/.test(value)) return false
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : false
}

export function applyCapacityDrafts(
  models: readonly CpaModelCandidate[],
  drafts: CpaCapacityDrafts,
): { ok: true; models: CpaModelCandidate[] } | { ok: false; modelId: string; field: CpaCapacityField } {
  // Copy every candidate, parse the matching draft, omit blank fields, and
  // return the first model/field validation failure without mutating inputs.
}
```

`capacityDraftsFromModels()` stringifies only existing numeric values.
`mergeCapacityDrafts()` clones the current map and adds only missing model ids,
so user-entered text wins over later discovery.

- [ ] **Step 4: Build and run the focused test**

Run:

```powershell
pnpm build
node --test tests/capacity.test.js
```

Expected: all capacity tests pass.

- [ ] **Step 5: Commit**

```powershell
git add win-desktop/cpa-provider-plugin/src/client/capacity.ts win-desktop/cpa-provider-plugin/tests/capacity.test.js
git add -f win-desktop/cpa-provider-plugin/lib/client/capacity.js win-desktop/cpa-provider-plugin/lib/types/client/capacity.d.ts
git commit -m "feat: parse CPA model capacities"
```

### Task 2: Add raw capacity fields to the CPA card

**Files:**
- Modify: `win-desktop/cpa-provider-plugin/src/client/CpaProviderCard.tsx`
- Modify: `win-desktop/cpa-provider-plugin/src/client/CpaProviderCard.module.css`
- Modify: `win-desktop/cpa-provider-plugin/src/client/locales.ts`
- Modify: `win-desktop/cpa-provider-plugin/src/client/index.tsx`
- Modify: `win-desktop/cpa-provider-plugin/tests/client-registration.test.js`
- Modify: `win-desktop/cpa-provider-plugin/tests/profile.test.js`

**Interfaces:**
- Consumes: Task 1 draft/parser functions.
- Produces: two raw text inputs per model and localized validation feedback.

- [ ] **Step 1: Add failing client/source assertions**

Assert the card source contains `inputMode="numeric"`, `contextWindow`,
`maxTokens`, and calls `applyCapacityDrafts`; assert locale dictionaries expose
`modelContextWindow`, `modelMaxTokens`, and `capacityInvalid`.

Update the profile merge test so configured capacities survive discovery:

```js
assert.deepEqual(mergeCpaCandidates(
  [{ id: 'same', contextWindow: 1050000, maxTokens: 128000, selected: true }],
  [{ id: 'same', name: 'Fresh name', selected: true }],
), [{ id: 'same', name: 'Fresh name', contextWindow: 1050000, maxTokens: 128000, selected: true }])
```

- [ ] **Step 2: Run tests to prove RED**

Run: `pnpm test`

Expected: FAIL on missing capacity UI/locale contract and lost merge capacities.

- [ ] **Step 3: Preserve configured capacities during discovery**

In `mergeCpaCandidates()`, merge a discovered row over the configured row but
restore `contextWindow`/`maxTokens` from configured when discovery omits them.

- [ ] **Step 4: Wire form state and save validation**

In the card:

```ts
const [capacities, setCapacities] = useState<Map<string, CpaCapacityDraft>>(new Map())

// initialization
setModels(view.models)
setCapacities(capacityDraftsFromModels(view.models))

// discovery
setModels(current => mergeCpaCandidates(current, found))
setCapacities(current => mergeCapacityDrafts(current, found))

// save
const parsed = applyCapacityDrafts(models, capacities)
if (!parsed.ok) {
  const field = cpaT(parsed.field === 'contextWindow' ? 'modelContextWindow' : 'modelMaxTokens')
  setOperation({ kind: 'error', stage: 'profile', message: `${parsed.modelId}: ${field} ${cpaT('capacityInvalid')}` })
  return
}
await cpa.save({ baseURL, token, models: parsed.models }, ...)
```

Add an immutable `editCapacity(modelId, field, value)` map update.

- [ ] **Step 5: Render accessible raw inputs**

Replace the nested all-row label with a model container, identity label, and a
two-column capacity grid. Each capacity input uses `type="text"`,
`inputMode="numeric"`, the exact draft string, and no K/M formatter.

Update `cpaT` to accept only existing keys; compose the model id/field outside
the locale function as shown above.

- [ ] **Step 6: Run plugin tests**

Run: `pnpm test`

Expected: CPA build and all Node tests pass.

- [ ] **Step 7: Commit**

Commit source, tests, and tracked generated `lib` outputs:

```powershell
git commit -m "feat: edit CPA model capacities"
```

### Task 3: Integrate the local CPA package

**Files:**
- Modify: `win-desktop/cpa-provider-plugin/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/tests/cpa-provider-integration.test.js`

**Interfaces:**
- Produces: installed local package version `0.1.1` with the new card bundle.

- [ ] **Step 1: Change integration expectations to `0.1.1` and prove RED**

Assert both local metadata and `package-lock.json` report `0.1.1`; run the CPA
integration test and expect `.0` failures.

- [ ] **Step 2: Bump metadata and synchronize the local installed copy**

Set the CPA package and lock entry to `0.1.1`. Build the plugin, then copy its
`package.json` and published `lib` directory into
`win-desktop/node_modules/@deepseek-ai/dsh-cpa-provider` without copying source,
tests, credentials, or endpoint configuration.

- [ ] **Step 3: Run integration tests**

Run:

```powershell
node --test tests/cpa-provider-integration.test.js
npm test
```

Expected: integration and the complete desktop suite pass.

- [ ] **Step 4: Commit**

```powershell
git commit -m "chore: release CPA provider 0.1.1"
```
