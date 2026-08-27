# AgentTeams Role-Level Model Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Replace the global AgentTeams member-model authority with per-Profile-role model and reasoning policies, enforce strict V2 Profile/Team state, and remove every old-conversation compatibility path identified in the approved design.

**Architecture:** The wrapper persists a versioned V2 Profile document and injects only its validated Profile map. AgentTeams resolves each role from its own Provider/model/reasoning policy, validates the complete roster before any durable write or spawn, and freezes the resolved route in strict TeamState V2. Global model settings, migration handshakes, old-state coercion, legacy routing/cards/navigation, and missing-route cold resume are removed.

**Tech Stack:** Electron 43, Node.js ESM, React 18/TSX, TypeScript 5.9, DeepSeek Harness settings/LLM/subagent services, pnpm, Node test runner, electron-builder NSIS/ZIP.

## Global Constraints

- Work only in branch codex/agentteams-role-model-policy at D:/Trae/其他/deepseek-harness/.worktrees/agentteams-v014-refresh.
- Do not edit, delete, or migrate any real .agent-teams directory, runtime session, credential, Token, API address, screenshot, installer, package output, or unknown user file.
- Global AgentTeams settings retain only Team / Native delegation. No hidden global Provider/model/reasoning fallback may remain.
- Every persisted Profile member contains reasoning_mode: target-default | route-aware | explicit.
- Provider and model are both absent or both non-empty. Explicit additionally requires a supported reasoning_effort.
- CPA, OpenCode, and other Provider options come only from the shared Harness model catalog.
- New persisted Profile documents and Team records use schemaVersion: 2. Older formats are rejected without modifying their files.
- New-format cold resume, halt/resume, scheduling, quality gates, model fallback, and claim authorization remain supported.
- Keep memberProvider as the subagent-spawn service selector; remove only LLM route defaults.
- Use TDD for each behavior change. Replace deleted compatibility assertions with strict rejection or absence assertions.
- Do not add dependencies.
- Target versions are wrapper 0.1.1-rc.22 and AgentTeams 0.1.14-desktop.5.
- From win-desktop, npm run verify:upstream must pass before provenance acceptance and packaging.

---

### Task 1: Version the wrapper-owned Profile document

**Files:**
- Modify: win-desktop/src/agent-teams-profile-store.js
- Modify: win-desktop/src/desktop-settings.js
- Modify: win-desktop/config/agent-teams.patch.yml
- Modify: win-desktop/tests/agent-teams-profile-store.test.js
- Modify: win-desktop/tests/desktop-settings.test.js

**Interfaces:**
- Produces AGENT_TEAMS_PROFILE_SCHEMA_VERSION = 2.
- getAgentTeamsProfileSnapshot returns { schemaVersion: 2, profiles, builtInNames, builtInProfiles, unsupportedPersistedVersion }.
- writeAgentTeamsProfiles consumes { schemaVersion: 2, profiles }.
- Persists desktopSettings.agentTeamsProfiles = { schemaVersion: 2, profiles }.

- [ ] **Step 1: Write failing V2 store tests**

Add these exact cases:

~~~js
test('built-in profiles are complete V2 documents', () => {
  const snapshot = getAgentTeamsProfileSnapshot({ settings: {} })
  assert.equal(snapshot.schemaVersion, 2)
  assert.equal(snapshot.unsupportedPersistedVersion, false)
  assert.ok(snapshot.profiles['software-delivery'].members.every((member) =>
    member.reasoning_mode === 'target-default'
      && member.provider === undefined
      && member.model === undefined
      && member.reasoning_effort === undefined))
})

test('an unversioned profile map is not imported', () => {
  const snapshot = getAgentTeamsProfileSnapshot({
    settings: { agentTeamsProfiles: { custom: { members: [{ name: 'old' }] } } },
  })
  assert.equal(snapshot.unsupportedPersistedVersion, true)
  assert.deepEqual(Object.keys(snapshot.profiles), ['software-delivery'])
})

test('explicit role policy requires a complete route and effort', () => {
  assert.throws(() => writeAgentTeamsProfiles({
    schemaVersion: 2,
    profiles: { custom: { members: [{ name: 'reviewer', reasoning_mode: 'explicit' }] } },
  }, { load: () => ({}), flush: () => undefined }), /provider.*model.*reasoning_effort/i)
})

test('the static software-delivery patch is V2-complete', () => {
  const patch = readFileSync(new URL('../config/agent-teams.patch.yml', import.meta.url), 'utf8')
  assert.equal((patch.match(/reasoning_mode: target-default/g) ?? []).length, 4)
})
~~~

- [ ] **Step 2: Run RED**

From win-desktop:

~~~powershell
node --test tests/agent-teams-profile-store.test.js tests/desktop-settings.test.js
~~~

Expected: FAIL because snapshots are unversioned, built-in members lack reasoning_mode, and the writer accepts a bare map.

- [ ] **Step 3: Implement the V2 boundary**

Add:

~~~js
export const AGENT_TEAMS_PROFILE_SCHEMA_VERSION = 2

const MEMBER_KEYS = new Set([
  'name', 'role', 'provider', 'model', 'reasoning_mode',
  'reasoning_effort', 'executionPrompt', 'fallback',
])

function normalizedRequiredString(value, path) {
  const normalized = normalizedOptionalString(value, path)
  if (normalized === undefined) throw new Error(path + ' must not be empty')
  return normalized
}
~~~

In normalizedMember, enforce:

~~~js
const provider = normalizedOptionalString(value.provider, path + '.provider')
const model = normalizedOptionalString(value.model, path + '.model')
const mode = normalizedRequiredString(value.reasoning_mode, path + '.reasoning_mode')
const effort = normalizedOptionalString(value.reasoning_effort, path + '.reasoning_effort')
if ((provider === undefined) !== (model === undefined)) {
  throw new Error(path + '.provider and ' + path + '.model must be set together')
}
if (!['target-default', 'route-aware', 'explicit'].includes(mode)) {
  throw new Error(path + '.reasoning_mode is invalid')
}
if (mode === 'explicit' && (provider === undefined || model === undefined || effort === undefined)) {
  throw new Error(path + ' explicit policy requires provider, model, and reasoning_effort')
}
if (mode !== 'explicit' && effort !== undefined) {
  throw new Error(path + '.reasoning_effort is valid only for explicit policy')
}
~~~

Read an unversioned or non-V2 stored value as unsupported and expose only cloned built-ins. Saving writes the V2 document while preserving unrelated desktop settings. Add reasoning_mode: target-default to all four members in config/agent-teams.patch.yml so static and generated startup paths use the same contract.

- [ ] **Step 4: Run GREEN and commit**

~~~powershell
node --test tests/agent-teams-profile-store.test.js tests/desktop-settings.test.js
git diff --check
git add win-desktop/src/agent-teams-profile-store.js win-desktop/src/desktop-settings.js win-desktop/config/agent-teams.patch.yml win-desktop/tests/agent-teams-profile-store.test.js win-desktop/tests/desktop-settings.test.js
git commit -m "feat: require AgentTeams profile documents v2"
~~~

Expected: focused tests pass and only the four listed files are committed.

---

### Task 2: Define strict per-role selection semantics

**Files:**
- Modify: win-desktop/agent-teams-plugin/src/profiles.ts
- Modify: win-desktop/agent-teams-plugin/src/selection-policy.ts
- Modify: win-desktop/agent-teams-plugin/scripts/selection-policy-verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/verify.mjs

**Interfaces:**
- Produces RoleReasoningMode = target-default | route-aware | explicit.
- NormalizedProfileMember gains required reasoningMode.
- selectMemberCandidate consumes { captain, role } and no AgentTeamsSettings.

- [ ] **Step 1: Replace the global-precedence test with RED role cases**

~~~js
const captain = { provider: 'cpa', model: 'cheap-captain', reasoningEffort: 'high' }

assert.deepEqual(selectMemberCandidate({
  captain,
  role: { reasoningMode: 'target-default' },
}), { provider: 'cpa', model: 'cheap-captain' })

assert.deepEqual(selectMemberCandidate({
  captain,
  role: { provider: 'opencode-go', model: 'review-model', reasoningMode: 'route-aware' },
}), { provider: 'opencode-go', model: 'review-model' })

assert.deepEqual(selectMemberCandidate({
  captain,
  role: { provider: 'cpa', model: 'cheap-captain', reasoningMode: 'route-aware' },
}), { provider: 'cpa', model: 'cheap-captain', reasoningEffort: 'high' })

assert.deepEqual(selectMemberCandidate({
  captain,
  role: {
    provider: 'opencode-go',
    model: 'review-model',
    reasoningMode: 'explicit',
    reasoningEffort: 'max',
  },
}), { provider: 'opencode-go', model: 'review-model', reasoningEffort: 'max' })
~~~

Also assert Profile resolution rejects missing reasoning_mode, one-sided routes, non-explicit effort, and incomplete explicit policy.

- [ ] **Step 2: Run RED**

~~~powershell
pnpm build
node scripts/selection-policy-verify.mjs
~~~

Expected: FAIL because selection still consumes global settings and Profile members do not accept reasoning_mode.

- [ ] **Step 3: Add the strict role contract**

~~~ts
export type RoleReasoningMode = 'target-default' | 'route-aware' | 'explicit'

export interface TeamProfileMemberConfig {
  name: string
  role?: string
  provider?: string
  model?: string
  reasoning_mode: RoleReasoningMode
  reasoning_effort?: string
  executionPrompt?: string
  fallback?: TeamModelFallbackConfig
}

export interface NormalizedProfileMember {
  name: string
  role?: string
  provider?: string
  model?: string
  reasoningMode: RoleReasoningMode
  reasoningEffort?: string
  executionPrompt?: string
  fallback?: TeamModelFallbackConfig
}
~~~

Add reasoning_mode to MEMBER_KEYS and apply the same pair/mode validation as Task 1. Do not infer a mode from old fields.

- [ ] **Step 4: Replace global selection with role-only selection**

~~~ts
export function selectMemberCandidate(input: {
  captain: MemberSelectionCandidate
  role: {
    provider?: string
    model?: string
    reasoningMode: RoleReasoningMode
    reasoningEffort?: string
  }
}): MemberSelectionCandidate {
  const provider = input.role.provider ?? input.captain.provider
  const model = input.role.model ?? input.captain.model
  const sameRoute = provider === input.captain.provider && model === input.captain.model
  const reasoningEffort = input.role.reasoningMode === 'explicit'
    ? input.role.reasoningEffort
    : input.role.reasoningMode === 'route-aware' && sameRoute
      ? input.captain.reasoningEffort
      : undefined
  return { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
}
~~~

- [ ] **Step 5: Run GREEN and commit**

~~~powershell
pnpm build
node scripts/selection-policy-verify.mjs
node scripts/verify.mjs
git diff --check
git add src/profiles.ts src/selection-policy.ts scripts/selection-policy-verify.mjs scripts/verify.mjs
git commit -m "feat: make AgentTeams model policy role-specific"
~~~

Expected: all role matrix and strict Profile resolver assertions pass.

---

### Task 3: Preflight heterogeneous role rosters atomically

**Files:**
- Modify: win-desktop/agent-teams-plugin/src/members.ts
- Modify: win-desktop/agent-teams-plugin/src/tools.ts
- Modify: win-desktop/agent-teams-plugin/src/index.ts
- Modify: win-desktop/agent-teams-plugin/scripts/verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs

**Interfaces:**
- MemberLlmSelectionRequest consumes reasoningMode plus optional paired route, optional effort, and fallback.
- resolveMemberLlmSelection has no defaults or defaultModel input.
- All Profile members resolve before createTeamDir or spawnMember.

- [ ] **Step 1: Add RED mixed-provider and zero-side-effect tests**

Use:

~~~js
const profiles = {
  'economical-review': {
    taskPlanning: 'captain',
    members: [
      {
        name: 'implementer',
        provider: 'cpa',
        model: 'cheap-model',
        reasoning_mode: 'target-default',
      },
      {
        name: 'reviewer',
        provider: 'opencode-go',
        model: 'review-model',
        reasoning_mode: 'explicit',
        reasoning_effort: 'max',
      },
    ],
  },
}
~~~

Assert exact resolveCallConfig inputs. Add an unavailable reviewer model case and assert stateWrites === 0 and spawnCalls === 0.

- [ ] **Step 2: Run RED**

~~~powershell
pnpm build
node scripts/verify.mjs
node scripts/lifecycle-verify.mjs
~~~

Expected: FAIL because runtime still passes settings/defaultModel and drops reasoning_mode.

- [ ] **Step 3: Simplify member resolution**

~~~ts
export interface MemberLlmSelectionRequest {
  provider?: string
  model?: string
  reasoningMode: RoleReasoningMode
  reasoningEffort?: string
  fallback?: { provider: string; model: string }
}

const candidate = selectMemberCandidate({
  captain: captainSelection,
  role: request,
})
~~~

Keep ctx.llm.resolveCallConfig as final model/effort authority and keep sanitized Provider-list errors.

- [ ] **Step 4: Pass role policy through Profile and ad-hoc creation**

Profile call:

~~~ts
resolveMemberLlmSelection(ctx, captain, {
  provider: template.provider,
  model: template.model,
  reasoningMode: template.reasoningMode,
  reasoningEffort: template.reasoningEffort,
  fallback: template.fallback ?? profile.fallback ?? config.fallback,
}, signal)
~~~

Add reasoning_mode to agent_teams_add_member with default target-default. Empty optional route strings remain omitted, but one-sided Provider/model pairs fail before model resolution.

- [ ] **Step 5: Keep preflight before durable side effects**

The production order must be:

~~~ts
const selections = await resolveAllProfileSelections(input)
await validateMemberLlmSelections(input.ctx, selections, input.exec.signal)
await createTeamDir(input.workspace, draft)
~~~

No preflight failure may create a directory, write team.json, or spawn/retain a child.

- [ ] **Step 6: Run GREEN and commit**

~~~powershell
pnpm build
node scripts/verify.mjs
node scripts/lifecycle-verify.mjs
git diff --check
git add src/members.ts src/tools.ts src/index.ts scripts/verify.mjs scripts/lifecycle-verify.mjs
git commit -m "feat: preflight AgentTeams role model rosters"
~~~

---

### Task 4: Move all visible model controls into role cards

**Files:**
- Modify: win-desktop/agent-teams-plugin/src/client/profile-editor.ts
- Modify: win-desktop/agent-teams-plugin/src/client/desktop-bridge.ts
- Modify: win-desktop/agent-teams-plugin/src/client/TeamProfilesEditor.tsx
- Modify: win-desktop/agent-teams-plugin/src/client/AgentTeamsSettingsSection.tsx
- Modify: win-desktop/agent-teams-plugin/src/client/settings-write.ts
- Modify: win-desktop/agent-teams-plugin/src/client/locales.ts
- Modify: win-desktop/agent-teams-plugin/src/client/AgentTeamsSettingsSection.module.css
- Modify: win-desktop/agent-teams-plugin/scripts/profile-editor-verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/settings-client-verify.mjs

**Interfaces:**
- Profile snapshots include schemaVersion: 2 and unsupportedPersistedVersion; the desktop bridge setter consumes the V2 document instead of a bare map.
- createEmptyTeamProfile creates reasoning_mode: target-default.
- Global settings writers expose delegation only.

- [ ] **Step 1: Add RED editor and bundle assertions**

~~~js
const prepared = prepareProfileMapForSave({
  custom: {
    members: [{
      name: 'reviewer',
      provider: 'opencode-go',
      model: 'review-model',
      reasoning_mode: 'explicit',
      reasoning_effort: 'max',
    }],
  },
})
assert.equal(prepared.ok, true)
assert.equal(prepared.profiles.custom.members[0].reasoning_mode, 'explicit')
~~~

Assert the client bundle contains role reasoning controls and omits global IDs agent-teams-member-provider, agent-teams-member-model, and agent-teams-member-effort.

- [ ] **Step 2: Run RED**

~~~powershell
pnpm build
node scripts/profile-editor-verify.mjs
node scripts/settings-client-verify.mjs
~~~

Expected: FAIL because editor members omit reasoning_mode and global controls still render.

- [ ] **Step 3: Make editor normalization V2-strict**

Use the same TeamProfileMemberConfig contract from Task 2. createEmptyTeamProfile returns a member with reasoning_mode: target-default. prepareProfileMapForSave enforces paired routes and exact mode/effort combinations.

Save through the versioned bridge contract:

~~~ts
await bridge.setAgentTeamsProfiles({
  schemaVersion: 2,
  profiles: prepared.profiles,
})
~~~

When unsupportedPersistedVersion is true, render a warning that old Profiles are not imported and that saving creates a new V2 document; do not copy fields from the old document.

- [ ] **Step 4: Add role-card reasoning controls**

~~~tsx
{(['target-default', 'route-aware', 'explicit'] as const).map((mode) => (
  <label className={css.choice} key={mode}>
    <input
      type="radio"
      name={'agent-teams-profile-member-' + index + '-reasoning-mode'}
      checked={member.reasoning_mode === mode}
      onChange={() => onChange({
        ...member,
        reasoning_mode: mode,
        ...(mode === 'explicit' ? {} : { reasoning_effort: undefined }),
      })}
    />
    <span>{t('settings.profiles.reasoning.' + mode + '.label')}</span>
  </label>
))}
~~~

Show effort only for explicit. If the catalog is unavailable, preserve the draft, disable saving a new/changed explicit route, show the failure, and keep Retry.

- [ ] **Step 5: Remove global model/reasoning UI and writers**

Delete both global sections from AgentTeamsSettingsSection.tsx. Reduce settings-write.ts to delegation write planning plus the common write runner. Remove global model/reasoning locale copy and CSS that has no role-card consumer.

- [ ] **Step 6: Run GREEN and commit**

~~~powershell
pnpm build
node scripts/profile-editor-verify.mjs
node scripts/settings-client-verify.mjs
git diff --check
git add src/client/profile-editor.ts src/client/desktop-bridge.ts src/client/TeamProfilesEditor.tsx src/client/AgentTeamsSettingsSection.tsx src/client/settings-write.ts src/client/locales.ts src/client/AgentTeamsSettingsSection.module.css scripts/profile-editor-verify.mjs scripts/settings-client-verify.mjs
git commit -m "feat: configure AgentTeams models per role"
~~~

---

### Task 5: Remove global settings and the migration pipeline

**Files:**
- Modify: win-desktop/agent-teams-plugin/src/settings.ts
- Modify: win-desktop/agent-teams-plugin/src/index.ts
- Delete: win-desktop/agent-teams-plugin/scripts/migration-verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/settings-verify.mjs
- Modify: win-desktop/agent-teams-plugin/package.json
- Modify: win-desktop/src/dsh-service.js
- Modify: win-desktop/src/desktop-settings.js
- Modify: win-desktop/src/main.js
- Modify: win-desktop/tests/agent-teams-integration.test.js
- Modify: win-desktop/tests/desktop-settings.test.js
- Modify: win-desktop/tests/heal-desktop-plugins.test.js
- Modify: win-desktop/tests/session-markdown-export-integration.test.js

**Interfaces:**
- AgentTeamsSettings becomes { delegationMode }.
- Plugin config retains memberProvider for child spawning, fallback, Profiles, limits, and stateDir.
- Removes legacyDesktopSettings, migration status route, confirmation helpers, and legacy-key deletion.

- [ ] **Step 1: Add RED hard-cut tests**

~~~js
assert.deepEqual(normalizeAgentTeamsSettings({
  delegationMode: 'teams',
  memberLlmProvider: 'legacy-provider',
  memberModel: 'legacy-model',
  memberReasoningMode: 'explicit',
  memberReasoningEffort: 'max',
}), { delegationMode: 'teams' })
~~~

Wrapper source assertions must reject legacyDesktopSettings, /migration-status, confirmAgentTeamsMigration, applyConfirmedAgentTeamsMigration, and removeLegacyAgentTeamsSettings.

- [ ] **Step 2: Run RED**

~~~powershell
node --test tests/agent-teams-integration.test.js tests/desktop-settings.test.js tests/heal-desktop-plugins.test.js tests/session-markdown-export-integration.test.js
~~~

Expected: FAIL because the old migration envelope and handshake still exist.

- [ ] **Step 3: Collapse live settings to delegation only**

~~~ts
export interface AgentTeamsSettings {
  delegationMode: DelegationMode
}

export const DEFAULT_AGENT_TEAMS_SETTINGS: AgentTeamsSettings = {
  delegationMode: 'teams',
}

export const AgentTeamsSettingsSchema: z<AgentTeamsSettings> = z.object({
  delegationMode: z.union(['teams', 'native']).default('teams'),
})
~~~

Remove migration exports/status, global LLM validation, global config fields, usage text describing global explicit authority, and the migration HTTP route.

- [ ] **Step 4: Delete wrapper migration code**

Remove legacy key constants/accessors from desktop-settings.js; remove legacy patch lines and confirmation/apply helpers from dsh-service.js; remove their imports and startup call from main.js. Keep Profile V2 injection and close behavior unchanged.

- [ ] **Step 5: Delete obsolete verification**

Delete scripts/migration-verify.mjs and remove it from package.json verify. Replace migration assertions with source absence and normal startup-patch assertions.

- [ ] **Step 6: Run GREEN and commit**

~~~powershell
pnpm build
node scripts/settings-verify.mjs
node --test tests/agent-teams-integration.test.js tests/desktop-settings.test.js tests/heal-desktop-plugins.test.js tests/session-markdown-export-integration.test.js
git diff --check
git add -A -- src/settings.ts src/index.ts scripts/migration-verify.mjs scripts/settings-verify.mjs package.json ../src/dsh-service.js ../src/desktop-settings.js ../src/main.js ../tests/agent-teams-integration.test.js ../tests/desktop-settings.test.js ../tests/heal-desktop-plugins.test.js ../tests/session-markdown-export-integration.test.js
git commit -m "refactor: remove legacy AgentTeams model settings"
~~~

Expected: focused plugin/wrapper tests pass and no migration symbol remains in tracked source.

---

### Task 6: Enforce strict TeamState V2

**Files:**
- Modify: win-desktop/agent-teams-plugin/src/types.ts
- Modify: win-desktop/agent-teams-plugin/src/state.ts
- Modify: win-desktop/agent-teams-plugin/src/tools.ts
- Modify: win-desktop/agent-teams-plugin/src/quality-gates.ts
- Modify: win-desktop/agent-teams-plugin/src/scheduler.ts
- Modify: win-desktop/agent-teams-plugin/scripts/verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/stress-verify.mjs

**Interfaces:**
- Produces AGENT_TEAMS_STATE_SCHEMA_VERSION = 2.
- TeamState.schemaVersion and phase are required.
- Every persisted member has non-empty provider/model.
- Every task has explicit kind, including work.
- readTeam/readTeamSync perform strict V2 validation only.

- [ ] **Step 1: Replace recovery tests with V2 rejection tests**

Use this valid fixture and derive one-invalid-field fixtures:

~~~js
function teamV2(overrides = {}) {
  const now = Date.now()
  return {
    schemaVersion: 2,
    name: 'V2 Team',
    id: 'v2-team',
    captainSessionId: 'captain-session',
    createdAt: now,
    phase: 'running',
    members: [{
      id: 'member-1',
      name: 'implementer',
      provider: 'cpa',
      model: 'cheap-model',
      joinedAt: now,
      status: 'idle',
    }],
    tasks: [{
      id: 't1',
      subject: 'work',
      kind: 'work',
      status: 'pending',
      dependencies: [],
      createdAt: now,
      updatedAt: now,
    }],
    taskSeq: 1,
    ...overrides,
  }
}
~~~

Reject missing version, string Profile, missing phase, missing member route, missing kind, empty quality fields, and round: 0.

- [ ] **Step 2: Run RED**

~~~powershell
pnpm build
node scripts/verify.mjs
node scripts/quality-gates-tdd.mjs
node scripts/lifecycle-verify.mjs
~~~

Expected: FAIL because coercion loads old fixtures and writers omit V2 fields.

- [ ] **Step 3: Require V2 fields in types and writers**

~~~ts
export const AGENT_TEAMS_STATE_SCHEMA_VERSION = 2 as const

export interface TeamState {
  schemaVersion: typeof AGENT_TEAMS_STATE_SCHEMA_VERSION
  name: string
  id: string
  description?: string
  profile?: TeamProfileSnapshot
  captainSessionId: string
  createdAt: number
  members: TeamMember[]
  tasks: TeamTask[]
  taskSeq: number
  phase: 'staged' | 'running'
  planReviewState?: 'awaiting_review' | 'awaiting_feedback'
  approvedAt?: number
  halted?: boolean
  haltedAt?: number
  reviewPolicy?: ReviewPolicy
  escalated?: boolean
}
~~~

Every Team constructor writes schemaVersion: 2 and phase. Every ordinary task writes kind: work. Staged records require planReviewState; running records reject it.

- [ ] **Step 4: Delete all read coercion**

Remove coerceProfileSnapshot, coerceTeamTask, and coerceTeamState. The boundary becomes:

~~~ts
const value = JSON.parse(text)
if (!isRecord(value) || value.schemaVersion !== AGENT_TEAMS_STATE_SCHEMA_VERSION) {
  throw new Error('旧版 AgentTeams 状态不受支持，请创建新 Team')
}
if (!isTeamState(value, teamId)) {
  throw new Error('AgentTeams V2 状态无效: ' + teamId)
}
return value
~~~

Preserve files on either error.

- [ ] **Step 5: Remove missing-capability scheduling**

Require claimed/in-progress tasks to satisfy current attempt/capability/assignee invariants. Delete scheduler recovery whose only trigger is missing attemptId. Invalid V2 fails at read time.

- [ ] **Step 6: Run GREEN and commit**

~~~powershell
pnpm build
node scripts/verify.mjs
node scripts/quality-gates-tdd.mjs
node scripts/lifecycle-verify.mjs
node scripts/stress-verify.mjs
git diff --check
git add src/types.ts src/state.ts src/tools.ts src/quality-gates.ts src/scheduler.ts scripts/verify.mjs scripts/quality-gates-tdd.mjs scripts/lifecycle-verify.mjs scripts/stress-verify.mjs
git commit -m "refactor: require AgentTeams state v2"
~~~

---

### Task 7: Remove legacy conversation routing and UI paths

**Files:**
- Modify: win-desktop/agent-teams-plugin/src/routing-policy.ts
- Modify: win-desktop/agent-teams-plugin/src/members.ts
- Modify: win-desktop/agent-teams-plugin/src/client/ActivityPanel.tsx
- Modify: win-desktop/agent-teams-plugin/src/client/activity-monitor.ts
- Modify: win-desktop/agent-teams-plugin/src/client/index.tsx
- Modify: win-desktop/agent-teams-plugin/src/client/session-navigation.ts
- Modify: win-desktop/agent-teams-plugin/scripts/routing-policy-verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/verify.mjs

**Interfaces:**
- Unmarked sessions use current defaultMode; parent policy still controls fresh children.
- Cold-resumed members require exact V2 route snapshots.
- Activity renders current V2 live/archive snapshots only.
- Member navigation uses addressed continuable-child navigation only.

- [ ] **Step 1: Add RED hard-cut assertions**

~~~js
check('unmarked established session uses current Team setting', resolveDelegationPolicy({
  events: [event('user/message')],
  defaultMode: 'teams',
}) === 'teams-v1')
~~~

Assert the client bundle has no historicCardTeam and no ordinary sessions.open(childId) fallback. A durable member without Provider/model must make cold setup reject.

- [ ] **Step 2: Run RED**

~~~powershell
pnpm build
node scripts/routing-policy-verify.mjs
node scripts/lifecycle-verify.mjs
node scripts/verify.mjs
~~~

Expected: FAIL on legacy Native routing, historic projection, navigation fallback, and missing-route recovery.

- [ ] **Step 3: Simplify policy resolution**

~~~ts
export function resolveDelegationPolicy(input: {
  events: readonly SessionEvent[]
  defaultMode: DelegationMode
  parentPolicy?: DelegationPolicyId
}): DelegationPolicyId {
  return persistedPolicy(input.events)
    ?? input.parentPolicy
    ?? (input.defaultMode === 'teams' ? 'teams-v1' : 'native-v1')
}
~~~

Delete hasEstablishedHistory and its tests.

- [ ] **Step 4: Require exact V2 member selection on cold resume**

selectionFromMember throws when member/provider/model is missing. Keep descriptor equality checks and exact frozen effort/fallback restoration. Fresh pending selection remains unchanged.

- [ ] **Step 5: Delete historic cards/archive retirement/navigation fallback**

Remove historicCardTeam, orphaned legacy-card retirement, and pre-rc.8 ordinary navigation. Addressed navigation failure is logged; it must not open a different session.

- [ ] **Step 6: Run GREEN and commit**

~~~powershell
pnpm build
node scripts/routing-policy-verify.mjs
node scripts/lifecycle-verify.mjs
node scripts/verify.mjs
git diff --check
git add src/routing-policy.ts src/members.ts src/client/ActivityPanel.tsx src/client/activity-monitor.ts src/client/index.tsx src/client/session-navigation.ts scripts/routing-policy-verify.mjs scripts/lifecycle-verify.mjs scripts/verify.mjs
git commit -m "refactor: remove legacy AgentTeams conversation paths"
~~~

---

### Task 8: Close cross-package V2 regressions

**Files:**
- Modify: win-desktop/agent-teams-plugin/scripts/verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/stress-verify.mjs
- Modify: win-desktop/agent-teams-plugin/scripts/profile-editor-verify.mjs
- Modify: win-desktop/tests/agent-teams-integration.test.js
- Modify: win-desktop/tests/agent-teams-profile-store.test.js
- Modify: win-desktop/tests/desktop-settings-plugin.test.js

**Interfaces:**
- Wrapper V2 injection and plugin V2 parsing agree.
- Integrated lifecycle proves mixed Provider roles and exact V2 cold resume.

- [ ] **Step 1: Add RED cross-boundary assertions**

~~~js
assert.equal(snapshot.schemaVersion, 2)
assert.equal(
  agentTeams.config.profiles['software-delivery'].members[0].reasoning_mode,
  'target-default',
)
assert.doesNotMatch(patchText, /legacyDesktopSettings|memberModel|memberLlmProvider/)
~~~

Require schemaVersion: 2, paired routes, and absence of migration/coercion functions.

- [ ] **Step 2: Run focused wrapper tests**

~~~powershell
node --test tests/agent-teams-integration.test.js tests/agent-teams-profile-store.test.js tests/desktop-settings-plugin.test.js
~~~

Expected initial result: FAIL on any remaining V2 contract mismatch. Fix only those production/contract gaps, then rerun to zero failures.

- [ ] **Step 3: Run full AgentTeams test**

From win-desktop/agent-teams-plugin:

~~~powershell
pnpm test
~~~

Expected: all build, settings, client, Profile, selection, state, quality, lifecycle, stress, build-path, and skill checks pass.

- [ ] **Step 4: Commit integrated closure if files changed**

~~~powershell
git diff --check
git add scripts/verify.mjs scripts/lifecycle-verify.mjs scripts/stress-verify.mjs scripts/profile-editor-verify.mjs ../tests/agent-teams-integration.test.js ../tests/agent-teams-profile-store.test.js ../tests/desktop-settings-plugin.test.js
git commit -m "test: enforce AgentTeams v2 integration"
~~~

Do not create an empty commit.

---

### Task 9: Synchronize versions, ownership, README, and release notes

**Files:**
- Modify: win-desktop/agent-teams-plugin/package.json
- Modify: win-desktop/agent-teams-plugin/pnpm-lock.yaml
- Create: win-desktop/agent-teams-plugin/release-notes/v0.1.14-desktop.5.md
- Modify: win-desktop/agent-teams-plugin/README.md
- Modify: win-desktop/agent-teams-plugin/README_ZH.md
- Modify: win-desktop/agent-teams-plugin/UPSTREAM.md
- Modify: win-desktop/package.json
- Modify: win-desktop/package-lock.json
- Modify: README.md
- Modify: win-desktop/README.md
- Modify: docs/UPSTREAM_MAINTENANCE.md
- Modify: win-desktop/tests/local-capability-manifest.test.js
- Modify: win-desktop/tests/local-plugin-artifacts.test.js

**Interfaces:**
- AgentTeams becomes 0.1.14-desktop.5.
- Wrapper becomes 0.1.1-rc.22.
- Registry classifies role-level authority and strict V2 as REAPPLY unless fresh upstream evidence proves equivalence.

- [ ] **Step 1: Update package and lock versions**

Change both package files and exact local lock entries. Do not run npm install or pnpm install.

- [ ] **Step 2: Create exact release notes**

~~~markdown
# v0.1.14-desktop.5

- Member Provider, model, and reasoning policy are configured per Profile role.
- Global member-model and reasoning settings were removed.
- AgentTeams Profile documents and Team state now require schemaVersion 2.
- Older Profile/Team state is left on disk but is not loaded or migrated; create a new Profile and Team.
- CPA and OpenCode models continue to come from the shared Harness catalog.
~~~

- [ ] **Step 3: Update documentation**

Document role-card workflow, software-delivery defaults, strict V2, restart requirement, and old-data error. Remove promises for old settings migration, old Team loading, global explicit authority, historic card fallback, and legacy member navigation.

- [ ] **Step 4: Update capability assertions**

Require versions, reasoning_mode, schemaVersion: 2, role-level controls, and absence of migration/coercion symbols.

- [ ] **Step 5: Run focused checks and commit**

From win-desktop:

~~~powershell
node --test tests/local-capability-manifest.test.js tests/local-plugin-artifacts.test.js
git diff --check
git add ../README.md ../docs/UPSTREAM_MAINTENANCE.md README.md package.json package-lock.json tests/local-capability-manifest.test.js tests/local-plugin-artifacts.test.js agent-teams-plugin/package.json agent-teams-plugin/pnpm-lock.yaml agent-teams-plugin/release-notes/v0.1.14-desktop.5.md agent-teams-plugin/README.md agent-teams-plugin/README_ZH.md agent-teams-plugin/UPSTREAM.md
git commit -m "chore: prepare AgentTeams role policy release"
~~~

---

### Task 10: Run mandatory gates and build Windows artifacts

**Files:**
- Verify: all tracked source/docs/tests above
- Build output, ignored: win-desktop/dist/DeepSeek-Harness-0.1.1-rc.22-windows-x64.exe
- Build output, ignored: win-desktop/dist/DeepSeek-Harness-0.1.1-rc.22-windows-x64.zip
- Build output, ignored: win-desktop/dist/DeepSeek-Harness-0.1.1-rc.22-windows-x64.exe.blockmap

**Interfaces:**
- Produces fresh local verification evidence and artifacts.
- Does not publish, tag, merge, or upload without a later explicit request.

- [ ] **Step 1: Run full plugin test**

From win-desktop/agent-teams-plugin:

~~~powershell
pnpm test
~~~

Expected: every AgentTeams build/verification script passes.

- [ ] **Step 2: Run mandatory upstream gate**

From win-desktop:

~~~powershell
npm run verify:upstream
~~~

Expected: all local plugin compilation, artifact synchronization, wrapper integration, and upstream-preservation assertions pass without package installation, packaging, or network access.

- [ ] **Step 3: Run wrapper tests**

~~~powershell
npm test
~~~

Expected: zero failures; record the exact pass count.

- [ ] **Step 4: Build NSIS and ZIP**

~~~powershell
npm run dist:win
~~~

Expected: rc.22 EXE, ZIP, and blockmap. An unsigned warning is acceptable only if no signing certificate is configured.

- [ ] **Step 5: Verify artifacts**

~~~powershell
Get-FileHash 'dist/DeepSeek-Harness-0.1.1-rc.22-windows-x64.exe' -Algorithm SHA256
Get-FileHash 'dist/DeepSeek-Harness-0.1.1-rc.22-windows-x64.zip' -Algorithm SHA256
Get-AuthenticodeSignature 'dist/DeepSeek-Harness-0.1.1-rc.22-windows-x64.exe' | Select-Object Status, StatusMessage
~~~

Inspect unpacked package metadata for wrapper 0.1.1-rc.22 and AgentTeams 0.1.14-desktop.5. Assert packed code contains schemaVersion 2 and reasoning_mode, and omits migration/coercion symbols.

- [ ] **Step 6: Restore only known generated churn and verify source state**

If the gate rewrites tracked generated lib files outside this task, compare each exact path to HEAD and restore only that known generated path. Never delete unknown files or reset the worktree.

~~~powershell
git status --short --branch
git diff --check
git log -10 --oneline
~~~

Expected: no uncommitted tracked source change; ignored artifacts remain local.

- [ ] **Step 7: Final review**

Review the branch diff against origin/main for role precedence, absence of global settings, strict V2, removal of old-conversation adapters, CPA/OpenCode catalog neutrality, version/provenance synchronization, and absence of credentials/build outputs. Do not publish or merge until the user tests and explicitly requests GitHub submission.
