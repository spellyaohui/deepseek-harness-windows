# AgentTeams Staging Approval and Auto Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make required-approval AgentTeams plans stay non-runnable while the Captain builds the DAG, require trustworthy revision-bound Web or chat approval, and let the Captain/Host generate Team and task names without user form input.

**Architecture:** Keep one `staged | running` runtime and add a strict staged review sub-state plus Team-level plan CAS. Isolate pure name generation, direct-user approval verification, and one-time Web credentials from `tools.ts`; both Web and chat then feed typed evidence into one approval commit barrier. The browser renders `building`, `awaiting_feedback`, and `ready_for_review` separately and never treats non-empty arrays as approval readiness.

**Tech Stack:** TypeScript 5.9, Node.js 22+, React 18, Cordis/DeepSeek Harness Alpha.2 Session and Tool contracts, Node test/assert scripts, pnpm, npm wrapper gate.

## Global Constraints

- Keep AgentTeams durable documents at strict `schemaVersion: 2`; reject old or malformed Team documents and add no Team/Profile/conversation migration layer.
- Required-approval lifecycle is exactly `building → ready_for_review → running`, with `awaiting_feedback` returning the same staged Team to Captain revision.
- Preserve Profile role Provider/model/reasoning ownership, quality gates, task dependencies, revision/attempt CAS, wait/event recovery, compact status, halt/resume, and native Subagent spawn.
- Do not restore AUTO or Stop That Shit, and do not add a second AgentTeams or Subagent runtime.
- Add no external dependency; one-time Web approval credentials use `node:crypto` and process-local memory only.
- Do not persist user approval text, Provider credentials, Web credential secrets, or patient/medical identifiers in approval provenance.
- Keep the built-in `software-delivery` usage section at or below 3,500 characters.
- `npm run verify:upstream` remains offline, performs no install/network/package operation, and must pass before completion.
- This plan does not authorize EXE/ZIP/blockmap packaging, commit push, tag, GitHub Release, or asset upload.
- Preserve unknown user files and unrelated worktree changes; do not reset, delete, or overwrite them.

---

## File Structure

New focused modules:

- `win-desktop/agent-teams-plugin/src/team-name.ts`: pure normalization and readable automatic Team-name generation.
- `win-desktop/agent-teams-plugin/src/approval-evidence.ts`: direct-user Session-event verification for chat approval.
- `win-desktop/agent-teams-plugin/src/approval-credentials.ts`: process-local, revision-bound, single-use Web credential store.
- `win-desktop/agent-teams-plugin/scripts/staging-approval-tdd.mjs`: focused pure-contract and runtime rejection tests.
- `win-desktop/agent-teams-plugin/scripts/staging-client-verify.mjs`: focused source/bundle assertions for the three-state UI and two-click approval.

Existing owners remain in place:

- `types.ts` and `state.ts` own strict durable state and plan CAS.
- `tools.ts` owns Team creation, staged mutations, chat tool authorization, approval commit, member spawn, and scheduler kick.
- `index.ts` owns the Web request boundary only; it does not duplicate approval policy.
- `snapshot.ts` and `client/activity-monitor.ts` own Host-to-Web projections.
- `client/StagingPlanEditor.tsx` owns browser transient confirmation state only.
- `command.ts` and `index.ts` usage text own compact model guidance.

---

### Task 1: Strict staged state and Team-level plan revision

**Files:**
- Modify: `win-desktop/agent-teams-plugin/src/types.ts:215-255`
- Modify: `win-desktop/agent-teams-plugin/src/state.ts:150-215, 330-365, 820-875`
- Modify: `win-desktop/agent-teams-plugin/scripts/alpha2-contract-tdd.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/stress-verify.mjs`

**Interfaces:**
- Produces: `PlanReviewState`, `ApprovalSource`, required `TeamState.planRevision`, `assertExpectedPlanRevision(team, expected)`, and automatic staged plan-revision advancement inside `writeTeam()`.
- Consumes: existing `TeamMember`, `TeamTask`, `deepEqualJson`, atomic Team writes, and task-revision advancement.

- [ ] **Step 1: Add failing state-contract tests**

Extend `scripts/alpha2-contract-tdd.mjs` with staged/running factories and assertions equivalent to:

```js
function stagedTeam(id = 'staged-plan') {
  return {
    schemaVersion: 2,
    id,
    name: 'Staged plan',
    captainSessionId: 'captain-session',
    createdAt: Date.now(),
    members: [],
    tasks: [],
    taskSeq: 0,
    planRevision: 1,
    phase: 'staged',
    planReviewState: 'building',
  }
}

const staged = stagedTeam()
await createTeamDir(stateRoot, staged)
staged.tasks.push({
  id: 't1', subject: 'planned work', status: 'pending', dependencies: [],
  revision: 1, attempt: 0, createdAt: Date.now(), updatedAt: Date.now(),
})
staged.taskSeq = 1
await writeTeam(stateRoot, staged)
assert.equal((await readTeam(stateRoot, staged.id))?.planRevision, 2)
assert.throws(() => assertExpectedPlanRevision(staged, 1), /stale plan revision 1; current revision is 2/)

const oldReviewState = { ...stagedTeam('old-review'), planReviewState: 'awaiting_review' }
await writeRawTeamFixture(stateRoot, oldReviewState)
await assert.rejects(() => readTeam(stateRoot, oldReviewState.id), /AgentTeams V2 状态无效/)

const incompleteRunning = {
  ...stagedTeam('bad-running'),
  phase: 'running',
  planReviewState: undefined,
}
await writeRawTeamFixture(stateRoot, incompleteRunning)
await assert.rejects(() => readTeam(stateRoot, incompleteRunning.id), /AgentTeams V2 状态无效/)
```

Update every existing running Team fixture in the listed scripts to carry one coherent provenance set:

```js
planRevision: 1,
approvedAt: now,
approvedPlanRevision: 1,
approvalSource: 'automatic',
approvalEvidenceId: 'automatic:create:test-team',
```

- [ ] **Step 2: Run the focused script to prove red**

Run:

```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop\agent-teams-plugin
pnpm build
node scripts/alpha2-contract-tdd.mjs
```

Expected: FAIL because `assertExpectedPlanRevision` is not exported and old `awaiting_review`/missing provenance still pass current validation.

- [ ] **Step 3: Add the strict TeamState fields**

Use these exact public types in `src/types.ts`:

```ts
export type PlanReviewState = 'building' | 'ready_for_review' | 'awaiting_feedback'
export type ApprovalSource = 'web' | 'chat' | 'automatic'

export interface TeamState {
  // existing fields remain unchanged
  planRevision: number
  phase: 'staged' | 'running'
  planReviewState?: PlanReviewState
  planReadyAt?: number
  approvedAt?: number
  approvedPlanRevision?: number
  approvalSource?: ApprovalSource
  approvalEvidenceId?: string
}
```

Do not make these fields optional through a legacy parser. New Team constructors and all tests must provide the valid shape.

- [ ] **Step 4: Implement plan-content comparison and CAS**

In `src/state.ts`, add a projection that includes only reviewable plan fields and excludes runtime session/status/attempt/output fields:

```ts
function reviewablePlan(team: TeamState): unknown {
  return {
    members: team.members.map((member) => ({
      name: member.name,
      role: member.role,
      provider: member.provider,
      model: member.model,
      reasoningMode: member.reasoningMode,
      reasoningEffort: member.reasoningEffort,
      executionPrompt: member.executionPrompt,
      fallback: member.fallback,
    })),
    tasks: team.tasks.map((task) => ({
      id: task.id,
      profileSeedId: task.profileSeedId,
      subject: task.subject,
      description: task.description,
      assignee: task.assignee,
      dependencies: task.dependencies,
      kind: task.kind,
      round: task.round,
      objective: task.objective,
      inScope: task.inScope,
      outOfScope: task.outOfScope,
      acceptance: task.acceptance,
      verify: task.verify,
      deliverables: task.deliverables,
      nonGoals: task.nonGoals,
      reviewedTaskId: task.reviewedTaskId,
      sourceTaskId: task.sourceTaskId,
      sourceFindingIds: task.sourceFindingIds,
      coverageOf: task.coverageOf,
    })),
  }
}

export function assertExpectedPlanRevision(team: TeamState, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1) {
    throw new Error('expected_plan_revision must be a positive safe integer')
  }
  if (team.planRevision !== expected) {
    throw new Error(`stale plan revision ${expected}; current revision is ${team.planRevision}`)
  }
}
```

Extend the raw prior-state snapshot used by `writeTeam()` so a staged-to-staged write increments `planRevision` exactly once when `reviewablePlan` changes. Creation requires revision 1; running writes and the staged-to-running approval transition retain the final reviewed revision.

- [ ] **Step 5: Enforce the strict state matrix**

Update `isTeamState()` to require a positive safe `planRevision` and these exact relationships:

```ts
const approvalFields = [
  value['approvedAt'], value['approvedPlanRevision'],
  value['approvalSource'], value['approvalEvidenceId'],
]
const approvalCount = approvalFields.filter((item) => item !== undefined).length

if (value['phase'] === 'staged') {
  if (value['planReviewState'] !== 'building'
    && value['planReviewState'] !== 'ready_for_review'
    && value['planReviewState'] !== 'awaiting_feedback') return false
  if (approvalCount !== 0) return false
  if (value['planReviewState'] === 'building' && value['planReadyAt'] !== undefined) return false
  if (value['planReviewState'] !== 'building' && !isFiniteNumber(value['planReadyAt'])) return false
} else {
  if (value['planReviewState'] !== undefined) return false
  if (approvalCount !== 4) return false
  if (value['approvedPlanRevision'] !== value['planRevision']) return false
  if (value['approvalSource'] !== 'web'
    && value['approvalSource'] !== 'chat'
    && value['approvalSource'] !== 'automatic') return false
  if (value['approvalSource'] === 'automatic') {
    if (value['planReadyAt'] !== undefined) return false
  } else if (!isFiniteNumber(value['planReadyAt'])) return false
}
```

Require non-empty `approvalEvidenceId` and finite `approvedAt`; reject old `awaiting_review` without normalization.

- [ ] **Step 6: Rebuild and run affected state/lifecycle tests**

Run:

```powershell
pnpm build
node scripts/alpha2-contract-tdd.mjs
node scripts/quality-gates-tdd.mjs
node scripts/lifecycle-verify.mjs
node scripts/stress-verify.mjs
```

Expected: all commands exit 0 and Alpha.2 output names both task revision/CAS and Team plan revision/CAS.

- [ ] **Step 7: Commit the state contract**

```powershell
git add -- win-desktop/agent-teams-plugin/src/types.ts win-desktop/agent-teams-plugin/src/state.ts win-desktop/agent-teams-plugin/scripts/alpha2-contract-tdd.mjs win-desktop/agent-teams-plugin/scripts/verify.mjs win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs win-desktop/agent-teams-plugin/scripts/stress-verify.mjs
git commit -m "feat(agent-teams): add strict staged plan revision"
```

---

### Task 2: Approval evidence, Web credentials, and automatic Team names

**Files:**
- Create: `win-desktop/agent-teams-plugin/src/team-name.ts`
- Create: `win-desktop/agent-teams-plugin/src/approval-evidence.ts`
- Create: `win-desktop/agent-teams-plugin/src/approval-credentials.ts`
- Create: `win-desktop/agent-teams-plugin/scripts/staging-approval-tdd.mjs`
- Modify: `win-desktop/agent-teams-plugin/package.json`

**Interfaces:**
- Produces: `automaticTeamName(description, suffix)`, `chatApprovalEvidence(events, input)`, and `createApprovalCredentialStore(options)`.
- Consumes: immutable Session events, `node:crypto.randomBytes`, positive plan revisions, and no Cordis runtime.

- [ ] **Step 1: Write failing pure-contract tests**

Create `scripts/staging-approval-tdd.mjs` with assertions covering readable names, direct-user events, generic-text rejection, credential replay, binding mismatch, expiry, and revision mismatch:

```js
import assert from 'node:assert/strict'
import { automaticTeamName } from '../lib/team-name.js'
import { chatApprovalEvidence } from '../lib/approval-evidence.js'
import { createApprovalCredentialStore } from '../lib/approval-credentials.js'

assert.equal(automaticTeamName('审查 AgentTeams 审批异常。不得连接生产', 'a1b2c3'), '审查-AgentTeams-审批异常-a1b2c3')
assert.equal(automaticTeamName(undefined, 'a1b2c3'), 'agent-team-a1b2c3')
assert.equal(automaticTeamName('检查患者姓名张三及住院号123456', 'a1b2c3'), 'agent-team-a1b2c3')

const events = [
  { type: 'turn/start', seq: 10, time: 100, data: { turn: 3 } },
  { type: 'user/message', seq: 11, time: 101, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '批准这个 AgentTeams 计划开始执行' }] } },
  { type: 'step/start', seq: 12, time: 102, data: { turn: 3, step: 0 } },
  { type: 'tool/call', seq: 13, time: 103, data: { turn: 3, step: 0, callId: 'root-1', name: 'agent_teams_approve', arguments: '{}' } },
]
assert.deepEqual(chatApprovalEvidence(events, {
  rootCallId: 'root-1', confirmation: '批准这个 AgentTeams 计划开始执行', planReadyAt: 100,
}), { eventSeq: 11, evidenceId: 'chat:user-event:11' })
const genericEvents = events.map((event) => event.type === 'user/message'
  ? { ...event, data: { ...event.data, content: [{ type: 'text', text: '继续' }] } }
  : event)
assert.throws(() => chatApprovalEvidence(genericEvents, {
  rootCallId: 'root-1', confirmation: '继续', planReadyAt: 100,
}), /explicit approval.*plan or Team/i)

let now = 1_000
const credentials = createApprovalCredentialStore({
  now: () => now,
  randomToken: () => 'secret-token',
  randomReceiptId: () => 'receipt-1',
  ttlMs: 120_000,
})
const binding = { workspace: 'w', captainSessionId: 'c', teamId: 't', planRevision: 4 }
const prepared = credentials.prepare(binding)
assert.equal(prepared.token, 'secret-token')
assert.deepEqual(credentials.consume({ ...binding, token: prepared.token }), { receiptId: 'receipt-1' })
assert.throws(() => credentials.consume({ ...binding, token: prepared.token }), /invalid or already consumed/)
```

Add separate credentials for cross-Team, stale revision, and `now > expiresAt`; every failed consume must make a subsequent correct consume fail too.

- [ ] **Step 2: Register the new focused script and prove red**

Add `node scripts/staging-approval-tdd.mjs` immediately after `alpha2-contract-tdd.mjs` in the package `verify` script.

Run:

```powershell
pnpm build
node scripts/staging-approval-tdd.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the first new module.

- [ ] **Step 3: Implement privacy-safe automatic names**

Implement `automaticTeamName()` as a pure function: normalize NFC, take text before the first sentence boundary, replace non-letter/non-number runs with `-`, trim, cap the prefix at 36 Unicode code points, fall back to `agent-team`, and append the caller-provided lowercase hex suffix.

```ts
export function automaticTeamName(description: string | undefined, suffix: string): string {
  if (!/^[a-z0-9]{6,12}$/u.test(suffix)) throw new Error('automatic team suffix is invalid')
  const raw = (description ?? '').normalize('NFC').split(/[。！？.!?\r\n]/u, 1)[0] ?? ''
  const sensitive = /(?:患者|姓名|病历号|住院号|门诊号|dicom\s*uid|accession|token|api.?key|secret|password)/iu
  const sentence = sensitive.test(raw) ? '' : raw
    .replace(/https?:\/\/\S+|\b\S+@\S+\.\S+\b|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b|\d{4,}|\b[A-Za-z0-9_-]{20,}\b/giu, ' ')
  const cleaned = sentence.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/gu, '')
  const prefix = [...cleaned].slice(0, 36).join('').replace(/-+$/u, '') || 'agent-team'
  return `${prefix}-${suffix}`
}
```

The Captain prompt remains responsible for avoiding sensitive text in explicit names; the Host fallback never persists the full description.

- [ ] **Step 4: Implement direct-user chat evidence**

Implement `chatApprovalEvidence()` so it locates the matching root `tool/call`, finds the preceding `turn/start` for that turn, selects exactly one latest direct `source.kind === 'user'` message before the call, flattens text blocks with newlines, and requires:

```ts
const APPROVAL_INTENT = /(?:批准|同意|按.{0,12}计划.{0,12}(?:执行|开始)|approve|approved|start|run)/iu
const PLAN_REFERENCE = /(?:计划|方案|团队|team|agentteams)/iu
```

Normalize whitespace in both the direct message and `confirmation`; require exact equality, `event.time >= planReadyAt`, and both patterns. Return only the seq-based evidence ID; never return or store the message text.

- [ ] **Step 5: Implement the single-use credential store**

Use a closure-owned `Map<string, CredentialRecord>`. `prepare()` validates the binding and returns only `{ token, receiptId, expiresAt, planRevision }`; `consume()` deletes the token before checking expiry or binding, compares workspace/Captain/Team/revision, and returns only `{ receiptId }`. Default factories use `randomBytes(24).toString('base64url')` for the secret token and `randomBytes(8).toString('hex')` for the receipt ID; default TTL is 120,000 ms.

- [ ] **Step 6: Run focused tests and typecheck**

```powershell
pnpm build
node scripts/staging-approval-tdd.mjs
pnpm typecheck
```

Expected: all commands exit 0; no credential token appears in error messages or snapshots.

- [ ] **Step 7: Commit the pure primitives**

```powershell
git add -- win-desktop/agent-teams-plugin/src/team-name.ts win-desktop/agent-teams-plugin/src/approval-evidence.ts win-desktop/agent-teams-plugin/src/approval-credentials.ts win-desktop/agent-teams-plugin/scripts/staging-approval-tdd.mjs win-desktop/agent-teams-plugin/package.json
git commit -m "feat(agent-teams): add trusted approval primitives"
```

---

### Task 3: Captain creation, atomic plan submission, and unified approval runtime

**Files:**
- Modify: `win-desktop/agent-teams-plugin/src/tools.ts:73-162, 271-310, 554-826, 833-1214`
- Modify: `win-desktop/agent-teams-plugin/src/profiles.ts`
- Modify: `win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/staging-approval-tdd.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs`

**Interfaces:**
- Consumes: `assertExpectedPlanRevision`, `automaticTeamName`, `chatApprovalEvidence`, `createApprovalCredentialStore`, existing `validateStagedGraph`, model selection, spawn cleanup, and scheduler.
- Produces: `StagedPlanUpdateOptions`, `ApprovalEvidence`, `prepareWebApproval()`, revision-aware `approveStagedTeam()`, optional create `name`, and `submit_for_review`.

- [ ] **Step 1: Add failing runtime lifecycle cases**

In `lifecycle-verify.mjs`, add cases that assert:

```js
const created = await call('agent_teams_create', {
  description: 'Implement trusted staged approval',
  profile: 'software-delivery',
  approval: 'required',
})
check('omitted Team name is generated', created.team_name.length > 8)
let team = await state()
check('required approval begins building', team.phase === 'staged' && team.planReviewState === 'building')

const submitted = await call('agent_teams_edit_plan', {
  operations: [{ action: 'add_task', subject: 'Implement approval', dependencies: [], assignee: 'implementer' }],
  submit_for_review: true,
})
check('atomic submission becomes ready', submitted.review_state === 'ready_for_review')

const generic = await call('agent_teams_approve', {
  confirmation: '继续', expected_plan_revision: submitted.plan_revision,
})
check('generic approval is rejected without writes', generic.status === 'approval_required' && (await state()).phase === 'staged')
```

Add a direct user-message/tool-call event fixture for successful chat approval and assert provenance equals `chat`, the approved revision stays unchanged through member spawn, and the injected plugin context contains no confirmation text.

- [ ] **Step 2: Run lifecycle tests to prove red**

```powershell
pnpm build
node scripts/lifecycle-verify.mjs
```

Expected: FAIL because create still requires `name`, staged create uses `awaiting_review`, and edit/approve schemas lack revision fields.

- [ ] **Step 3: Define typed runtime requests**

Add these contracts near `AgentTeamsRuntime`:

```ts
export type StagedPlanUpdateOptions =
  | { origin: 'captain'; submitForReview: boolean }
  | { origin: 'web'; expectedPlanRevision: number }

export type ApprovalEvidence =
  | { source: 'web'; token: string; expectedPlanRevision: number }
  | { source: 'chat'; eventSeq: number; evidenceId: string; expectedPlanRevision: number }

export interface PreparedWebApproval {
  token: string
  receiptId: string
  expiresAt: number
  planRevision: number
}

export interface ApprovedTeamResult {
  teamId: string
  members: number
  tasks: number
  planRevision: number
  approvalSource: 'web' | 'chat'
  approvalEvidenceId: string
}

export interface AgentTeamsRuntime {
  updateStagedPlan(captain: Agent, teamId: string, mutation: StagedPlanMutation, options: StagedPlanUpdateOptions, signal?: AbortSignal): Promise<TeamState>
  updateStagedPlanBatch(captain: Agent, teamId: string, mutations: readonly StagedPlanMutation[], options: StagedPlanUpdateOptions, signal?: AbortSignal): Promise<TeamState>
  prepareWebApproval(captain: Agent, teamId: string, expectedPlanRevision: number): Promise<PreparedWebApproval>
  approveStagedTeam(captain: Agent, teamId: string, evidence: ApprovalEvidence, signal?: AbortSignal): Promise<ApprovedTeamResult>
  continueStagedPlanning(captain: Agent, teamId: string): Promise<{ teamId: string; alreadyWaiting: boolean }>
  discardStagedTeam(captain: Agent, teamId: string): Promise<{ teamId: string }>
}
```

- [ ] **Step 4: Make required-approval creation building and name optional**

Change the tool schema to `name: { type: 'string', description: ... }`. Normalize blank to absent. For absent names, allocate inside the captain lock with up to 16 random six-hex suffix attempts:

```ts
const explicitName = trimmedOptional(args.name)
const candidateName = explicitName ?? automaticTeamName(args.description, randomBytes(3).toString('hex'))
```

Retry only auto-generated collisions; an explicit collision keeps the existing actionable error. Set every constructor to `planRevision: 1`; required approval uses `planReviewState: 'building'`, while automatic creation creates valid running provenance with `approvalSource: 'automatic'` and evidence ID `automatic:create:<team-id>` only if the policy intentionally chose automatic execution. This is durable policy provenance, not a third staged UI approval path and not a claim of human approval.

- [ ] **Step 5: Implement Captain/Web staged mutation semantics**

Change `updateStagedPlanBatch()` to accept options. Before Web mutation, require `ready_for_review` and exact CAS. Before Captain mutation, allow any staged review state; set `building` and delete `planReadyAt` before applying operations. Permit an empty batch only for Captain `submitForReview: true`.

After mutations:

```ts
if (options.origin === 'web') {
  validateStagedGraph(fresh, true)
  fresh.planReviewState = 'ready_for_review'
  fresh.planReadyAt = Date.now()
} else if (options.submitForReview) {
  validateStagedGraph(fresh, true)
  fresh.planReviewState = 'ready_for_review'
  fresh.planReadyAt = Date.now()
} else {
  validateStagedGraph(fresh, false)
  fresh.planReviewState = 'building'
  delete fresh.planReadyAt
}
await writeTeam(stateRoot, fresh)
```

Return the persisted state after `writeTeam()` so callers receive the incremented `planRevision`, not the pre-write object.

- [ ] **Step 6: Implement credential preparation and one approval barrier**

Instantiate one credential store per `registerAgentTeamsTools()` runtime. `prepareWebApproval()` locks the Team, requires Captain + `ready_for_review`, validates CAS and full graph, then issues the binding.

`approveStagedTeam()` must lock, require `ready_for_review`, validate CAS, consume Web credential or trust the already-verified chat evidence, validate all model selections before first spawn, spawn, then atomically write:

```ts
fresh.phase = 'running'
delete fresh.planReviewState
fresh.approvedAt = Date.now()
fresh.approvedPlanRevision = fresh.planRevision
fresh.approvalSource = evidence.source
fresh.approvalEvidenceId = evidence.source === 'web'
  ? `web:receipt:${receiptId}`
  : evidence.evidenceId
await writeTeam(stateRoot, fresh)
```

After commit, call `captain.inject(createUserMessage({ source: { kind: 'plugin', plugin: 'dsh-agent-teams' }, ... }))` with Team ID/source/revision/evidence ID only, then kick the scheduler. Injection or kick failure logs a sanitized warning and does not roll back the running Team.

- [ ] **Step 7: Enforce real chat evidence in `agent_teams_approve`**

Add `expected_plan_revision` as a required positive number schema field. Map no Team/building/stale/evidence rejection to structured statuses `inactive`, `not_ready`, `stale_plan`, and `approval_required`; only call the unified runtime after `chatApprovalEvidence(captain.session.events, { rootCallId: exec.rootCallId, confirmation: args.confirmation, planReadyAt: team.planReadyAt })` succeeds.

Add `submit_for_review` to `agent_teams_edit_plan`; include `plan_revision` and `review_state` in its output. Do not conclude the Captain turn automatically; the model must present the plan and wait for a new user turn.

- [ ] **Step 8: Run runtime, quality, and stress tests**

```powershell
pnpm build
node scripts/staging-approval-tdd.mjs
node scripts/lifecycle-verify.mjs
node scripts/quality-gates-tdd.mjs
node scripts/stress-verify.mjs
```

Expected: all exit 0; tests prove no spawn/write on rejected approval and unchanged approved revision after spawn.

- [ ] **Step 9: Commit runtime behavior**

```powershell
git add -- win-desktop/agent-teams-plugin/src/tools.ts win-desktop/agent-teams-plugin/src/profiles.ts win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs win-desktop/agent-teams-plugin/scripts/staging-approval-tdd.mjs win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs
git commit -m "feat(agent-teams): require trusted staged approval"
```

---

### Task 4: Revision-aware Host Web protocol and snapshots

**Files:**
- Modify: `win-desktop/agent-teams-plugin/src/snapshot.ts:77-91, 180-205`
- Modify: `win-desktop/agent-teams-plugin/src/client/activity-monitor.ts:58-72`
- Modify: `win-desktop/agent-teams-plugin/src/staged-plan-payload.ts`
- Modify: `win-desktop/agent-teams-plugin/src/index.ts:392-476`
- Modify: `win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/verify.mjs`

**Interfaces:**
- Consumes: runtime `prepareWebApproval`, `approveStagedTeam`, Web-origin update options, and strict positive revisions.
- Produces: snapshots with `planRevision`; JSON responses for `prepare_approval`, `approve`, and mutation CAS.

- [ ] **Step 1: Add failing payload/snapshot tests**

Extend `quality-gates-tdd.mjs` to assert `stagedPlanMutationFromPayload()` returns both mutation and revision metadata through a new parser:

```js
assert.deepEqual(stagedPlanRequestFromPayload({
  action: 'add_task', subject: 'work', expectedPlanRevision: 3,
}), {
  expectedPlanRevision: 3,
  mutation: { action: 'add_task', subject: 'work' },
})
assert.throws(() => stagedPlanRequestFromPayload({
  action: 'add_task', subject: 'work', expectedPlanRevision: 0,
}), /positive safe integer/)
assert.throws(() => stagedPlanRequestFromPayload({
  action: 'add_task', subject: 'work', expectedPlanRevision: '3',
}), /positive safe integer/)
```

Add snapshot assertions for `planReviewState: 'building' | 'ready_for_review'` and exact `planRevision`.

- [ ] **Step 2: Run focused parser tests to prove red**

```powershell
pnpm build
node scripts/quality-gates-tdd.mjs
```

Expected: FAIL because `stagedPlanRequestFromPayload` and snapshot `planRevision` do not exist.

- [ ] **Step 3: Project revision and strict staged state to Web**

Add required `planRevision: number` and the new `PlanReviewState` union to both Host `TeamActivitySnapshot` and browser `ActivityTeam`. `assembleTeamSnapshot()` must copy the fields directly and must not default an absent review state to ready.

- [ ] **Step 4: Parse revision-bound Web mutations**

Keep `stagedPlanMutationFromPayload()` for model/internal compatibility and add:

```ts
export function requiredPlanRevision(payload: Record<string, unknown>): number {
  const value = payload['expectedPlanRevision']
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error('expectedPlanRevision must be a positive safe integer')
  }
  return value
}

export function stagedPlanRequestFromPayload(payload: Record<string, unknown>): {
  expectedPlanRevision: number
  mutation: StagedPlanMutation
} {
  return {
    expectedPlanRevision: requiredPlanRevision(payload),
    mutation: stagedPlanMutationFromPayload(payload),
  }
}
```

- [ ] **Step 5: Replace direct Web approval with prepare/consume actions**

In the plan route:

```ts
if (action === 'prepare_approval') {
  const prepared = await agentTeamsRuntime.prepareWebApproval(captain, teamId, requiredPlanRevision(payload))
  return json(res, 200, { ok: true, ...prepared })
}
if (action === 'approve') {
  const token = requiredPayloadString(payload, 'approvalToken')
  const approved = await agentTeamsRuntime.approveStagedTeam(captain, teamId, {
    source: 'web', token, expectedPlanRevision: requiredPlanRevision(payload),
  })
  return json(res, 200, { ok: true, phase: 'running', ...approved })
}
const request = stagedPlanRequestFromPayload(payload)
const updated = await agentTeamsRuntime.updateStagedPlan(
  captain, teamId, request.mutation,
  { origin: 'web', expectedPlanRevision: request.expectedPlanRevision },
)
return json(res, 200, {
  ok: true, phase: updated.phase, reviewState: updated.planReviewState,
  planRevision: updated.planRevision, members: updated.members.length, tasks: updated.tasks.length,
})
```

Export `requiredPayloadString()` from `staged-plan-payload.ts`. Use this local response helper to keep 400 parse errors distinct from 409 policy/CAS conflicts:

```ts
function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
```

Never include credential records or stack traces in responses.

- [ ] **Step 6: Run Host/parser regression**

```powershell
pnpm build
node scripts/quality-gates-tdd.mjs
node scripts/verify.mjs
```

Expected: both exit 0; static Host assertions find `prepare_approval`, `expectedPlanRevision`, and Web-origin runtime options.

- [ ] **Step 7: Commit the Web Host contract**

```powershell
git add -- win-desktop/agent-teams-plugin/src/snapshot.ts win-desktop/agent-teams-plugin/src/client/activity-monitor.ts win-desktop/agent-teams-plugin/src/staged-plan-payload.ts win-desktop/agent-teams-plugin/src/index.ts win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs win-desktop/agent-teams-plugin/scripts/verify.mjs
git commit -m "feat(agent-teams): add revision-bound Web approval"
```

---

### Task 5: Three-state staging UI and two-click confirmation

**Files:**
- Create: `win-desktop/agent-teams-plugin/scripts/staging-client-verify.mjs`
- Modify: `win-desktop/agent-teams-plugin/src/client/StagingPlanEditor.tsx:18-84, 799-1017`
- Modify: `win-desktop/agent-teams-plugin/src/client/ActivityPanel.tsx:555-602`
- Modify: `win-desktop/agent-teams-plugin/src/client/ActivityPanel.module.css`
- Modify: `win-desktop/agent-teams-plugin/src/client/locales.ts`
- Modify: `win-desktop/agent-teams-plugin/package.json`

**Interfaces:**
- Consumes: `ActivityTeam.planReviewState`, `planRevision`, prepare/approve Host JSON, and ordinary polling snapshots.
- Produces: building/feedback notices, ready-only editor, and transient `PreparedApproval` browser state.

- [ ] **Step 1: Add failing client source/bundle assertions**

Create `scripts/staging-client-verify.mjs`:

```js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/client/StagingPlanEditor.tsx', import.meta.url), 'utf8')
const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

for (const text of [source, bundle]) {
  assert.match(text, /ready_for_review/)
  assert.match(text, /prepare_approval/)
  assert.match(text, /expectedPlanRevision/)
  assert.match(text, /approvalToken/)
  assert.match(text, /data-plan-approve-confirm/)
}
assert.match(source, /planReviewState === 'building'/)
assert.match(source, /planReviewState === 'awaiting_feedback'/)
assert.match(source, /planReviewState !== 'ready_for_review'/)
assert.doesNotMatch(source, /const runnable = team\.members\.length > 0 && team\.tasks\.length > 0/)
```

Add the script to package `verify` after `settings-client-verify.mjs`.

- [ ] **Step 2: Build and prove the client test is red**

```powershell
pnpm build
node scripts/staging-client-verify.mjs
```

Expected: FAIL because the source still has one-click `action: 'approve'` and array-length readiness.

- [ ] **Step 3: Return structured JSON from the client request helper**

Change `mutatePlan()` to `requestPlan<T>()` and return parsed JSON on success:

```ts
async function requestPlan<T>(payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(PLAN_URL, {
    method: 'POST', cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => ({})) as { error?: unknown }
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${response.status}`)
  return body as T
}
```

Every member/task mutation payload adds `expectedPlanRevision: team.planRevision`.

- [ ] **Step 4: Render building and feedback as non-editable states**

Keep `StagingPlanEditor` as a hook-stable wrapper and move all existing ready-plan hooks/forms into `ReadyStagingPlanEditor`; do not branch around hooks inside one component:

```tsx
export function StagingPlanEditor(props: StagingPlanEditorProps) {
  const state = props.team.planReviewState
  if (state === 'ready_for_review') return <ReadyStagingPlanEditor {...props} />
  if (state === 'building') return <StagingNotice {...props} mode="building" />
  if (state === 'awaiting_feedback') return <StagingNotice {...props} mode="feedback" />
  return <StagingNotice {...props} mode="invalid" />
}
```

`StagingNotice` has its own minimal hooks and calls a shared `discardStagedPlan(team)` request helper. It shows Team name, member/task counts and revision. Building contains no input, task/member editor, or approval button. Feedback includes “返回主对话” and discard only. Invalid state is fail-closed and offers refresh/discard, never approval.

- [ ] **Step 5: Implement prepare then confirm**

Use browser-only state:

```ts
type PreparedApproval = {
  readonly token: string
  readonly receiptId: string
  readonly expiresAt: number
  readonly planRevision: number
}
const [preparedApproval, setPreparedApproval] = useState<PreparedApproval>()
```

First click calls `prepare_approval` with current revision and renders a visible confirmation row. The confirm button has `data-plan-approve-confirm`, sends `approvalToken` and the prepared revision, and does not set local running state. Cancel clears the token. An effect clears it whenever `team.planRevision` or `team.planReviewState` changes. Busy state disables prepare/confirm/cancel duplicates.

Add a second effect that schedules `window.setTimeout()` for `expiresAt - Date.now()` and clears the prepared state at expiry; cleanup cancels the timer. The receipt ID may be shown, but the secret token must never be rendered, logged, placed in a data attribute, or copied to feedback text.

- [ ] **Step 6: Add accessible copy and styling**

Add Chinese/English locale keys for planning, revising, revision, approval prepared, expiry/stale guidance, confirm, and cancel. Use `role="status"` for building/revising and `role="alert"` for the armed confirmation. Reuse existing card colors and add a distinct bordered confirmation block; do not hide controls with CSS selectors.

- [ ] **Step 7: Run client and full plugin tests**

```powershell
pnpm build
node scripts/staging-client-verify.mjs
node scripts/settings-client-verify.mjs
node scripts/verify.mjs
pnpm typecheck
```

Expected: all exit 0; client source has no array-length `runnable` approval gate.

- [ ] **Step 8: Commit the UI**

```powershell
git add -- win-desktop/agent-teams-plugin/src/client/StagingPlanEditor.tsx win-desktop/agent-teams-plugin/src/client/ActivityPanel.tsx win-desktop/agent-teams-plugin/src/client/ActivityPanel.module.css win-desktop/agent-teams-plugin/src/client/locales.ts win-desktop/agent-teams-plugin/scripts/staging-client-verify.mjs win-desktop/agent-teams-plugin/package.json
git commit -m "feat(agent-teams): separate plan building from approval"
```

---

### Task 6: Compact Captain guidance, status next steps, and governance regressions

**Files:**
- Modify: `win-desktop/agent-teams-plugin/src/command.ts:65-82`
- Modify: `win-desktop/agent-teams-plugin/src/index.ts:170-190`
- Modify: `win-desktop/agent-teams-plugin/src/status-render.ts`
- Modify: `win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs`
- Modify: `win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs`
- Modify: `win-desktop/tests/agent-teams-integration.test.js`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: the new state/tool names and status output contract.
- Produces: lifecycle-first prompt under 3,500 characters and future-upstream invariants.

- [ ] **Step 1: Add failing guidance assertions**

Add checks that the complete usage text contains all of:

```js
[
  'building', 'ready_for_review', 'submit_for_review',
  'expected_plan_revision', 'Do not ask the user to type task names',
  'direct user message', 'Web confirmation',
]
```

Keep the existing assertion `usage.length <= 3500`. Add status assertions that staged summaries include `plan_revision`, `review_state`, and exactly one next step: continue building, wait for review, return to chat, or refresh stale state.

- [ ] **Step 2: Run guidance tests to prove red**

```powershell
pnpm build
node scripts/quality-gates-tdd.mjs
node scripts/lifecycle-verify.mjs
```

Expected: FAIL on missing new lifecycle markers.

- [ ] **Step 3: Replace the old two-state prompt compactly**

Use this semantic sequence in `usageSectionText()` and `buildActivationDirective()` without repeating paragraphs:

```text
Lifecycle: inactive -> staged/building -> staged/ready_for_review -> running -> halted/archived.
Create: generate a concise safe Team name yourself; name may be omitted for Host fallback. Captain-planning Profiles create building. Generate task subjects and the complete DAG yourself; do not ask the user to type task names. Submit one atomic edit_plan batch with submit_for_review=true.
Approval: never self-approve in create/edit turn. Chat approval requires status of ready_for_review, its plan_revision, and a new direct user statement explicitly approving the plan/Team; pass that exact text and expected_plan_revision. Generic continue/confirm is insufficient. Web uses its own two-click Host credential.
```

Retain existing reasoning ownership, Profile selection, dependencies, scheduler/attempt safety, quality gates, halt/resume, cleanup and deployment confirmation while removing duplicated staged prose to stay under 3,500 characters.

- [ ] **Step 4: Add durable maintenance invariants**

Update `AGENTS.md` and capability assertions with:

- building is never approvable;
- `ready_for_review` requires strict graph validation;
- Web approval is two-step, credential-bound and CAS-protected;
- chat approval must resolve a direct current user event;
- Team name is optional with safe Host fallback, task subjects remain required and Captain-generated;
- no old Team migration and no AUTO/Stop That Shit restoration.

- [ ] **Step 5: Run plugin and wrapper governance tests**

```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop\agent-teams-plugin
pnpm test

cd D:\Trae\其他\deepseek-harness\win-desktop
node --test tests/agent-teams-integration.test.js tests/local-capability-manifest.test.js
```

Expected: plugin test exits 0 and both wrapper test files pass.

- [ ] **Step 6: Commit guidance and invariants**

```powershell
git add -- AGENTS.md win-desktop/agent-teams-plugin/src/command.ts win-desktop/agent-teams-plugin/src/index.ts win-desktop/agent-teams-plugin/src/status-render.ts win-desktop/agent-teams-plugin/scripts/quality-gates-tdd.mjs win-desktop/agent-teams-plugin/scripts/lifecycle-verify.mjs win-desktop/tests/agent-teams-integration.test.js win-desktop/tests/local-capability-manifest.test.js
git commit -m "docs(agent-teams): enforce trusted planning lifecycle"
```

---

### Task 7: Version/provenance synchronization and complete regression

**Files:**
- Modify: `win-desktop/agent-teams-plugin/package.json`
- Modify: `win-desktop/agent-teams-plugin/UPSTREAM.md`
- Modify: `win-desktop/agent-teams-plugin/README.md`
- Modify: `win-desktop/agent-teams-plugin/README_ZH.md`
- Create: `win-desktop/agent-teams-plugin/release-notes/v0.1.14-desktop.13.md`
- Modify: `win-desktop/package.json`
- Modify: `win-desktop/package-lock.json`
- Modify: `README.md`
- Modify: `win-desktop/README.md`
- Modify: `docs/UPSTREAM_MAINTENANCE.md`
- Create: `win-desktop/release-notes/v0.1.2-rc.2.md`
- Modify: `win-desktop/tests/desktop-settings-plugin.test.js`
- Modify: `win-desktop/tests/local-plugin-artifacts.test.js`
- Modify: `win-desktop/tests/local-capability-manifest.test.js`
- Modify: `win-desktop/tests/opencode-capabilities-integration.test.js`

**Interfaces:**
- Consumes: all completed implementation and test evidence from Tasks 1-6.
- Produces: AgentTeams `0.1.14-desktop.13`, Wrapper `0.1.2-rc.2`, synchronized lockfile/provenance, and a clean full gate.

- [ ] **Step 1: Update versions only after behavior is green**

Set:

```json
// win-desktop/agent-teams-plugin/package.json
"version": "0.1.14-desktop.13"

// win-desktop/package.json
"version": "0.1.2-rc.2"
```

Update exact version assertions in the listed wrapper tests. Keep all Alpha.2 fixed tarball paths and upstream commit provenance unchanged.

- [ ] **Step 2: Regenerate the local lockfile offline**

From `win-desktop` run:

```powershell
npm install --package-lock-only --ignore-scripts --offline
```

Expected: exit 0, no network access, root lock version becomes `0.1.2-rc.2`, and `node_modules/@nanmicoder/dsh-agent-teams` lock metadata becomes `0.1.14-desktop.13`. Inspect `git diff -- package-lock.json`; reject unrelated dependency churn.

- [ ] **Step 3: Write release/provenance documentation from actual evidence**

Document these verified behaviors in both languages:

- Captain-generated Team/task names;
- building vs ready review separation;
- Web two-click credential + CAS;
- chat direct-user evidence + explicit wording;
- provenance fields and no old Team migration;
- preserved Profile/model/reasoning, quality, status-token, Subagent and wrapper compatibility behavior.

Classify the capability as `REAPPLY` against upstream AgentTeams `v0.1.14` and Harness Alpha.2 unless live source inspection proves an exact upstream equivalent. Do not claim an EXE exists or was tested.

- [ ] **Step 4: Run complete plugin verification**

```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop\agent-teams-plugin
pnpm test
```

Expected: build, typecheck, staging approval, staging client, settings, Profile, selection, Alpha.2 CAS, fallback, quality, lifecycle, stress, build-path, and Skill verification all exit 0.

- [ ] **Step 5: Run the mandatory wrapper gate**

```powershell
cd D:\Trae\其他\deepseek-harness\win-desktop
npm run verify:upstream
```

Expected: exit 0. Confirm the command performed no install, network access, package build, or release upload.

- [ ] **Step 6: Review the complete diff and repository state**

Run:

```powershell
cd D:\Trae\其他\deepseek-harness
git diff --check
git status --short --branch
git diff --stat 2934a85..HEAD
git log -8 --oneline --decorate
```

Expected: no whitespace errors; only plan-authorized source/tests/docs/lock changes; no `.agent-teams`, upstream checkout, tarball, `node_modules`, dist, installer, log, screenshot, session, credential, or runtime-state file is tracked/untracked.

- [ ] **Step 7: Perform a fresh-context code review**

Review the final diff against the design and explicitly verify:

```text
1. Every rejected approval path has zero durable writes and zero member spawn.
2. Web tokens are single-use, revision-bound, Captain/Team/workspace-bound, and never logged.
3. Chat approval uses the current direct user event, not confirmation alone.
4. Approval transition does not increment the reviewed plan revision.
5. Building UI contains no manual task-name or approval control.
6. Existing reasoning, quality, scheduler, status and Subagent contracts remain covered.
7. No legacy state parser or migration branch was added.
```

Fix any finding with a focused regression before continuing.

- [ ] **Step 8: Commit synchronized versions and evidence**

```powershell
git add -- README.md AGENTS.md docs/UPSTREAM_MAINTENANCE.md win-desktop/package.json win-desktop/package-lock.json win-desktop/README.md win-desktop/release-notes/v0.1.2-rc.2.md win-desktop/agent-teams-plugin/package.json win-desktop/agent-teams-plugin/UPSTREAM.md win-desktop/agent-teams-plugin/README.md win-desktop/agent-teams-plugin/README_ZH.md win-desktop/agent-teams-plugin/release-notes/v0.1.14-desktop.13.md win-desktop/tests/desktop-settings-plugin.test.js win-desktop/tests/local-plugin-artifacts.test.js win-desktop/tests/local-capability-manifest.test.js win-desktop/tests/opencode-capabilities-integration.test.js
git commit -m "chore: prepare trusted AgentTeams approval rc2"
```

- [ ] **Step 9: Stop at the local verified source boundary**

Report commit list, exact verification commands/exits, branch/HEAD/status, and any residual manual UI acceptance. Do not run `npm run dist:win`, do not push, and do not publish until the user separately authorizes packaging/publication.

---

## Completion Conditions

The implementation is complete only when all of the following are true:

1. Required-approval Team creation is `building`, not review-ready.
2. Captain submits the complete DAG atomically with `submit_for_review=true`.
3. Web and chat approvals both CAS the exact latest `planRevision` and carry trustworthy evidence.
4. No rejected approval spawns members, writes running state, or kicks the scheduler.
5. Building/feedback UI has no manual task-name or approval requirement; ready UI retains manual editing.
6. Automatic naming handles omitted/blank names and explicit names retain collision semantics.
7. Running Team provenance is strict and old Team documents are rejected without migration.
8. Existing AgentTeams, Models/Profile, quality, Subagent and wrapper regressions remain green.
9. AgentTeams is `0.1.14-desktop.13`, Wrapper is `0.1.2-rc.2`, and documentation matches evidence.
10. `pnpm test` and `npm run verify:upstream` exit 0, with no package/release side effects.
