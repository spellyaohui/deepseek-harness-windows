# AgentTeams Plugin Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop-owned static AgentTeams model patch with a maintainable local AgentTeams fork that owns Harness-native settings, deterministic member routing, and durable Team/Native delegation policy.

**Architecture:** Vendor the exact `@nanmicoder/dsh-agent-teams@0.1.13` source as a `file:` dependency under the original package name, then add focused settings, selection, routing-policy, and browser-settings modules around the unchanged scheduler/state core. Persist delegation policy through the official `request/header.system` snapshot, because Harness `0.1.1-rc.2` does not expose a runtime registration seam for custom Session event types. Keep Electron responsible only for desktop behavior and a one-time legacy-settings handoff.

**Tech Stack:** TypeScript 5.9, React 18, Cordis, DeepSeek Harness `0.1.1-rc.2`, Schemastery, Node.js 22+, pnpm 11, Electron 43, Node built-in assertions/verification scripts.

## Global Constraints

- Preserve package name `@nanmicoder/dsh-agent-teams` and use local version `0.1.13-desktop.1`.
- Record upstream tag `v0.1.13`, annotated tag object `d501d2dbd54b700307d86dde0ee9125ece769c81`, and source commit `912aae5225d3d85fa841a1b0c8a5c77021876c25`.
- Never edit installed `node_modules`; the wrapper dependency must be `file:agent-teams-plugin`.
- New top-level sessions default to `teams`; established sessions without an AgentTeams policy marker remain `native-v1`.
- Team mode hides `subagent`, `subagent_fork`, `subagent_codex`, `subagent_claude_code`, `list_agents`, `send_message`, `interrupt_agent`, `workflow`, and `ralph` when those names are restrictable in the target Agent scope.
- Native mode leaves the official preset tool surface unchanged.
- `memberProvider` continues to mean the Harness continuable-child backend and remains `spawn` in the desktop product.
- Member route precedence is explicit per-member route, then current AgentTeams settings, then the captain request route.
- Settings changes affect only members created afterward; existing and cold-resumed members retain their persisted route snapshot.
- Reasoning modes are exactly `target-default`, `route-aware`, and `explicit`.
- Do not modify official standard/code/cordis preset files.
- Do not add a guard that allows failed native tool calls in Team mode; remove those tools from the model-visible surface before prompt assembly.
- The browser settings page must terminate every model-catalog request in `ready`, `empty`, or `error`; it must never remain indefinitely in `loading`.
- Preserve scheduler, mailbox, task attempts, archives, activity panel, and cold-member-restore behavior.

## File Responsibility Map

- `win-desktop/agent-teams-plugin/UPSTREAM.md`: immutable upstream identity and local-difference ledger.
- `win-desktop/agent-teams-plugin/src/settings.ts`: settings schema, validation, live Host scope, and legacy migration.
- `win-desktop/agent-teams-plugin/src/selection-policy.ts`: pure provider/model/reasoning precedence.
- `win-desktop/agent-teams-plugin/src/routing-policy.ts`: versioned policy marker parsing, legacy fallback, prompt text, and tool deny-list selection.
- `win-desktop/agent-teams-plugin/src/index.ts`: compose settings, policy installation, catalog/migration routes, prompt, and tools.
- `win-desktop/agent-teams-plugin/src/members.ts`: exact-model validation and durable member route installation.
- `win-desktop/agent-teams-plugin/src/tools.ts`: read live settings at `agent_teams_add_member` execution time.
- `win-desktop/agent-teams-plugin/src/client/model-catalog.ts`: bounded browser catalog request and terminal state reducer.
- `win-desktop/agent-teams-plugin/src/client/AgentTeamsSettingsSection.tsx`: Harness-native `子智能体` settings UI.
- `win-desktop/agent-teams-plugin/src/client/AgentTeamsSettingsSection.module.css`: theme-token-only section styling.
- `win-desktop/agent-teams-plugin/src/client/index.tsx`: register locale, activity surfaces, and `settings.section`.
- `win-desktop/agent-teams-plugin/scripts/*-verify.mjs`: deterministic local verification for each new behavior.
- `win-desktop/src/desktop-settings.js`: desktop-only settings plus the legacy-key removal helper.
- `win-desktop/src/dsh-service.js`: local plugin patch generation and migration-status handshake.
- `win-desktop/src/win-hide-console-rewrite.js`: Windows/OpenCode rewrites only; no AgentTeams schema rewrite.
- `win-desktop/desktop-settings-plugin/lib/client.js`: `桌面` tab containing only window behavior.
- `win-desktop/package.json` and `win-desktop/package-lock.json`: local plugin dependency and packaged files.

---

### Task 1: Import the exact upstream fork and prove baseline parity

**Files:**
- Create: `win-desktop/agent-teams-plugin/**`
- Create: `win-desktop/agent-teams-plugin/UPSTREAM.md`
- Modify: `win-desktop/agent-teams-plugin/package.json`
- Modify: `win-desktop/agent-teams-plugin/pnpm-lock.yaml`

**Interfaces:**
- Consumes: upstream tag `v0.1.13` at source commit `912aae5225d3d85fa841a1b0c8a5c77021876c25`.
- Produces: a buildable local package named `@nanmicoder/dsh-agent-teams` at version `0.1.13-desktop.1` with the original verification suite intact.

- [ ] **Step 1: Copy the upstream source without Git metadata or build output**

Run from the repository root in PowerShell:

```powershell
$source = Join-Path $env:TEMP 'dsh-agent-teams-v0.1.13-implementation'
if (-not (Test-Path $source)) {
  git clone --depth 1 --branch v0.1.13 https://github.com/NanmiCoder/dsh-agent-teams.git $source
}
if ((git -C $source rev-parse HEAD) -ne '912aae5225d3d85fa841a1b0c8a5c77021876c25') {
  throw 'Unexpected AgentTeams v0.1.13 source commit'
}
New-Item -ItemType Directory -Force 'win-desktop/agent-teams-plugin' | Out-Null
Get-ChildItem -LiteralPath $source -Force |
  Where-Object { $_.Name -notin @('.git', 'node_modules', 'lib') } |
  Copy-Item -Destination 'win-desktop/agent-teams-plugin' -Recurse -Force
```

Expected: `win-desktop/agent-teams-plugin/src/index.ts`, `src/members.ts`, `src/tools.ts`, and the three upstream verification scripts exist; `.git`, `node_modules`, and `lib` do not exist under the imported package.

- [ ] **Step 2: Record provenance and local-difference rules**

Create `win-desktop/agent-teams-plugin/UPSTREAM.md` with:

```markdown
# Upstream provenance

- Repository: `https://github.com/NanmiCoder/dsh-agent-teams.git`
- Package: `@nanmicoder/dsh-agent-teams@0.1.13`
- Tag: `v0.1.13`
- Annotated tag object: `d501d2dbd54b700307d86dde0ee9125ece769c81`
- Source commit: `912aae5225d3d85fa841a1b0c8a5c77021876c25`
- Imported: `2026-08-23`

## Local package identity

- Package name remains `@nanmicoder/dsh-agent-teams`.
- Desktop fork version is `0.1.13-desktop.1`.
- The Windows wrapper installs this directory through `file:agent-teams-plugin`.

## Intentional local differences

- Harness settings namespace and browser settings section.
- Live member provider/model/reasoning defaults.
- Versioned Team/Native routing policy persisted in `request/header.system`.
- Agent-scoped suppression of native delegation tools in Team mode.
- One-time migration from legacy Electron settings.
- Desktop integration and regression verification.

## Upgrade rule

Import a future upstream release into a fresh temporary checkout, compare it with this directory, reapply only the intentional local modules above, then run `pnpm build`, `pnpm verify`, and every `scripts/desktop-*-verify.mjs` gate before changing the recorded baseline.
```

- [ ] **Step 3: Change only the local version and add a unified test command**

Modify the package metadata to contain:

```json
{
  "name": "@nanmicoder/dsh-agent-teams",
  "version": "0.1.13-desktop.1",
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.client.json && tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit && tsc -p tsconfig.client.json --noEmit",
    "sync:skill": "node scripts/sync-skill.mjs",
    "verify:skill": "node scripts/sync-skill.mjs --check",
    "verify": "node scripts/verify.mjs && node scripts/lifecycle-verify.mjs && node scripts/stress-verify.mjs && pnpm verify:skill",
    "test": "pnpm build && pnpm verify"
  }
}
```

Keep every dependency and every other package field from upstream unchanged.

- [ ] **Step 4: Install and run the unchanged upstream gates**

Run:

```powershell
Set-Location 'win-desktop/agent-teams-plugin'
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
```

Expected: typecheck succeeds; `verify.mjs`, `lifecycle-verify.mjs`, `stress-verify.mjs`, and `verify:skill` all report success.

- [ ] **Step 5: Commit the auditable baseline**

```powershell
git add win-desktop/agent-teams-plugin
git commit -m "chore: vendor AgentTeams 0.1.13 source baseline"
```

Expected: the commit contains the upstream source, provenance file, lockfile, and generated `lib/`; it contains no nested `.git`, `node_modules`, temp file, credential, or absolute local path.

---

### Task 2: Add the AgentTeams settings contract and live Host scope

**Files:**
- Create: `win-desktop/agent-teams-plugin/src/settings.ts`
- Create: `win-desktop/agent-teams-plugin/scripts/settings-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/index.ts`
- Modify: `win-desktop/agent-teams-plugin/package.json`

**Interfaces:**
- Consumes: `ctx.settings.register()`, `settingsNamespace('agent-teams')`, the composition config supplied to `apply()`, and an optional legacy migration envelope.
- Produces: `AgentTeamsSettingsRuntime.get(): AgentTeamsSettings` and `AgentTeamsSettingsRuntime.migrationStatus(): { migrationVersion: number; complete: boolean }`.

- [ ] **Step 1: Write the failing settings verification**

Create `scripts/settings-verify.mjs`:

```js
import assert from 'node:assert/strict'
import {
  DEFAULT_AGENT_TEAMS_SETTINGS,
  normalizeAgentTeamsSettings,
  validateAgentTeamsSettings,
} from '../lib/settings.js'

assert.deepEqual(normalizeAgentTeamsSettings({}), DEFAULT_AGENT_TEAMS_SETTINGS)
assert.equal(normalizeAgentTeamsSettings({ memberModel: '  model-x  ' }).memberModel, 'model-x')
assert.throws(
  () => validateAgentTeamsSettings({
    ...DEFAULT_AGENT_TEAMS_SETTINGS,
    memberLlmProvider: 'provider-x',
    memberModel: '',
  }),
  /requires memberModel/,
)
assert.throws(
  () => validateAgentTeamsSettings({
    ...DEFAULT_AGENT_TEAMS_SETTINGS,
    memberReasoningMode: 'explicit',
    memberReasoningEffort: '',
  }),
  /requires memberReasoningEffort/,
)
console.log('agent-teams settings verification passed')
```

- [ ] **Step 2: Run it and observe the missing module failure**

Run:

```powershell
Set-Location 'win-desktop/agent-teams-plugin'
pnpm build
node scripts/settings-verify.mjs
```

Expected: FAIL because `lib/settings.js` or its named exports do not exist.

- [ ] **Step 3: Implement the exact settings schema and normalization**

Create `src/settings.ts` with these public declarations and values:

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'

export type DelegationMode = 'teams' | 'native'
export type MemberReasoningMode = 'target-default' | 'route-aware' | 'explicit'

export interface AgentTeamsSettings {
  delegationMode: DelegationMode
  memberLlmProvider: string
  memberModel: string
  memberReasoningMode: MemberReasoningMode
  memberReasoningEffort: string
  migrationVersion: number
}

export interface LegacyDesktopAgentTeamsSettings {
  provider?: string
  model?: string
  reasoningEffort?: string
}

export const AGENT_TEAMS_SETTINGS_NAMESPACE = settingsNamespace('agent-teams')
export const AGENT_TEAMS_MIGRATION_VERSION = 1

export const DEFAULT_AGENT_TEAMS_SETTINGS: AgentTeamsSettings = {
  delegationMode: 'teams',
  memberLlmProvider: '',
  memberModel: '',
  memberReasoningMode: 'target-default',
  memberReasoningEffort: '',
  migrationVersion: 0,
}

export const AgentTeamsSettingsSchema: z<AgentTeamsSettings> = z.object({
  delegationMode: z.union(['teams', 'native']).default('teams'),
  memberLlmProvider: z.string().default(''),
  memberModel: z.string().default(''),
  memberReasoningMode: z.union(['target-default', 'route-aware', 'explicit']).default('target-default'),
  memberReasoningEffort: z.string().default(''),
  migrationVersion: z.natural().default(0),
})

export function normalizeAgentTeamsSettings(input: Partial<AgentTeamsSettings>): AgentTeamsSettings {
  return {
    delegationMode: input.delegationMode ?? 'teams',
    memberLlmProvider: input.memberLlmProvider?.trim() ?? '',
    memberModel: input.memberModel?.trim() ?? '',
    memberReasoningMode: input.memberReasoningMode ?? 'target-default',
    memberReasoningEffort: input.memberReasoningEffort?.trim() ?? '',
    migrationVersion: input.migrationVersion ?? 0,
  }
}

export function validateAgentTeamsSettings(value: AgentTeamsSettings): void {
  if (value.memberLlmProvider !== '' && value.memberModel === '') {
    throw new Error('memberLlmProvider requires memberModel')
  }
  if (value.memberReasoningMode === 'explicit' && value.memberReasoningEffort === '') {
    throw new Error('explicit memberReasoningMode requires memberReasoningEffort')
  }
  if (value.memberReasoningMode !== 'explicit' && value.memberReasoningEffort !== '') {
    throw new Error('memberReasoningEffort is valid only in explicit mode')
  }
}

export interface AgentTeamsSettingsRuntime {
  get(): AgentTeamsSettings
  migrationStatus(): { migrationVersion: number; complete: boolean }
}

export function createAgentTeamsSettingsRuntime(
  ctx: Context,
  base: Partial<AgentTeamsSettings>,
  legacy: LegacyDesktopAgentTeamsSettings | undefined,
): AgentTeamsSettingsRuntime {
  let current = normalizeAgentTeamsSettings(base)
  ctx.inject(['settings'], (settingsCtx) => {
    const scope: SettingsScope<AgentTeamsSettings> = settingsCtx.settings.register(
      AGENT_TEAMS_SETTINGS_NAMESPACE,
      AgentTeamsSettingsSchema,
      { base: current, applies: 'live', validate: validateAgentTeamsSettings },
    )
    current = normalizeAgentTeamsSettings(scope.get())
    ctx.effect(() => scope?.watch((next) => {
      current = normalizeAgentTeamsSettings(next)
    }) ?? (() => undefined), 'agent-teams: settings watch')
    if (legacy !== undefined && current.migrationVersion < AGENT_TEAMS_MIGRATION_VERSION) {
      const effort = legacy.reasoningEffort?.trim() ?? ''
      void scope.update({
        memberLlmProvider: legacy.provider?.trim() ?? '',
        memberModel: legacy.model?.trim() ?? '',
        memberReasoningMode: effort === '' ? 'target-default' : 'explicit',
        memberReasoningEffort: effort,
        migrationVersion: AGENT_TEAMS_MIGRATION_VERSION,
      }).then(() => {
        current = normalizeAgentTeamsSettings(scope.get())
      }).catch((error: unknown) => {
        ctx.logger.warn(`agent-teams: legacy settings migration failed: ${String(error)}`)
      })
    }
  })
  return {
    get: () => current,
    migrationStatus: () => ({
      migrationVersion: current.migrationVersion,
      complete: current.migrationVersion >= AGENT_TEAMS_MIGRATION_VERSION,
    }),
  }
}
```

- [ ] **Step 4: Compose the settings runtime in `apply()`**

Add these Config fields and schema entries:

```ts
export interface Config {
  delegationMode?: DelegationMode
  memberLlmProvider?: string
  memberModel?: string
  memberReasoningMode?: MemberReasoningMode
  memberReasoningEffort?: string
  legacyDesktopSettings?: LegacyDesktopAgentTeamsSettings
}

delegationMode: z.union(['teams', 'native']).default('teams'),
memberLlmProvider: z.string().default(''),
memberModel: z.string().default(''),
memberReasoningMode: z.union(['target-default', 'route-aware', 'explicit']).default('target-default'),
memberReasoningEffort: z.string().default(''),
legacyDesktopSettings: z.object({
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string(),
}),
```

Keep the existing `stateDir`, `memberProvider`, `memberMaxDepth`, `maxMembers`, `promptSectionOrder`, and `slashCommand` Config fields. Then construct one runtime:

```ts
const settings = createAgentTeamsSettingsRuntime(ctx, {
  delegationMode: config.delegationMode ?? 'teams',
  memberLlmProvider: config.memberLlmProvider ?? '',
  memberModel: config.memberModel ?? '',
  memberReasoningMode: config.memberReasoningMode ?? 'target-default',
  memberReasoningEffort: config.memberReasoningEffort ?? '',
  migrationVersion: 0,
}, config.legacyDesktopSettings)
```

The runtime queues no write before the settings service attaches. Once attached, it migrates only when `migrationVersion < 1`; a failed write logs one concise error and leaves the Electron legacy values untouched for the next launch.

- [ ] **Step 5: Run and commit**

Run:

```powershell
pnpm build
node scripts/settings-verify.mjs
pnpm verify
```

Expected: settings verification passes and every upstream verification still passes.

```powershell
git add win-desktop/agent-teams-plugin
git commit -m "feat: add live AgentTeams settings namespace"
```

---

### Task 3: Implement deterministic member route and reasoning precedence

**Files:**
- Create: `win-desktop/agent-teams-plugin/src/selection-policy.ts`
- Create: `win-desktop/agent-teams-plugin/scripts/selection-policy-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/members.ts`
- Modify: `win-desktop/agent-teams-plugin/package.json`

**Interfaces:**
- Consumes: explicit member tool arguments, `AgentTeamsSettings`, and the captain's effective request config.
- Produces: `selectMemberCandidate(input): MemberSelectionCandidate`, then `resolveMemberLlmSelection()` validates it through `ctx.llm.resolveCallConfig()`.

- [ ] **Step 1: Write failing precedence cases**

Create `scripts/selection-policy-verify.mjs` with assertions covering these exact outcomes:

```js
import assert from 'node:assert/strict'
import { selectMemberCandidate } from '../lib/selection-policy.js'

const captain = { provider: 'captain-p', model: 'captain-m', reasoningEffort: 'high' }
const settings = {
  delegationMode: 'teams',
  memberLlmProvider: 'settings-p',
  memberModel: 'settings-m',
  memberReasoningMode: 'explicit',
  memberReasoningEffort: 'low',
  migrationVersion: 1,
}

assert.deepEqual(selectMemberCandidate({ captain, settings, explicit: {} }), {
  provider: 'settings-p', model: 'settings-m', reasoningEffort: 'low',
})
assert.deepEqual(selectMemberCandidate({
  captain, settings, explicit: { provider: 'role-p', model: 'role-m', reasoningEffort: 'max' },
}), { provider: 'role-p', model: 'role-m', reasoningEffort: 'max' })
assert.equal(selectMemberCandidate({
  captain,
  settings: { ...settings, memberLlmProvider: '', memberModel: '', memberReasoningMode: 'target-default', memberReasoningEffort: '' },
  explicit: {},
}).reasoningEffort, undefined)
assert.equal(selectMemberCandidate({
  captain,
  settings: { ...settings, memberLlmProvider: '', memberModel: '', memberReasoningMode: 'route-aware', memberReasoningEffort: '' },
  explicit: {},
}).reasoningEffort, 'high')
assert.equal(selectMemberCandidate({
  captain,
  settings: { ...settings, memberLlmProvider: 'other-p', memberModel: 'other-m', memberReasoningMode: 'route-aware', memberReasoningEffort: '' },
  explicit: {},
}).reasoningEffort, undefined)
console.log('agent-teams selection policy verification passed')
```

- [ ] **Step 2: Run and verify the missing export failure**

Run `pnpm build; node scripts/selection-policy-verify.mjs`.

Expected: FAIL because `lib/selection-policy.js` does not exist.

- [ ] **Step 3: Add the pure policy function**

Create `src/selection-policy.ts`:

```ts
import type { AgentTeamsSettings } from './settings.ts'

export interface MemberRouteInput {
  provider?: string
  model?: string
  reasoningEffort?: string
}

export interface MemberSelectionCandidate {
  provider: string
  model: string
  reasoningEffort?: string
}

export function selectMemberCandidate(input: {
  captain: MemberSelectionCandidate
  settings: AgentTeamsSettings
  explicit: MemberRouteInput
}): MemberSelectionCandidate {
  const explicitProvider = input.explicit.provider?.trim()
  const explicitModel = input.explicit.model?.trim()
  const explicitEffort = input.explicit.reasoningEffort?.trim()
  if (input.explicit.provider !== undefined && explicitProvider === '') throw new Error('member LLM provider must not be empty')
  if (input.explicit.model !== undefined && explicitModel === '') throw new Error('member model must not be empty')
  if (input.explicit.reasoningEffort !== undefined && explicitEffort === '') throw new Error('member reasoning effort must not be empty')
  if (explicitProvider !== undefined && explicitModel === undefined) {
    throw new Error('an explicit member LLM provider requires an explicit member model')
  }
  const provider = explicitProvider ?? (input.settings.memberLlmProvider || input.captain.provider)
  const model = explicitModel ?? (input.settings.memberModel || input.captain.model)
  const sameRoute = provider === input.captain.provider && model === input.captain.model
  const reasoningEffort = explicitEffort === 'default'
    ? undefined
    : explicitEffort ?? (
      input.settings.memberReasoningMode === 'explicit'
        ? input.settings.memberReasoningEffort
        : input.settings.memberReasoningMode === 'route-aware' && sameRoute
          ? input.captain.reasoningEffort
          : undefined
    )
  return { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
}
```

- [ ] **Step 4: Make `resolveMemberLlmSelection()` validate the candidate against the exact target model**

Replace the embedded precedence logic with:

```ts
const current = captain.session.requestHeader()?.config
const captainSelection = {
  provider: current?.provider ?? captain.options.provider,
  model: current?.model ?? captain.options.model,
  ...(current?.reasoningEffort === undefined ? {} : { reasoningEffort: String(current.reasoningEffort) }),
}
if (captainSelection.provider === undefined || captainSelection.model === undefined) {
  throw new Error('cannot resolve the member LLM route from the current captain session')
}
const candidate = selectMemberCandidate({ captain: captainSelection, settings: request.defaults, explicit: request })
const resolved = await ctx.llm.resolveCallConfig(candidate, signal)
return {
  provider: resolved.provider,
  model: resolved.model,
  ...(resolved.reasoningEffort === undefined ? {} : { reasoningEffort: String(resolved.reasoningEffort) }),
}
```

Change `MemberLlmSelectionRequest` to require `defaults: AgentTeamsSettings`; remove `defaultModel`.

- [ ] **Step 5: Run and commit**

Run `pnpm build; node scripts/selection-policy-verify.mjs; pnpm verify`.

Expected: all six precedence/reasoning assertions pass; upstream cold-resume and lifecycle checks remain green.

```powershell
git add win-desktop/agent-teams-plugin
git commit -m "feat: resolve member routes from live settings"
```

---

### Task 4: Read live settings inside `agent_teams_add_member`

**Files:**
- Modify: `win-desktop/agent-teams-plugin/src/tools.ts`
- Modify: `win-desktop/agent-teams-plugin/src/index.ts`
- Modify: `win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs`

**Interfaces:**
- Consumes: `ToolsConfig.settings.get()` immediately before member route resolution.
- Produces: newly created members use the latest settings; persisted members remain unchanged.

- [ ] **Step 1: Add a failing hot-settings lifecycle case**

In `scripts/lifecycle-verify.mjs`, make the fake settings runtime mutable, create member `alpha`, change the settings route, create member `beta`, then assert:

```js
check('future members read the newest settings without mutating existing snapshots',
  addedAlpha.provider === 'provider-a'
    && addedAlpha.model === 'model-a'
    && addedBeta.provider === 'provider-b'
    && addedBeta.model === 'model-b'
    && (await state()).members.find(member => member.name === 'alpha')?.model === 'model-a')
```

- [ ] **Step 2: Run the lifecycle verifier and observe the stale-config failure**

Run `pnpm build; node scripts/lifecycle-verify.mjs`.

Expected: FAIL because `ToolsConfig` still captures `memberModel` at plugin activation.

- [ ] **Step 3: Replace static member defaults with the runtime handle**

Define `ToolsConfig` as:

```ts
export interface ToolsConfig {
  stateDir: string
  memberProvider: string
  memberMaxDepth?: number
  maxMembers: number
  settings: AgentTeamsSettingsRuntime
}
```

Inside `agent_teams_add_member`, immediately before `resolveMemberLlmSelection()`, read:

```ts
const defaults = config.settings.get()
const selection = await resolveMemberLlmSelection(ctx, captain, {
  provider: args.provider,
  model: args.model,
  reasoningEffort: args.reasoning_effort,
  defaults,
}, exec.signal)
```

Do not read settings during plugin activation or member continuation.

- [ ] **Step 4: Run and commit**

Run `pnpm build; node scripts/lifecycle-verify.mjs; pnpm verify`.

Expected: the new hot-settings case passes and existing member cold restore still uses the stored provider/model/reasoning snapshot.

```powershell
git add win-desktop/agent-teams-plugin
git commit -m "feat: apply AgentTeams defaults at member creation"
```

---

### Task 5: Add the Harness-native `子智能体` settings section and bounded model catalog

**Files:**
- Create: `win-desktop/agent-teams-plugin/src/client/model-catalog.ts`
- Create: `win-desktop/agent-teams-plugin/src/client/AgentTeamsSettingsSection.tsx`
- Create: `win-desktop/agent-teams-plugin/src/client/AgentTeamsSettingsSection.module.css`
- Create: `win-desktop/agent-teams-plugin/scripts/settings-client-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/client/index.tsx`
- Modify: `win-desktop/agent-teams-plugin/src/client/locales.ts`
- Modify: `win-desktop/agent-teams-plugin/src/index.ts`
- Modify: `win-desktop/agent-teams-plugin/package.json`

**Interfaces:**
- Consumes: `ctx.settingsScope.bind({ namespace: 'agent-teams' })`, `ctx.llm.listProviders()`, `ctx.llm.listModels(provider)`, and `ctx.llm.resolveModelInfo(provider, model)`.
- Produces: `GET /plugins/dsh-agent-teams/models` and a `settings.section` contribution with id `agent-teams`.

- [ ] **Step 1: Write failing terminal-state catalog tests**

Create `scripts/settings-client-verify.mjs` that supplies fake fetchers for a non-empty result, an empty result, a 500 response, and a never-settling response. Assert the returned statuses are exactly `ready`, `empty`, `error`, and `error`, with the never-settling request completing within 250 ms when called with a 100 ms timeout.

- [ ] **Step 2: Run it and observe the missing module failure**

Run `pnpm build; node scripts/settings-client-verify.mjs`.

Expected: FAIL because `lib/client/model-catalog.js` does not exist.

- [ ] **Step 3: Implement the bounded client catalog function**

Create `src/client/model-catalog.ts`:

```ts
export interface ModelCatalogEntry {
  provider: string
  id: string
  name: string
  efforts: readonly { id: string; name: string }[]
  defaultEffort?: string
}

export type ModelCatalogState =
  | { status: 'ready'; models: readonly ModelCatalogEntry[]; error: null }
  | { status: 'empty'; models: readonly ModelCatalogEntry[]; error: null }
  | { status: 'error'; models: readonly ModelCatalogEntry[]; error: string }

export async function loadModelCatalog(
  fetcher: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<ModelCatalogState> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const response = await fetcher('/plugins/dsh-agent-teams/models', { signal: abort.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json() as { models?: ModelCatalogEntry[] }
    const models = Array.isArray(body.models) ? body.models : []
    return models.length === 0
      ? { status: 'empty', models, error: null }
      : { status: 'ready', models, error: null }
  } catch (error: unknown) {
    const message = abort.signal.aborted
      ? `模型目录请求超过 ${timeoutMs}ms`
      : error instanceof Error ? error.message : String(error)
    return { status: 'error', models: [], error: message }
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 4: Register the Host catalog route using the official LLM service**

Return a stable JSON shape and isolate per-provider failures:

```ts
const providers = ctx.llm.listProviders()
const models = []
const failures = []
for (const provider of providers) {
  try {
    for (const model of await ctx.llm.listModels(provider.id)) {
      const exact = await ctx.llm.resolveModelInfo(provider.id, model.id)
      models.push({
        provider: provider.id,
        id: model.id,
        name: model.name,
        efforts: exact.reasoning?.efforts.map((effort) => ({ id: String(effort.id), name: effort.name })) ?? [],
        ...(exact.reasoning?.defaultEffort === undefined
          ? {}
          : { defaultEffort: String(exact.reasoning.defaultEffort) }),
      })
    }
  } catch (error: unknown) {
    failures.push({ provider: provider.id, message: error instanceof Error ? error.message : String(error) })
  }
}
```

Respond with `{ models, failures }`, `content-type: application/json; charset=utf-8`, and `cache-control: no-store`. Accept only `GET`; return 405 for other methods.

- [ ] **Step 5: Bind the settings scope and register a native section**

In `src/client/index.tsx`, add `settingsScope` to `inject`, bind the namespace, and register:

```tsx
const settings = ctx.settingsScope.bind<AgentTeamsSettings>({ namespace: 'agent-teams' })
const t = ctx.locale.bind(AGENT_TEAMS_LOCALE_NAMESPACE)
ctx.slots.inject('settings.section', () => ctx.slots.register({
  name: 'settings.section',
  id: 'agent-teams',
  order: 30,
  locale: AGENT_TEAMS_LOCALE_NAMESPACE,
  label: () => t('settings.title'),
  inject: () => ({ settings }),
}, AgentTeamsSettingsSection))
```

The component must use `useSyncExternalStore`, Harness `Button`/`Select`/form primitives, and the bound scope's `set(field, value)`. Render these sections and copy exactly:

- `委派模式`: Team mode and Native compatibility mode; state that changes apply to new sessions.
- `成员模型`: provider selector with `跟随队长`, then model selector filtered by provider.
- `成员推理强度`: target default, route-aware inheritance, or explicit supported effort.
- `生效范围`: existing members retain their route; future members use current values.

When provider/model changes, clear an unsupported explicit effort by calling `settings.set('memberReasoningEffort', '')` before changing mode away from `explicit`.

- [ ] **Step 6: Style only through Harness tokens**

The CSS module may use `--dsw-alias-*` and `--dsw-font-*` variables. It must not set fixed light/dark backgrounds, inject global selectors, or import Electron styles. Include visible focus, disabled, loading, empty, and error states.

- [ ] **Step 7: Run and commit**

Run:

```powershell
pnpm build
node scripts/settings-client-verify.mjs
pnpm verify
```

Expected: timeout test terminates, all terminal-state cases pass, client TypeScript compiles, and the existing activity UI verifiers remain green.

```powershell
git add win-desktop/agent-teams-plugin
git commit -m "feat: add AgentTeams settings tab and model catalog"
```

---

### Task 6: Persist Team/Native policy in request headers and suppress native delegation tools

**Files:**
- Create: `win-desktop/agent-teams-plugin/src/routing-policy.ts`
- Create: `win-desktop/agent-teams-plugin/scripts/routing-policy-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/index.ts`
- Modify: `win-desktop/agent-teams-plugin/src/members.ts`
- Modify: `win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs`

**Interfaces:**
- Consumes: `SessionEvent[]`, current `delegationMode`, optional parent policy, `agent.ctx.tools.get()`, `agent.ctx.tools.restrict()`, and `agent.ctx.systemPrompt.section()`.
- Produces: `resolveDelegationPolicy(input): DelegationPolicyId` and a policy-specific prompt/tool surface before the first request assembly.

- [ ] **Step 1: Write failing policy-fold and deny-list tests**

Cover: fresh Team -> `teams-v1`; fresh Native -> `native-v1`; latest valid marker wins; unknown marker throws; legacy message/request history without a marker -> `native-v1`; child explicit parent policy wins; absent optional tools are excluded from the deny list.

- [ ] **Step 2: Run and verify the missing module failure**

Run `pnpm build; node scripts/routing-policy-verify.mjs`.

Expected: FAIL because `lib/routing-policy.js` does not exist.

- [ ] **Step 3: Implement the pure durable-policy contract**

Create `src/routing-policy.ts` with:

```ts
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { DelegationMode } from './settings.ts'

export type DelegationPolicyId = 'teams-v1' | 'native-v1'
export const POLICY_PREFIX = 'AgentTeams delegation policy:'
export const NATIVE_DELEGATION_TOOLS = [
  'subagent', 'subagent_fork', 'subagent_codex', 'subagent_claude_code',
  'list_agents', 'send_message', 'interrupt_agent', 'workflow', 'ralph',
] as const

export function policyMarker(policy: DelegationPolicyId): string {
  return `${POLICY_PREFIX} ${policy}`
}

export function persistedPolicy(events: readonly SessionEvent[]): DelegationPolicyId | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'request/header') continue
    const system = event.data.header.system
    if (system === undefined || !system.includes(POLICY_PREFIX)) continue
    const match = /^AgentTeams delegation policy: (teams-v1|native-v1)$/mu.exec(system)
    if (match?.[1] === 'teams-v1' || match?.[1] === 'native-v1') return match[1]
    throw new Error('agent-teams: request header contains an unknown delegation policy marker')
  }
  return undefined
}

export function hasEstablishedHistory(events: readonly SessionEvent[]): boolean {
  return events.some((event) => event.type === 'request/header'
    || event.type === 'user/message'
    || event.type === 'assistant/message')
}

export function resolveDelegationPolicy(input: {
  events: readonly SessionEvent[]
  defaultMode: DelegationMode
  parentPolicy?: DelegationPolicyId
}): DelegationPolicyId {
  return persistedPolicy(input.events)
    ?? input.parentPolicy
    ?? (hasEstablishedHistory(input.events)
      ? 'native-v1'
      : input.defaultMode === 'teams' ? 'teams-v1' : 'native-v1')
}
```

- [ ] **Step 4: Install policy-specific prompt and restriction on `agent/created`**

Register one synchronous listener from the plugin root. For each new or resumed Agent:

1. Resolve the parent policy from the live parent session when `header.parentSession` exists.
2. Resolve the target policy from the Agent's own events.
3. Build the policy-specific usage text containing `policyMarker(policy)`.
4. Register the prompt section through `agent.ctx.systemPrompt.section()`.
5. For `teams-v1`, intersect `NATIVE_DELEGATION_TOOLS` with `ctx.tools.get(name, agent) !== undefined`, then call `agent.ctx.tools.restrict({ deny })` only when the list is non-empty.
6. For `native-v1`, install no restriction.

The Team prompt must state that genuine delegation uses only `agent_teams_*`; ordinary single-agent work does not require creating a team. The Native prompt must preserve the current explicit-AgentTeams activation behavior.

- [ ] **Step 5: Ensure member children receive the same policy before publication**

Extend the existing `registerContinuableSetup()` contribution so an AgentTeams member resolves the captain policy, installs the same policy prompt, and applies the Team deny list in the child's unpublished scope. Keep the existing captain-only AgentTeams tool filter; the two restrictions must intersect without removing member-local reporting tools.

- [ ] **Step 6: Verify request headers and internal spawning**

Extend `lifecycle-verify.mjs` to assert:

- Team captain and member assembled tools contain no deny-list name.
- AgentTeams `ctx.subagents.startContinuable()` still succeeds.
- Native policy leaves the official tools visible.
- Changing global settings after one request does not change the restored policy marker.
- A legacy session without a marker resolves Native.

Run `pnpm build; node scripts/routing-policy-verify.mjs; node scripts/lifecycle-verify.mjs; pnpm verify`.

Expected: all routing cases pass and AgentTeams member creation remains functional.

- [ ] **Step 7: Commit**

```powershell
git add win-desktop/agent-teams-plugin
git commit -m "feat: make AgentTeams the durable Team delegation path"
```

---

### Task 7: Migrate legacy Electron settings idempotently

**Files:**
- Create: `win-desktop/agent-teams-plugin/scripts/migration-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/settings.ts`
- Modify: `win-desktop/agent-teams-plugin/src/index.ts`
- Modify: `win-desktop/src/desktop-settings.js`
- Modify: `win-desktop/src/dsh-service.js`
- Modify: `win-desktop/src/main.js`
- Modify: `win-desktop/tests/desktop-settings.test.js`
- Modify: `win-desktop/tests/heal-desktop-plugins.test.js`

**Interfaces:**
- Consumes: legacy `agentTeamsMemberProvider`, `agentTeamsMemberModel`, and `agentTeamsMemberReasoningEffort` from `desktop-settings.json`.
- Produces: Harness settings `migrationVersion: 1`, `GET /plugins/dsh-agent-teams/migration-status`, and `removeLegacyAgentTeamsSettings(): void` after confirmed migration.

- [ ] **Step 1: Write failing pure migration and desktop-removal tests**

Assert empty effort maps to `target-default`; non-empty effort maps to `explicit`; an empty/invalid provider maps to `''`; migration version 1 is idempotent; removing the three legacy keys preserves `closeBehavior` and unknown desktop keys.

- [ ] **Step 2: Run focused tests and observe failures**

Run:

```powershell
Set-Location 'win-desktop/agent-teams-plugin'
pnpm build
node scripts/migration-verify.mjs
Set-Location '..'
npm test -- --test-name-pattern="desktop-settings|heal"
```

Expected: FAIL because the migration-status route and key-removal helper do not exist.

- [ ] **Step 3: Pass only a migration envelope in the generated patch**

Keep `generateAgentTeamsPatch()` only for the first-launch bridge. Its AgentTeams config must contain `stateDir`, `memberProvider: spawn`, and this optional object:

```yaml
legacyDesktopSettings:
  provider: <legacy provider when non-empty>
  model: <legacy model when non-empty>
  reasoningEffort: <legacy effort when non-empty>
```

Do not emit live `memberModel` or `memberReasoningEffort` config fields from desktop settings.

- [ ] **Step 4: Expose and consume confirmed migration status**

The Host route returns:

```json
{ "migrationVersion": 1, "complete": true }
```

only when the live AgentTeams settings scope reports `migrationVersion >= 1`. Before that, return `{ "migrationVersion": 0, "complete": false }`.

After `service.ready`, `main.js` calls `confirmAgentTeamsMigration(serviceUrl)`. Poll the status endpoint at 250 ms intervals for at most 5 seconds. On `{ complete: true }`, call `removeLegacyAgentTeamsSettings()`; on timeout, network error, or a final false status, preserve the keys for the next launch.

- [ ] **Step 5: Remove legacy keys without replacing the desktop document**

Implement the helper by reading the cached object, deleting only the three known keys from a copy, and flushing that copy. Never delete `desktop-settings.json`, `closeBehavior`, or unknown future keys.

- [ ] **Step 6: Run and commit**

Run `pnpm build; node scripts/migration-verify.mjs; pnpm verify; Set-Location ..; npm test`.

Expected: migration is idempotent, failed handshake preserves legacy values, successful handshake removes only the three keys, and all wrapper tests pass.

```powershell
git add win-desktop/agent-teams-plugin win-desktop/src win-desktop/tests
git commit -m "feat: migrate desktop AgentTeams preferences safely"
```

---

### Task 8: Install the local fork and remove obsolete desktop/runtime rewrites

**Files:**
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `win-desktop/config/agent-teams.patch.yml`
- Modify: `win-desktop/src/win-hide-console-rewrite.js`
- Modify: `win-desktop/src/preload.cjs`
- Modify: `win-desktop/src/settings-window.js`
- Modify: `win-desktop/desktop-settings-plugin/lib/client.js`
- Modify: `win-desktop/tests/win-hide-console.test.js`
- Modify: `win-desktop/tests/desktop-settings-plugin.test.js`
- Modify: `win-desktop/tests/heal-desktop-plugins.test.js`

**Interfaces:**
- Consumes: built `win-desktop/agent-teams-plugin/lib/**` and the migration-only generated patch.
- Produces: a wrapper with only desktop settings in Electron and no AgentTeams loader rewrite/static defaults.

- [ ] **Step 1: Write failing source-boundary tests**

Assert the final source has all of these properties:

```js
assert.equal(packageJson.dependencies['@nanmicoder/dsh-agent-teams'], 'file:agent-teams-plugin')
assert.doesNotMatch(rewriteSource, /rewriteAgentTeamsMemberDefaults/)
assert.doesNotMatch(desktopClientSource, /子智能体模型|agentTeamsMemberModel|agentTeamsMemberReasoningEffort/)
assert.doesNotMatch(preloadSource, /fetchModels|refreshModels/)
assert.match(agentTeamsPatch, /@nanmicoder\/dsh-agent-teams/)
assert.doesNotMatch(agentTeamsPatch, /memberModel|memberReasoningEffort/)
```

- [ ] **Step 2: Run wrapper tests and observe the old behavior failures**

Run `npm test` from `win-desktop`.

Expected: new source-boundary assertions fail against the current static patch, desktop subagent controls, and loader rewrite.

- [ ] **Step 3: Switch the dependency and install from the local package**

Set:

```json
"@nanmicoder/dsh-agent-teams": "file:agent-teams-plugin"
```

Run `npm install --ignore-scripts`, then verify:

```powershell
node -e "const p=require('./node_modules/@nanmicoder/dsh-agent-teams/package.json'); if(p.version!=='0.1.13-desktop.1') process.exit(1)"
```

Expected: exit code 0 and the lockfile resolves the local directory rather than the npm tarball.

- [ ] **Step 4: Remove only the obsolete AgentTeams paths**

- Delete `rewriteAgentTeamsMemberDefaults` and its three string-rewrite needles.
- Keep Windows console hiding and the OpenCode missing-`finish_reason` recovery unchanged.
- Remove model-fetch/refresh IPC exposure used only by the old subagent controls.
- Keep `syncOpencodeCatalog()` in `dsh-service.js`, because it serves the provider catalog independently of the desktop settings UI.
- Reduce the desktop settings section to the `窗口行为` card and its save action.
- Keep the `桌面` settings tab, tray behavior, and main settings modal integration.
- Keep the AgentTeams patch row and migration envelope; remove static member route/reasoning defaults.

- [ ] **Step 5: Run package and wrapper gates**

Run:

```powershell
Set-Location 'agent-teams-plugin'
pnpm test
Set-Location '..'
npm test
npm audit --audit-level=high
```

Expected: plugin and wrapper tests pass; audit reports 0 high/critical vulnerabilities.

- [ ] **Step 6: Commit**

```powershell
git add win-desktop
git commit -m "refactor: make AgentTeams own subagent configuration"
```

---

### Task 9: Run packaged integration and startup acceptance

**Files:**
- Modify: `win-desktop/README.md`
- Modify: `README.md`
- Create: `win-desktop/tests/agent-teams-integration.test.js`

**Interfaces:**
- Consumes: final local fork, wrapper patch graph, packaged Electron runtime, and Harness loopback UI.
- Produces: reproducible acceptance evidence for Team/Native routing, settings UI, migration, build, and startup.

- [ ] **Step 1: Add the final integration test**

The test must parse the generated patch and package metadata, import the local AgentTeams package under the console-hide loader, and assert the built client bundle contains both `settings.section` id `agent-teams` and the policy marker prefix. It must also assert the desktop plugin contains only the `desktop` section.

- [ ] **Step 2: Run the complete automated gate once after the final code change**

Run:

```powershell
Set-Location 'win-desktop/agent-teams-plugin'
pnpm typecheck
pnpm test
Set-Location '..'
npm test
npm audit
npm run dist:win
```

Expected: all plugin verifiers pass; all wrapper tests pass; audit reports 0 vulnerabilities; NSIS and ZIP artifacts are created under `win-desktop/dist/`.

- [ ] **Step 3: Perform the unpacked startup and UI smoke test**

Launch `win-desktop/dist/win-unpacked/DeepSeek Harness.exe` and verify:

1. The process remains alive for at least 30 seconds and the Harness window reaches a conversation screen.
2. Main settings shows separate `桌面` and `子智能体` tabs with the same shell/theme.
3. The model catalog reaches ready, empty, or error within 10 seconds; error exposes a retry action.
4. A new Team-mode session's first logged `request/header.system` contains `AgentTeams delegation policy: teams-v1` and none of the nine native/indirect delegation tools.
5. An AgentTeams member's logged request header shows the configured provider/model/reasoning.
6. Changing settings creates the next member on the new route while an existing member resumes on its old route.
7. A Native-mode new session contains `native-v1` and exposes the official native delegation tools.
8. Restarting the app preserves each existing session's original marker regardless of the latest global setting.

- [ ] **Step 4: Document user-visible behavior and upgrade provenance**

Update both READMEs with the `子智能体` tab, Team/Native semantics, future-member scope, local fork location, upstream baseline, and verification commands. State that no hidden reasoning or core Harness preset modification is involved.

- [ ] **Step 5: Commit the acceptance/docs slice**

```powershell
git add README.md win-desktop/README.md win-desktop/tests/agent-teams-integration.test.js
git commit -m "docs: document AgentTeams routing and verification"
```

Expected: `git status --short` is empty after the commit.
