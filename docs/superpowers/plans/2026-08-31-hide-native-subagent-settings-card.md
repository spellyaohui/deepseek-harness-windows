# Hide Native Subagent Settings Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide only the official Subagent card from “插件 → 插件配置” while preserving the official Subagent Host namespace, saved settings, runtime dependencies, and every AgentTeams member operation.

**Architecture:** The existing Node ESM loader rewrites the official `@deepseek-ai/dsh-client-modules/lib/index.js` Host module at load time. Its initial and HMR artifact reads pass browser bundle bytes through one pure, package-ID-scoped function; for `@deepseek-ai/dsh-client-ui-settings-plugins` that function replaces the single Subagent card Slot key with an equal-length internal key that the Host does not serve, preserving source-map offsets and leaving every other bundle byte unchanged.

**Tech Stack:** Node.js ESM loader hooks, Alpha.2 client-module combo registry, JavaScript, Node test runner, Cordis keyed Slots, Markdown provenance records.

## Global Constraints

- Fixed official source: tag `dsh-v0.1.2-alpha.2`, commit `0a53fb55bea101816fa226bb964ae2bed71c343b`.
- Wrapper remains `0.1.2-rc.1`; this focused change does not create another release version.
- Do not modify official tarballs, ignored upstream checkout files, installed `node_modules`, or user settings.
- Keep `@deepseek-ai/dsh-subagent`, `dsh-subagent-fork-in-process`, `dsh-subagent-in-process-driver`, and `dsh-subagent-spawn-in-process` dependencies.
- Keep `memberProvider: spawn`, the independent `settings.section` with id `agent-teams`, and existing member spawn/followup/interrupt/recovery semantics.
- Do not add an old Team/Profile/conversation migration or repair layer. Existing `round: 0` Team state remains invalid; the user may delete only its exact `.agent-teams/<team-id>/` directory when history is no longer needed.
- Do not restore AUTO or Stop That Shit.
- Do not touch the unknown `SFConflict` files.
- Do not commit, push, tag, publish, release, upload, or package before the existing Alpha.2 acceptance boundary permits it.

---

### Task 1: Establish the focused failing regression

**Files:**
- Create: `win-desktop/tests/subagent-settings-card-visibility.test.js`
- Read: `win-desktop/node_modules/@deepseek-ai/dsh-client-ui-settings-plugins/lib/client.js`
- Read: `win-desktop/node_modules/@deepseek-ai/dsh-client-modules/lib/index.js`

**Interfaces:**
- Consumes: future exports `rewriteDesktopClientBundle(id, bundle)` and `rewriteDesktopClientModuleHostSource(source)` from `src/win-hide-console-rewrite.js`.
- Produces: RED coverage for target scoping, exact key replacement, equal byte length and line count, idempotence, anchor drift, initial snapshots, and HMR snapshots.

- [x] **Step 1: Create the focused test with exact Alpha.2 artifacts**

```javascript
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import {
  rewriteDesktopClientBundle,
  rewriteDesktopClientModuleHostSource,
  rewriteDesktopConsoleSource,
} from '../src/win-hide-console-rewrite.js'

const require = createRequire(import.meta.url)
const SETTINGS_PLUGIN_ID = '@deepseek-ai/dsh-client-ui-settings-plugins'
const SETTINGS_CLIENT_PATH = require.resolve(`${SETTINGS_PLUGIN_ID}/client`)
const CLIENT_MODULES_PATH = require.resolve('@deepseek-ai/dsh-client-modules')
const SUBAGENT_KEY = 'key: SUBAGENT_MODEL_SELECTION_NS,'
const HIDDEN_KEY = 'key: "__windows_hidden_subagent",'

const settingsClientSource = readFileSync(SETTINGS_CLIENT_PATH, 'utf8')
const clientModulesSource = readFileSync(CLIENT_MODULES_PATH, 'utf8')

function occurrences(source, marker) {
  return source.split(marker).length - 1
}

test('official Subagent card key is hidden without moving source-map offsets', () => {
  assert.equal(Buffer.byteLength(SUBAGENT_KEY), Buffer.byteLength(HIDDEN_KEY))
  assert.equal(occurrences(settingsClientSource, SUBAGENT_KEY), 1)
  const rewritten = rewriteDesktopClientBundle(SETTINGS_PLUGIN_ID, Buffer.from(settingsClientSource))
  const text = rewritten.toString('utf8')
  assert.equal(occurrences(text, SUBAGENT_KEY), 0)
  assert.equal(occurrences(text, HIDDEN_KEY), 1)
  assert.equal(Buffer.byteLength(text), Buffer.byteLength(settingsClientSource))
  assert.equal(text.split('\n').length, settingsClientSource.split('\n').length)
  for (const key of ['key: SHELL_NS,', 'key: AGENT_LOOP_NS,', 'key: WEB_SEARCH_NS,']) {
    assert.equal(occurrences(text, key), 1)
  }
  assert.deepEqual(rewriteDesktopClientBundle(SETTINGS_PLUGIN_ID, rewritten), rewritten)
})

test('non-target client bundles are returned by identity', () => {
  const bundle = Buffer.from(settingsClientSource)
  assert.equal(rewriteDesktopClientBundle('@fixture/other-client', bundle), bundle)
})

test('missing and duplicate Subagent card anchors fail closed', () => {
  assert.throws(
    () => rewriteDesktopClientBundle(SETTINGS_PLUGIN_ID, Buffer.from(settingsClientSource.replace(SUBAGENT_KEY, 'key: DRIFTED_SUBAGENT_KEY,'))),
    /Subagent settings card rewrite anchor drift/,
  )
  assert.throws(
    () => rewriteDesktopClientBundle(SETTINGS_PLUGIN_ID, Buffer.from(settingsClientSource.replace(SUBAGENT_KEY, `${SUBAGENT_KEY}\n${SUBAGENT_KEY}`))),
    /Subagent settings card rewrite anchor drift/,
  )
})

test('official client-modules Host snapshots rewrite initial and HMR bundle reads', () => {
  const rewritten = rewriteDesktopClientModuleHostSource(clientModulesSource)
  assert.match(rewritten, /function rewriteDesktopClientBundle\(id, bundle\)/)
  assert.match(rewritten, /rewriteDesktopClientBundle\(pkgName, readFileSync\(clientPath\)\)/)
  assert.match(rewritten, /rewriteDesktopClientBundle\(id, readFileSync\(record\.meta\.clientPath\)\)/)
  assert.equal(rewriteDesktopClientModuleHostSource(rewritten), rewritten)
  assert.equal(
    rewriteDesktopConsoleSource(clientModulesSource, pathToFileURL(CLIENT_MODULES_PATH).href),
    rewritten,
  )
  assert.equal(
    rewriteDesktopConsoleSource(clientModulesSource, 'file:///fixture/@deepseek-ai/dsh-client-modules/lib/invariant.js'),
    clientModulesSource,
  )
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run from `win-desktop`:

```powershell
node --test tests/subagent-settings-card-visibility.test.js
```

Expected: exit code nonzero because `src/win-hide-console-rewrite.js` does not yet export `rewriteDesktopClientBundle` and `rewriteDesktopClientModuleHostSource`.

### Task 2: Implement the package-scoped browser-bundle rewrite

**Files:**
- Modify: `win-desktop/src/win-hide-console-rewrite.js`
- Modify: `win-desktop/tests/fixtures/import-harness-under-guard.mjs`
- Test: `win-desktop/tests/subagent-settings-card-visibility.test.js`
- Test: `win-desktop/tests/win-hide-console.test.js`

**Interfaces:**
- Consumes: `(id: string, bundle: Buffer|string)` and the official compiled `dsh-client-modules/lib/index.js` source.
- Produces: `rewriteDesktopClientBundle(id, bundle): Buffer|string`, `rewriteDesktopClientModuleHostSource(source): string`, and integration through `rewriteDesktopConsoleSource`.

- [x] **Step 1: Add the self-contained client bundle transformer**

Add before `rewriteDesktopConsoleSource`:

```javascript
export function rewriteDesktopClientBundle(id, bundle) {
  const targetId = '@deepseek-ai/dsh-client-ui-settings-plugins'
  if (id !== targetId) return bundle

  const needle = 'key: SUBAGENT_MODEL_SELECTION_NS,'
  const patch = 'key: "__windows_hidden_subagent",'
  const source = Buffer.isBuffer(bundle) ? bundle.toString('utf8') : String(bundle)
  if (source.includes(patch)) return bundle

  const first = source.indexOf(needle)
  const unique = first !== -1 && source.indexOf(needle, first + needle.length) === -1
  if (!unique || Buffer.byteLength(needle) !== Buffer.byteLength(patch)) {
    throw new Error('Subagent settings card rewrite anchor drift')
  }
  const rewritten = source.replace(needle, patch)
  return Buffer.isBuffer(bundle) ? Buffer.from(rewritten) : rewritten
}
```

- [x] **Step 2: Add the exact Host artifact-read transformer**

Add beside the bundle transformer:

```javascript
export function rewriteDesktopClientModuleHostSource(source) {
  const marker = 'function rewriteDesktopClientBundle(id, bundle)'
  if (source.includes(marker)) return source

  const classNeedle = 'var ClientModuleRegistry = class extends Service {'
  const initialNeedle = 'const bundle = readFileSync(clientPath);'
  const rebuiltNeedle = 'const bundle = readFileSync(record.meta.clientPath);'
  const unique = needle => {
    const first = source.indexOf(needle)
    return first !== -1 && source.indexOf(needle, first + needle.length) === -1
  }
  if (![classNeedle, initialNeedle, rebuiltNeedle].every(unique)) {
    throw new Error('Subagent settings card Host rewrite anchor drift')
  }
  return source
    .replace(classNeedle, `${rewriteDesktopClientBundle.toString()}\n${classNeedle}`)
    .replace(initialNeedle, 'const bundle = rewriteDesktopClientBundle(pkgName, readFileSync(clientPath));')
    .replace(rebuiltNeedle, 'const bundle = rewriteDesktopClientBundle(id, readFileSync(record.meta.clientPath));')
}
```

- [x] **Step 3: Route only the official Host entry through the transformer**

Immediately after `let next = source` in `rewriteDesktopConsoleSource`, add:

```javascript
  const normalizedUrl = url.replaceAll('\\', '/')
  if (normalizedUrl.includes('@deepseek-ai/dsh-client-modules/lib/index.js')) {
    next = rewriteDesktopClientModuleHostSource(next)
  }
```

- [x] **Step 4: Run focused and existing loader regressions**

First add the official client-module Host import to
`tests/fixtures/import-harness-under-guard.mjs`:

```javascript
import ClientModuleRegistry from '@deepseek-ai/dsh-client-modules'
```

and add this assertion before the success output:

```javascript
if (typeof ClientModuleRegistry !== 'function') throw new Error('client-modules export missing')
```

This makes the existing guarded-import test parse and evaluate the actually rewritten Host source, rather than proving
only a string transformation.

Run from `win-desktop`:

```powershell
node --test tests/subagent-settings-card-visibility.test.js tests/win-hide-console.test.js
```

Expected: exit code 0; every new visibility test and every existing console/loader test passes.

- [x] **Step 5: Verify the real browser bundle projection directly**

Run from `win-desktop`:

```powershell
node --input-type=module -e "import {createRequire} from 'node:module'; import {readFileSync} from 'node:fs'; import {rewriteDesktopClientBundle} from './src/win-hide-console-rewrite.js'; const r=createRequire(import.meta.url); const p=r.resolve('@deepseek-ai/dsh-client-ui-settings-plugins/client'); const source=readFileSync(p); const out=rewriteDesktopClientBundle('@deepseek-ai/dsh-client-ui-settings-plugins',source).toString('utf8'); if(!out.includes('key: \"__windows_hidden_subagent\",')||out.includes('key: SUBAGENT_MODEL_SELECTION_NS,')) process.exit(1); console.log('subagent-card-hidden')"
```

Expected: exit code 0 and exactly `subagent-card-hidden`.

### Task 3: Lock dependency, AgentTeams, and ownership invariants

**Files:**
- Modify: `win-desktop/tests/local-capability-manifest.test.js`
- Test: `win-desktop/tests/agent-teams-integration.test.js`
- Test: `win-desktop/tests/subagent-settings-card-visibility.test.js`

**Interfaces:**
- Consumes: the focused rewrite markers and current Alpha.2 dependency manifests.
- Produces: a permanent capability-manifest gate that prevents future refreshes from deleting the hide behavior or official Subagent runtime closure.

- [x] **Step 1: Register the focused regression as a required file**

Add this entry to `requiredFiles`:

```javascript
    'tests/subagent-settings-card-visibility.test.js',
```

- [x] **Step 2: Assert wrapper markers and all four runtime dependencies**

Add to `critical integration markers retain local capability ownership`:

```javascript
  assertContains('src/win-hide-console-rewrite.js', /rewriteDesktopClientBundle/)
  assertContains('src/win-hide-console-rewrite.js', /__windows_hidden_subagent/)
  assertContains('../AGENTS.md', /hide only the native Subagent plugin settings card/i)
  assertContains('../docs/UPSTREAM_MAINTENANCE.md', /native Subagent plugin settings card/i)
  for (const dependency of [
    '@deepseek-ai/dsh-subagent',
    '@deepseek-ai/dsh-subagent-fork-in-process',
    '@deepseek-ai/dsh-subagent-in-process-driver',
    '@deepseek-ai/dsh-subagent-spawn-in-process',
  ]) {
    assert.equal(typeof packageJson.dependencies[dependency], 'string')
    assert.equal(typeof packageLock.packages['']?.dependencies?.[dependency], 'string')
    assert.equal(typeof packageLock.packages[`node_modules/${dependency}`]?.version, 'string')
  }
```

- [x] **Step 3: Run manifest and AgentTeams integration tests**

Run from `win-desktop`:

```powershell
node --test tests/local-capability-manifest.test.js tests/agent-teams-integration.test.js tests/subagent-settings-card-visibility.test.js
```

Expected before Task 4 docs: the capability-manifest test fails only because the new AGENTS and maintenance markers are not written; AgentTeams integration and focused visibility tests pass.

### Task 4: Record the upstream-refresh contract and user-visible change

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `win-desktop/release-notes/v0.1.2-rc.1.md`
- Modify: `docs/superpowers/specs/2026-08-31-hide-native-subagent-settings-card-design.md` only if implementation evidence requires a factual correction.

**Interfaces:**
- Consumes: passing focused implementation evidence.
- Produces: stable Owner classification and release-facing behavior description without claiming packaging completion.

- [x] **Step 1: Add the repository invariant**

Under Windows wrapper ownership in `AGENTS.md`, add:

```markdown
- The Windows wrapper may hide only the native Subagent plugin settings card by
  rewriting the exact Alpha.2 client-module bundle snapshot boundary. The
  Subagent Host namespace, saved settings, official runtime dependencies, and
  AgentTeams `memberProvider: spawn` path must remain installed and active. The
  replacement Slot key stays byte-length equal to preserve the authored source
  map, and both initial and HMR snapshot paths use the same package-ID-scoped
  transformer. Future upstream refreshes must retain the focused regression or
  prove an `UPSTREAM_EQUIVALENT` single-card composition control.
```

- [x] **Step 2: Add the Windows Wrapper capability row**

Add to `docs/UPSTREAM_MAINTENANCE.md` under `## Windows wrapper owner`:

```markdown
| Hide only the native Subagent plugin settings card while retaining the Host namespace, saved settings, official Subagent runtime closure, and AgentTeams spawn path | `win-desktop` | `REAPPLY`: Alpha.2 provides no single-card visibility control. The Wrapper rewrites the client-module initial/HMR bundle snapshot boundary and changes only the exact Subagent Slot key to an equal-length unserved internal key. | `src/win-hide-console-rewrite.js`, `src/win-hide-console-loader.mjs` | `tests/subagent-settings-card-visibility.test.js`, `tests/agent-teams-integration.test.js`, and the local capability manifest test |
```

- [x] **Step 3: Add concise RC1 user-facing notes**

Add one bullet to each `v0.1.2-rc.1` update section in `README.md`, `win-desktop/README.md`, and `win-desktop/release-notes/v0.1.2-rc.1.md`:

```markdown
- “插件 → 插件配置”隐藏了与独立“子智能体”设置页重复的原生 Subagent 卡；官方 Subagent 服务、已有设置和 AgentTeams 成员运行链保持不变。
```

- [x] **Step 4: Re-run the ownership and focused gates**

Run from `win-desktop`:

```powershell
node --test tests/local-capability-manifest.test.js tests/agent-teams-integration.test.js tests/subagent-settings-card-visibility.test.js
```

Expected: exit code 0.

### Task 5: Run the complete offline acceptance gate

**Files:**
- Verify only: all files modified by Tasks 1–4.
- Do not modify: `.agent-teams/**`, `node_modules/**`, `upstream/**`, `dist/**`, and every `*SFConflict*` file.

**Interfaces:**
- Consumes: the complete focused implementation and ownership records.
- Produces: evidence that the change preserves all local Alpha.2 Owners before the larger RC1 packaging closure resumes.

- [x] **Step 1: Run formatting and patch integrity checks**

Run from the repository root:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` exits 0; status shows the known Alpha.2 work plus the new spec, plan, focused test, wrapper rewrite, docs, and manifest edits. No `.agent-teams`, installer, tarball, log, credential, or new `SFConflict` path appears.

- [x] **Step 2: Run the full upstream regression gate**

Run from `win-desktop`:

```powershell
npm run verify:upstream
```

Expected: exit code 0. The command remains offline, non-installing, non-networking, and non-packaging; all Models, CPA, AgentTeams, Session Markdown, Wrapper, Alpha.2 source/closure, and focused Subagent visibility regressions pass.

- [x] **Step 3: Capture final no-publication state**

Run from the repository root:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
```

Expected: branch remains `codex/unified-model-capability-compatibility`, HEAD remains `641881cdfb91871ec674682978138bbf0bd67514`, the worktree remains intentionally dirty with uncommitted Alpha.2 work, and no commit, push, tag, Release, upload, or package action has occurred.
