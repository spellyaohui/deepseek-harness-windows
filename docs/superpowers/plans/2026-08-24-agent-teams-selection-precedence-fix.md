# AgentTeams Selection Precedence Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AgentTeams `explicit` mode enforce the settings route while preserving tolerant, intentional heterogeneous overrides in `target-default` and `route-aware` modes.

**Architecture:** Keep selection policy as the pure authority for precedence and blank normalization. Keep target-route validation in `resolveMemberLlmSelection()`, adding only contextual error decoration there. Update model-facing tool and system-prompt text so it matches execution behavior, then bump the local fork patch version and package the Windows wrapper.

**Tech Stack:** TypeScript 5.9, Node.js assertions, DeepSeek Harness LLM/tool APIs, pnpm/npm workspace packaging, Electron Builder.

## Global Constraints

- In `explicit`, live settings are authoritative and all tool-supplied provider/model/reasoning values are ignored.
- In `target-default` and `route-aware`, empty or whitespace-only route/effort values are omitted.
- Non-explicit modes retain complete provider/model overrides for heterogeneous members.
- Existing member snapshots and durable team records remain unchanged.
- No child or partial member record is created after selection failure.
- Do not modify the unrelated PowerShell `sandbox_permissions` contract in this change.
- Do not expose credentials, tokens, or provider endpoint URLs in error messages or package contents.

---

### Task 1: Correct the pure selection policy

**Files:**
- Modify: `win-desktop/agent-teams-plugin/scripts/selection-policy-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/selection-policy.ts`

**Interfaces:**
- Consumes: `selectMemberCandidate({ captain, settings, explicit })` and existing `AgentTeamsSettings`.
- Produces: the same `MemberSelectionCandidate` shape, with mode-aware precedence and blank normalization.

- [ ] **Step 1: Add failing regression assertions**

Replace the existing explicit-override expectation and add blank/non-explicit cases:

```js
assert.deepEqual(selectMemberCandidate({
  captain,
  settings,
  explicit: { provider: '', model: '', reasoningEffort: '' },
}), { provider: 'settings-p', model: 'settings-m', reasoningEffort: 'low' })

assert.deepEqual(selectMemberCandidate({
  captain,
  settings,
  explicit: { provider: 'guessed-provider', model: 'guessed-model', reasoningEffort: 'max' },
}), { provider: 'settings-p', model: 'settings-m', reasoningEffort: 'low' })

const targetDefault = {
  ...settings,
  memberLlmProvider: '',
  memberModel: '',
  memberReasoningMode: 'target-default',
  memberReasoningEffort: '',
}
assert.deepEqual(selectMemberCandidate({
  captain,
  settings: targetDefault,
  explicit: { provider: '  ', model: '', reasoningEffort: ' ' },
}), { provider: 'captain-p', model: 'captain-m' })

assert.deepEqual(selectMemberCandidate({
  captain,
  settings: targetDefault,
  explicit: { provider: 'role-p', model: 'role-m', reasoningEffort: 'max' },
}), { provider: 'role-p', model: 'role-m', reasoningEffort: 'max' })
```

- [ ] **Step 2: Build and run the focused verifier to prove RED**

Run:

```powershell
pnpm build
node scripts/selection-policy-verify.mjs
```

Expected: the verifier fails because explicit mode still returns the tool route or blank validation still throws.

- [ ] **Step 3: Implement mode-aware normalization and precedence**

Use one blank-normalization helper and return early for explicit mode:

```ts
function optionalNonBlank(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
}

export function selectMemberCandidate(input: {
  captain: MemberSelectionCandidate
  settings: AgentTeamsSettings
  explicit: MemberRouteInput
}): MemberSelectionCandidate {
  if (input.settings.memberReasoningMode === 'explicit') {
    return {
      provider: input.settings.memberLlmProvider || input.captain.provider,
      model: input.settings.memberModel || input.captain.model,
      reasoningEffort: input.settings.memberReasoningEffort,
    }
  }

  const explicitProvider = optionalNonBlank(input.explicit.provider)
  const explicitModel = optionalNonBlank(input.explicit.model)
  const explicitEffort = optionalNonBlank(input.explicit.reasoningEffort)
  if (explicitProvider !== undefined && explicitModel === undefined) {
    throw new Error('an explicit member LLM provider requires an explicit member model')
  }
  const provider = explicitProvider ?? (input.settings.memberLlmProvider || input.captain.provider)
  const model = explicitModel ?? (input.settings.memberModel || input.captain.model)
  const sameRoute = provider === input.captain.provider && model === input.captain.model
  const reasoningEffort = explicitEffort === 'default'
    ? undefined
    : explicitEffort ?? (input.settings.memberReasoningMode === 'route-aware' && sameRoute
      ? input.captain.reasoningEffort
      : undefined)
  return { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
}
```

- [ ] **Step 4: Rebuild and prove GREEN**

Run:

```powershell
pnpm build
node scripts/selection-policy-verify.mjs
```

Expected: `agent-teams selection policy verification passed`.

- [ ] **Step 5: Commit the selection-policy slice**

```powershell
git add win-desktop/agent-teams-plugin/src/selection-policy.ts win-desktop/agent-teams-plugin/scripts/selection-policy-verify.mjs
git commit -m "fix: enforce explicit member settings"
```

### Task 2: Add actionable target-resolution errors

**Files:**
- Modify: `win-desktop/agent-teams-plugin/scripts/verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/members.ts`

**Interfaces:**
- Consumes: `resolveMemberLlmSelection(ctx, captain, request, signal)` and `ctx.llm.listProviders()`.
- Produces: unchanged successful selection; non-explicit override failures append valid provider ids and an inheritance hint.

- [ ] **Step 1: Add failing resolver assertions**

Extend the selection test context so unknown providers throw and valid ids are enumerable:

```js
const selectionContext = {
  llm: {
    listProviders: () => [{ id: 'captain-provider' }, { id: 'other-provider' }],
    resolveCallConfig: async (config) => {
      if (config.provider === 'guessed-provider') {
        throw new Error('no adapter registered for provider "guessed-provider"')
      }
      // retain the existing resolver body
    },
  },
}

await assert.rejects(
  resolveMemberLlmSelection(selectionContext, captain, {
    provider: 'guessed-provider', model: 'guessed-model', defaults: routeAwareSettings,
  }),
  /Valid providers: captain-provider, other-provider.*Omit provider\/model to inherit AgentTeams settings/,
)
```

Add an explicit-mode assertion proving the guessed route never reaches `resolveCallConfig` and resolves the configured settings route instead.

- [ ] **Step 2: Build and run the verifier to prove RED**

Run:

```powershell
pnpm build
node scripts/verify.mjs
```

Expected: the actionable-error assertion fails because the resolver currently rethrows the raw adapter error.

- [ ] **Step 3: Decorate only non-explicit route-override failures**

Add focused helpers in `members.ts`:

```ts
function hasNonBlank(value: string | undefined): boolean {
  return value?.trim() !== undefined && value.trim() !== ''
}

function memberSelectionError(error: unknown, providerIds: readonly string[]): Error {
  const message = error instanceof Error ? error.message : String(error)
  const valid = [...new Set(providerIds)].sort().join(', ')
  const suffix = valid === '' ? '' : ` Valid providers: ${valid}.`
  return new Error(`${message}.${suffix} Omit provider/model to inherit AgentTeams settings.`, { cause: error })
}
```

Wrap only the `ctx.llm.resolveCallConfig()` call:

```ts
let resolved
try {
  resolved = await ctx.llm.resolveCallConfig(callConfig, signal)
} catch (error: unknown) {
  const hasRouteOverride = hasNonBlank(request.provider) || hasNonBlank(request.model)
  if (request.defaults.memberReasoningMode !== 'explicit' && hasRouteOverride) {
    throw memberSelectionError(error, ctx.llm.listProviders().map((provider) => provider.id))
  }
  throw error
}
```

- [ ] **Step 4: Run resolver and lifecycle verification**

Run:

```powershell
pnpm build
node scripts/verify.mjs
node scripts/lifecycle-verify.mjs
```

Expected: both verifiers pass; lifecycle output confirms no partial member persistence regression.

- [ ] **Step 5: Commit the error-contract slice**

```powershell
git add win-desktop/agent-teams-plugin/src/members.ts win-desktop/agent-teams-plugin/scripts/verify.mjs
git commit -m "fix: explain invalid member routes"
```

### Task 3: Align the model-facing tool contract

**Files:**
- Modify: `win-desktop/agent-teams-plugin/src/tools.ts`
- Modify: `win-desktop/agent-teams-plugin/src/index.ts`
- Modify: `win-desktop/agent-teams-plugin/scripts/verify.mjs`

**Interfaces:**
- Consumes: current tool registration and `usageSectionText()`.
- Produces: tool descriptions and system-prompt instructions matching the enforced mode-aware policy.

- [ ] **Step 1: Add failing source-contract checks**

Read the built sources in `scripts/verify.mjs` and assert both contracts:

```js
const builtTools = readFileSync(new URL('../lib/tools.js', import.meta.url), 'utf8')
const builtIndex = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
check('tool schema says explicit mode ignores route arguments',
  builtTools.includes('ignored while AgentTeams settings use explicit mode'))
check('usage prompt says explicit mode is settings-enforced',
  builtIndex.includes('In explicit mode, omit provider/model/reasoning_effort; the plugin enforces the configured settings route.'))
```

- [ ] **Step 2: Build and run the verifier to prove RED**

Run:

```powershell
pnpm build
node scripts/verify.mjs
```

Expected: both new contract checks fail against the old descriptions.

- [ ] **Step 3: Update tool and prompt text**

Change `agent_teams_add_member` text so it states:

```ts
description: 'Add a durable continuable member. AgentTeams settings choose the ordinary member route. In explicit mode, provider/model/reasoning_effort arguments are ignored and the configured settings route is enforced. In target-default or route-aware mode, supply provider/model only when the user explicitly requests a heterogeneous role-specific route. Blank optional route fields are treated as omitted.'
```

Replace protocol step 2 with text containing:

```text
In explicit mode, omit provider/model/reasoning_effort; the plugin enforces the configured settings route. In target-default and route-aware modes, omit these fields for ordinary members and pass them only when the user explicitly requests a heterogeneous route for that role.
```

- [ ] **Step 4: Rebuild and run focused plus full plugin verification**

Run:

```powershell
pnpm build
node scripts/verify.mjs
pnpm verify
```

Expected: all plugin checks pass.

- [ ] **Step 5: Commit the contract slice**

```powershell
git add win-desktop/agent-teams-plugin/src/tools.ts win-desktop/agent-teams-plugin/src/index.ts win-desktop/agent-teams-plugin/scripts/verify.mjs
git commit -m "docs: clarify enforced member routing"
```

### Task 4: Version, integrate, verify, and package Windows

**Files:**
- Modify: `win-desktop/agent-teams-plugin/package.json`
- Modify: `win-desktop/agent-teams-plugin/UPSTREAM.md`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/tests/agent-teams-integration.test.js`
- Modify: `win-desktop/tests/desktop-settings-plugin.test.js`
- Generated by build only: `win-desktop/agent-teams-plugin/lib/**`, `win-desktop/dist/**`

**Interfaces:**
- Consumes: local file dependency `@nanmicoder/dsh-agent-teams`.
- Produces: local fork version `0.1.13-desktop.2` installed into the wrapper and a Windows NSIS/ZIP artifact.

- [ ] **Step 1: Update version expectations first**

Change both wrapper assertions from `0.1.13-desktop.1` to `0.1.13-desktop.2` and run:

```powershell
node --test tests/agent-teams-integration.test.js tests/desktop-settings-plugin.test.js
```

Expected: FAIL because package metadata and lockfile still report `.desktop.1`.

- [ ] **Step 2: Bump the local fork metadata**

Set `agent-teams-plugin/package.json` version to `0.1.13-desktop.2` and update `UPSTREAM.md` to record:

```markdown
- Desktop fork version is `0.1.13-desktop.2`.
- `.desktop.2` makes explicit settings authoritative, tolerates blank non-explicit tool arguments, and adds actionable invalid-route errors.
```

Refresh the local file dependency without contacting a registry:

```powershell
npm install --package-lock-only --ignore-scripts --offline
npm install --ignore-scripts --offline
```

- [ ] **Step 3: Run wrapper integration tests**

Run:

```powershell
node --test tests/agent-teams-integration.test.js tests/desktop-settings-plugin.test.js tests/heal-desktop-plugins.test.js
npm test
```

Expected: all Windows wrapper tests pass with `.desktop.2` installed.

- [ ] **Step 4: Inspect the complete diff and commit integration metadata**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Commit only source, tests, docs, and lock metadata; do not commit `node_modules` or packaged artifacts:

```powershell
git add win-desktop/agent-teams-plugin/package.json win-desktop/agent-teams-plugin/UPSTREAM.md win-desktop/package-lock.json win-desktop/tests/agent-teams-integration.test.js win-desktop/tests/desktop-settings-plugin.test.js
git commit -m "chore: release AgentTeams desktop.2"
```

- [ ] **Step 5: Build the Windows artifacts**

Run:

```powershell
npm run dist:win
```

Expected: Electron Builder produces a new NSIS installer and ZIP under `win-desktop/dist/` without publishing.

- [ ] **Step 6: Verify artifact identity and repository state**

Run:

```powershell
Get-ChildItem dist -File | Sort-Object LastWriteTime -Descending | Select-Object -First 6 Name,Length,LastWriteTime
Get-FileHash dist\*.exe,dist\*.zip -Algorithm SHA256
git status --short --branch
```

Expected: new dated artifacts and hashes are reported; generated artifacts remain untracked/ignored and the feature worktree is clean.
