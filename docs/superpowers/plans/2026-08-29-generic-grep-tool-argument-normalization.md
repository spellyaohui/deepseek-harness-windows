# Generic grep Tool Argument Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the unambiguous `grep` argument alias `{ description: "pattern: ..." }` for every pi-ai provider and model without weakening the upstream `pattern` requirement.

**Architecture:** The Windows ESM loader continues to own compatibility rewrites for installed upstream modules. A pure provider-neutral normalizer and one idempotent source rewrite are injected at `dsh-llm-pi-ai`'s final `toolcall_end` conversion boundary, before the Harness durable assistant message and Agent Loop consume the call.

**Tech Stack:** Node.js ESM, Node test runner, source-to-source string rewrites, DeepSeek Harness `dsh-llm-pi-ai` and `dsh-tool-fs-search` packages.

## Global Constraints

- Apply the rule to all providers and models; do not inspect provider IDs or model IDs.
- Convert only tool name `grep` when the argument object lacks its own `pattern` and `description` wholly matches one single-line `pattern: <non-empty value>` alias.
- Preserve `path`, `include`, and unknown sibling fields; remove `description` only after a successful conversion; do not mutate the input object.
- Never overwrite an existing `pattern` and never relax the upstream `grep.pattern` required field.
- Leave non-matching, empty, multiline, non-object, non-`grep`, and otherwise malformed arguments unchanged for strict validation.
- Do not add a model-level compatibility toggle or provider-specific branch.
- Do not implement Responses/Chat Completions protocol selection.
- Preserve the independent model image input choices `auto`, `image`, and `text-only` and their regressions.
- Do not directly edit installed `node_modules`; use `win-hide-console-rewrite.js` and its existing ESM loader.
- Run `npm run verify:upstream` from `win-desktop` before packaging; do not weaken or skip a failing regression.

---

### Task 1: Replace the provider-specific prototype with the generic normalization contract

**Files:**
- Delete: `win-desktop/tests/gemini-grep-compatibility.test.js`
- Create: `win-desktop/tests/grep-tool-argument-compatibility.test.js`
- Modify: `win-desktop/src/win-hide-console-rewrite.js`

**Interfaces:**
- Consumes: final pi-ai events shaped as `{ toolCall: { name: string, arguments: unknown } }` at `toStreamChunks()`.
- Produces: `normalizeKnownToolArgumentAliases(toolName, args)` and `rewriteKnownToolArgumentAliases(source)`; both return the original input when no registered exact alias applies.

- [ ] **Step 1: Replace the prototype test with a provider-neutral failing contract**

Create `win-desktop/tests/grep-tool-argument-compatibility.test.js` with imports for the new generic functions and cases equivalent to:

```js
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeKnownToolArgumentAliases,
  rewriteDesktopConsoleSource,
  rewriteKnownToolArgumentAliases,
} from '../src/win-hide-console-rewrite.js'

const adapterUrl = new URL('../node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js', import.meta.url)
const adapterSource = readFileSync(adapterUrl, 'utf8')
const grepSource = readFileSync(
  new URL('../node_modules/@deepseek-ai/dsh-tool-fs-search/lib/index.js', import.meta.url),
  'utf8',
)

test('repairs the exact grep description alias without provider or model routing', () => {
  for (const route of ['woyaopro/gemini', 'cpa/gemini', 'future-provider/future-model']) {
    const malformed = {
      description: 'pattern: 请稍后重试',
      path: 'frontend/src',
      include: '*.tsx',
      route,
    }
    assert.deepEqual(normalizeKnownToolArgumentAliases('grep', malformed), {
      pattern: '请稍后重试',
      path: 'frontend/src',
      include: '*.tsx',
      route,
    })
    assert.equal(malformed.description, 'pattern: 请稍后重试')
  }
})

test('leaves every ambiguous or non-target shape for strict validation', () => {
  const valid = { pattern: '登录超时', description: 'pattern: wrong' }
  assert.equal(normalizeKnownToolArgumentAliases('grep', valid), valid)
  for (const [toolName, args] of [
    ['find', { description: 'pattern: 登录超时' }],
    ['grep', { description: 'search for 登录超时' }],
    ['grep', { description: 'pattern:   ' }],
    ['grep', { description: 'pattern: 登录超时\npath: frontend/src' }],
    ['grep', null],
    ['grep', []],
  ]) {
    assert.equal(normalizeKnownToolArgumentAliases(toolName, args), args)
  }
})

test('the upstream grep schema still requires pattern', () => {
  assert.match(grepSource, /pattern:\s*\{\s*type: "string",\s*required: true,/)
})
```

Retain the prototype's installed-source rewrite/idempotence and loader-import checks, but assert that the rewritten source calls only:

```js
normalizeKnownToolArgumentAliases(event.toolCall.name, event.toolCall.arguments)
```

and that `toStreamChunks(events, contextWindow)` plus its call site remain unchanged. Delete the old provider-named test file in the same patch.

- [ ] **Step 2: Run the focused test and verify RED**

Run from `win-desktop`:

```powershell
node --test tests/grep-tool-argument-compatibility.test.js
```

Expected: FAIL because `normalizeKnownToolArgumentAliases` and `rewriteKnownToolArgumentAliases` are not exported, or because the current prototype still requires WOYAOPRO/Gemini model metadata.

- [ ] **Step 3: Implement the generic immutable normalizer**

In `win-desktop/src/win-hide-console-rewrite.js`, replace the provider-specific helper with:

```js
export function normalizeKnownToolArgumentAliases(toolName, args) {
  if (toolName !== 'grep') return args
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return args
  if (Object.prototype.hasOwnProperty.call(args, 'pattern')) return args

  const description = args.description
  if (typeof description !== 'string') return args
  const match = /^[ \t]*pattern[ \t]*:[ \t]*([^\r\n]*\S)[ \t]*$/iu.exec(description)
  if (match === null) return args

  const normalized = { ...args, pattern: match[1] }
  delete normalized.description
  return normalized
}
```

Remove all provider/model checks and do not add a settings flag.

- [ ] **Step 4: Simplify the installed-module rewrite**

Replace the prototype rewrite with `rewriteKnownToolArgumentAliases(source)`. Inject `normalizeKnownToolArgumentAliases.toString()` immediately before the existing:

```js
async function* toStreamChunks(events, contextWindow) {
```

and replace only:

```js
arguments: JSON.stringify(event.toolCall.arguments)
```

with:

```js
arguments: JSON.stringify(normalizeKnownToolArgumentAliases(event.toolCall.name, event.toolCall.arguments))
```

Do not change the `toStreamChunks` signature or thread `model` through its caller. Route the rewrite only for module URLs containing `@deepseek-ai/dsh-llm-pi-ai`. Return the source unchanged when the exact upstream needles are absent, and return an already-rewritten source byte-for-byte.

- [ ] **Step 5: Run focused and neighboring rewrite tests**

Run from `win-desktop`:

```powershell
node --test tests/grep-tool-argument-compatibility.test.js tests/win-hide-console.test.js tests/opencode-stream-rewrite.test.js
```

Expected: all tests pass; the actual installed adapter imports under the loader and all existing shell/OpenCode rewrites remain green.

- [ ] **Step 6: Commit the generic runtime slice**

```powershell
git add win-desktop/src/win-hide-console-rewrite.js win-desktop/tests/grep-tool-argument-compatibility.test.js
git add -u -- win-desktop/tests/gemini-grep-compatibility.test.js
git diff --staged --check
git diff --staged
git commit -m "fix: normalize exact grep argument aliases"
```

### Task 2: Register the compatibility invariant for future upstream refreshes

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`

**Interfaces:**
- Consumes: Task 1's `normalizeKnownToolArgumentAliases`, `rewriteKnownToolArgumentAliases`, and `grep-tool-argument-compatibility.test.js`.
- Produces: an upstream-maintenance ownership record and executable manifest checks that prevent deletion, provider scoping, schema relaxation, or accidental loss of the regression.

- [ ] **Step 1: Write failing capability-manifest assertions**

Add the test file to `requiredFiles`:

```js
'tests/grep-tool-argument-compatibility.test.js',
```

Add critical markers:

```js
assertContains('src/win-hide-console-rewrite.js', /normalizeKnownToolArgumentAliases/)
assertContains('src/win-hide-console-rewrite.js', /rewriteKnownToolArgumentAliases/)
assertContains('../AGENTS.md', /exact `grep` argument alias/)
assertContains('../docs/UPSTREAM_MAINTENANCE.md', /provider-neutral `grep` argument alias normalization/)
```

- [ ] **Step 2: Run the manifest test and verify RED**

Run from `win-desktop`:

```powershell
node --test tests/local-capability-manifest.test.js
```

Expected: FAIL on the missing AGENTS and maintenance-registry markers.

- [ ] **Step 3: Add the repository invariant**

In `AGENTS.md`, extend the Windows wrapper ownership/invariant text with these binding requirements:

- before the Agent Loop receives a pi-ai tool call, the wrapper may normalize the exact `grep` argument alias only when `pattern` is absent and `description` wholly matches one single-line `pattern: <non-empty value>` form;
- the rule is provider-neutral and model-neutral;
- existing `pattern` is never overwritten, other malformed arguments remain strict failures, and the upstream grep Schema stays required;
- future upstream refreshes must retain the dedicated regression or prove an `UPSTREAM_EQUIVALENT` implementation.

Keep the image-input tri-state and existing OpenCode/AgentTeams invariants unchanged.

- [ ] **Step 4: Update the maintenance registry**

In the Windows wrapper ownership row of `docs/UPSTREAM_MAINTENANCE.md`, add provider-neutral `grep` argument alias normalization at the `dsh-llm-pi-ai` durable boundary, name `tests/grep-tool-argument-compatibility.test.js` as required evidence, and state that no provider/model routing or optional settings toggle owns the behavior.

- [ ] **Step 5: Run focused ownership regressions**

Run from `win-desktop`:

```powershell
node --test tests/local-capability-manifest.test.js tests/grep-tool-argument-compatibility.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Commit the maintenance contract**

```powershell
git add AGENTS.md docs/UPSTREAM_MAINTENANCE.md win-desktop/tests/local-capability-manifest.test.js
git diff --staged --check
git diff --staged
git commit -m "docs: lock generic grep compatibility invariant"
```

### Task 3: Run the wrapper acceptance gate and review the combined scope

**Files:**
- Verify: `win-desktop/src/win-hide-console-rewrite.js`
- Verify: `win-desktop/tests/grep-tool-argument-compatibility.test.js`
- Verify: existing model image input source/tests and generated plugin artifacts without deleting or weakening them.

**Interfaces:**
- Consumes: Tasks 1-2 plus the already in-progress model image capability work.
- Produces: fresh full-gate evidence and a reviewed diff ready to join the later rc.27 version/provenance and packaging work.

- [ ] **Step 1: Run the mandatory full upstream regression gate**

Run from `win-desktop`:

```powershell
npm run verify:upstream
```

Expected: every local plugin build/test and wrapper regression group exits 0; the command performs no install, publish, package, or network operation.

- [ ] **Step 2: Verify the model image tri-state remains present**

Run from `win-desktop` after the gate synchronizes local artifacts:

```powershell
node --test models-settings-plugin/tests/model-input.test.js models-settings-plugin/tests/model-input-ui.test.js tests/local-plugin-artifacts.test.js
```

Expected: automatic, image, and text-only model states plus synchronized Models plugin artifacts all pass.

- [ ] **Step 3: Inspect repository scope and formatting**

Run from the repository root:

```powershell
git status --short --branch
git diff --check
git diff --stat
```

Expected: no conflict markers or whitespace errors; no `dist`, credentials, sessions, screenshots, logs, `.agent-teams`, or the untracked `SFConflict` document are staged or committed.

- [ ] **Step 4: Conduct correctness and architecture review**

Review the complete grep change for:

- exact spec match and no provider/model branches;
- immutable argument handling and preservation of siblings;
- no `toStreamChunks` signature change;
- rewrite idempotence and fail-closed behavior when upstream needles drift;
- retained strict `grep.pattern` Schema evidence;
- no changes to protocol selection, CPA ownership, AgentTeams behavior, OpenCode compatibility, or image-input tri-state semantics.

Resolve every Critical or Important finding and rerun the covering tests before reporting completion.

- [ ] **Step 5: Record release coordination**

Do not build an installer in this plan. Carry the verified grep fix into the existing model-image rc.27 release task, where README update notes, wrapper/Models versions, lockfile identities, final `dist:win`, artifact hashes, GitHub tag, and Release assets are synchronized together after user acceptance.

## Self-review record

- Spec coverage: Task 1 implements every conversion and strict-failure condition; Task 2 locks ownership and future-refresh behavior; Task 3 proves the whole wrapper and independent image tri-state remain intact.
- Placeholder scan: no deferred implementation placeholder is used; every code-bearing step names exact functions, files, commands, and expected outcomes.
- Type consistency: every task uses `normalizeKnownToolArgumentAliases(toolName, args)` and `rewriteKnownToolArgumentAliases(source)` with unchanged original-input fallbacks.
