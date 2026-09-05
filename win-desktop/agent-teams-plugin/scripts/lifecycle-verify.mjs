/**
 * Adversarial production-tool conformance verification.
 *
 * This intentionally models the Harness contract where listChildren says
 * "running" for every resident child while the live Agent registry carries
 * the real idle/running state. It drives the actual compiled tool definitions
 * through a multi-member DAG, takeover, stale completion, automatic later
 * rounds, removal recovery, mailbox fallback and concurrent claims.
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { failMemberOpenAttempt } from '../lib/members.js'
import { haltTeamWork, registerAgentTeamsTools } from '../lib/tools.js'
import { buildActivationDirective, invokedAgentTeamsGoal, invokedAgentTeamsInvocation, installAgentTeamsGestureBoundary, profileCommandName, registerAgentTeamsCommand } from '../lib/command.js'
import { createTeamDir, readArchivedTeam, readTeam, readUnreadMailbox, writeTeam } from '../lib/state.js'
import { assembleTeamSnapshot, collectArchivedTeamsActivity, memberModelRoute } from '../lib/snapshot.js'
import { stagedPlanMutationFromPayload } from '../lib/staged-plan-payload.js'
import { buildStagedTaskMutationPayload } from '../lib/client/staged-task-mutation.js'
import { snapshotSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import {
  NATIVE_DELEGATION_TOOLS,
  policyMarker,
  registerDelegationPolicyLifecycle,
} from '../lib/routing-policy.js'

const workspace = await mkdtemp(join(tmpdir(), 'dsh-agent-teams-lifecycle-'))
const definitions = new Map()
const liveAgents = new Map()
const children = []
const roleInheritanceMemberNames = [
  'analyst', 'implementer', 'tester', 'reviewer',
  'reviewer2', 'reviewer3', 'analyst2', 'implementer2', 'tester2',
  'reviewer5', 'reviewer6', 'reviewer4', 'custom-role2',
]
const deliveries = []
const listeners = new Map()
const failNextDelivery = new Set()
const failures = []
const continuableSetups = []
const lifecycleSections = new WeakMap()
const lifecycleDenials = new WeakMap()
let heldFollowup
let childSeq = 0
let messageSeq = 0
let memberDefaults = {
  delegationMode: 'teams',
}

function check(label, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL'
  console.log(`  ${status}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures.push(label)
}

async function waitFor(description, read, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value !== undefined && value !== false) return value
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error(`timed out waiting for ${description}`)
}

console.log('durable Team/Native routing policy')
const policyTools = new Set([
  ...NATIVE_DELEGATION_TOOLS,
  'read_file',
  'agent_teams_send_message',
  'agent_teams_update_task',
])
const policyAgents = new Map()
const policyListeners = []
const policySections = new WeakMap()
const policyDenials = new WeakMap()
let defaultDelegationMode = 'teams'

function policySession(events = [], parentSession) {
  return {
    header: { parentSession, seedLength: 0 },
    events,
  }
}

function policyAgent(id, events = [], parentSession, availableTools = policyTools) {
  const subject = {
    id,
    session: policySession(events, parentSession),
    options: { provider: 'fake', model: 'fake-model' },
  }
  subject.ctx = {
    systemPrompt: {
      section(section) {
        policySections.set(subject, section)
        return () => policySections.delete(subject)
      },
    },
    tools: {
      get(name) {
        return availableTools.has(name) && !policyDenials.get(subject)?.has(name)
          ? { name }
          : undefined
      },
      restrict({ deny }) {
        const previous = policyDenials.get(subject) ?? new Set()
        const next = new Set([...previous, ...deny])
        policyDenials.set(subject, next)
        return () => policyDenials.set(subject, previous)
      },
    },
  }
  return subject
}

const policyCtx = {
  agents: { get: id => policyAgents.get(id) },
  on(name, listener) {
    if (name === 'agent/created') policyListeners.push(listener)
    return () => {
      const index = policyListeners.indexOf(listener)
      if (index >= 0) policyListeners.splice(index, 1)
    }
  },
}
registerDelegationPolicyLifecycle(policyCtx, {
  defaultMode: () => defaultDelegationMode,
  order: 117,
  text: policy => `${policyMarker(policy)}\n\npolicy-specific usage`,
})

function announcePolicyAgent(subject) {
  policyAgents.set(subject.id, subject)
  for (const listener of policyListeners) listener({ agent: subject })
}

function visiblePolicyTools(subject) {
  return [...policyTools].filter(name => subject.ctx.tools.get(name, subject) !== undefined)
}

const teamCaptain = policyAgent('policy-team-captain')
announcePolicyAgent(teamCaptain)
check('Team captain prompt contains the durable teams-v1 marker',
  policySections.get(teamCaptain)?.text.includes(policyMarker('teams-v1')))
check('Team captain assembled tools contain no native delegation deny-list name',
  NATIVE_DELEGATION_TOOLS.every(name => !visiblePolicyTools(teamCaptain).includes(name)))

const sparseTeamCaptain = policyAgent(
  'policy-sparse-team-captain',
  [],
  undefined,
  new Set(['subagent', 'read_file']),
)
announcePolicyAgent(sparseTeamCaptain)
check('Team restriction excludes absent optional native tools from its deny list',
  JSON.stringify([...policyDenials.get(sparseTeamCaptain)]) === JSON.stringify(['subagent']))

const teamMember = policyAgent('policy-team-member', [], teamCaptain.id)
announcePolicyAgent(teamMember)
check('fresh child inherits the live parent Team policy',
  policySections.get(teamMember)?.text.includes(policyMarker('teams-v1'))
    && NATIVE_DELEGATION_TOOLS.every(name => !visiblePolicyTools(teamMember).includes(name)))
check('Team restriction preserves member-local AgentTeams reporting tools',
  ['agent_teams_send_message', 'agent_teams_update_task']
    .every(name => visiblePolicyTools(teamMember).includes(name)))

defaultDelegationMode = 'native'
const nativeCaptain = policyAgent('policy-native-captain')
announcePolicyAgent(nativeCaptain)
check('Native policy leaves official delegation tools visible',
  NATIVE_DELEGATION_TOOLS.every(name => visiblePolicyTools(nativeCaptain).includes(name)))

teamCaptain.session.events.push({
  type: 'request/header',
  data: {
    header: {
      config: { provider: 'fake', model: 'fake-model' },
      system: `${policyMarker('teams-v1')}\n\npolicy-specific usage`,
    },
    reason: 'initial',
  },
})
const restoredTeamCaptain = policyAgent('policy-team-restored', teamCaptain.session.events)
announcePolicyAgent(restoredTeamCaptain)
check('settings changes do not change a restored durable Team policy',
  policySections.get(restoredTeamCaptain)?.text.includes(policyMarker('teams-v1'))
    && NATIVE_DELEGATION_TOOLS.every(name => !visiblePolicyTools(restoredTeamCaptain).includes(name)))

defaultDelegationMode = 'teams'
const legacyCaptain = policyAgent('policy-legacy-captain', [{ type: 'user/message', data: {} }])
announcePolicyAgent(legacyCaptain)
check('unmarked session without a marker uses the current default mode',
  policySections.get(legacyCaptain)?.text.includes(policyMarker('teams-v1'))
    && NATIVE_DELEGATION_TOOLS.every(name => !visiblePolicyTools(legacyCaptain).includes(name)))

function session(parentSession) {
  return {
    header: { cwd: workspace, parentSession, seedLength: 0 },
    events: [],
    append() {},
    requestHeader() {
      return { config: { provider: 'fake', model: 'fake-model', reasoningEffort: 'high' } }
    },
  }
}

function makeAgent(id, parentSession) {
  const subject = {
    id,
    status: 'idle',
    options: { provider: 'fake', model: 'fake-model' },
    session: session(parentSession),
    followups: [],
    injections: [],
    followup(message) {
      this.followups.push(message)
    },
    steer() {},
    inject(message) {
      this.injections.push(message)
    },
    cancel(cause, options) {
      this.cancelCount = (this.cancelCount ?? 0) + 1
      this.lastCancel = { cause, options }
    },
    whenIdle() {
      return this.status === 'idle' ? Promise.resolve() : new Promise(resolve => { this._idle = resolve })
    },
  }
  const agentListeners = new Map()
  subject.ctx = {
    agent: subject,
    on(name, listener) {
      agentListeners.set(name, listener)
      return () => agentListeners.delete(name)
    },
    systemPrompt: {
      section(section) {
        lifecycleSections.set(subject, section)
        return () => lifecycleSections.delete(subject)
      },
    },
    tools: {
      get(name) {
        const exists = definitions.has(name) || NATIVE_DELEGATION_TOOLS.includes(name)
        return exists && !lifecycleDenials.get(subject)?.has(name) ? { name } : undefined
      },
      restrict({ deny }) {
        const previous = lifecycleDenials.get(subject) ?? new Set()
        lifecycleDenials.set(subject, new Set([...previous, ...deny]))
        return () => lifecycleDenials.set(subject, previous)
      },
    },
  }
  return subject
}

function publishStatus(subject, status) {
  subject.status = status
  if (status === 'idle') {
    subject._idle?.()
    subject._idle = undefined
  }
  for (const listener of listeners.get('agent/status') ?? []) listener({ agent: subject, status })
}

const captain = makeAgent('captain-session')
captain.session.events.push({
  type: 'request/header',
  data: {
    header: {
      config: { provider: 'fake', model: 'fake-model' },
      system: policyMarker('teams-v1'),
    },
    reason: 'initial',
  },
})
liveAgents.set(captain.id, captain)
let advertisedModels = []
const modelResolutionCalls = []
const profilePersistenceCalls = { createTeamDir: 0, writeTeam: 0 }

function holdFollowupFor(childId) {
  let enteredResolve
  let releaseResolve
  const held = {
    childId,
    entered: new Promise(resolve => { enteredResolve = resolve }),
    released: new Promise(resolve => { releaseResolve = resolve }),
    release() {
      releaseResolve?.()
    },
  }
  heldFollowup = { ...held, enter: () => enteredResolve?.() }
  return held
}
// A non-AgentTeams continuable sibling must survive every team lifecycle
// operation untouched.
children.push({ id: 'foreign-session', label: 'unrelated continuable', mode: 'continuable' })

const ctx = {
  effect(setup) { return setup() },
  tools: {
    register(definition) {
      definitions.set(definition.name, definition)
    },
  },
  on(name, listener) {
    const current = listeners.get(name) ?? []
    current.push(listener)
    listeners.set(name, current)
    return () => listeners.set(name, current.filter(candidate => candidate !== listener))
  },
  agents: {
    get(id) {
      return liveAgents.get(id)
    },
  },
  llm: {
    async resolveCallConfig(config) {
      modelResolutionCalls.push(config)
      if (config.provider === 'fake-materialized' && config.model === 'fake-materialized-model' && config.reasoningEffort === undefined) {
        return { ...config, reasoningEffort: 'materialized-default' }
      }
      return config
    },
    async listModels(provider) {
      return advertisedModels.map(model => ({ provider, id: model, name: model }))
    },
  },
  subagents: {
    registerContinuableSetup(setup) {
      continuableSetups.push(setup)
      return () => {}
    },
    getProvider(name) {
      if (name !== 'spawn') return undefined
      return { prepareContinuable() {}, capabilities: { persona: true, toolFilter: true } }
    },
    list() {
      return ['spawn']
    },
    async startContinuable(spec) {
      const id = `member-session-${++childSeq}`
      const child = makeAgent(id, captain.id)
      child.session.events.push({
        type: 'subagent/descriptor',
        data: snapshotSubagentDescriptor({
          mode: 'continuable',
          provider: spec.provider,
          label: spec.label,
          agentProvider: spec.request.agentOptions.provider,
          agentModel: spec.request.agentOptions.model,
        }),
      })
      lifecycleDenials.set(child, new Set(spec.request.toolFilter?.deny ?? []))
      for (const setup of continuableSetups) setup(child.ctx)
      child.status = 'running'
      liveAgents.set(id, child)
      children.push({ id, label: spec.label, mode: 'continuable' })
      return { childId: id, messageId: `welcome-${childSeq}` }
    },
    async listChildren(parentId) {
      if (parentId !== captain.id) return []
      return children.map(child => ({
        kind: 'child', mode: child.mode, id: child.id, label: child.label,
        // Residency, intentionally not the Agent's real status.
        activity: liveAgents.has(child.id) ? 'running' : 'inactive',
        hasChildren: false,
      }))
    },
    async listDescendants(parentId) {
      return this.listChildren(parentId)
    },
    async followup(_parent, childId, content) {
      if (failNextDelivery.delete(childId)) throw new Error('injected delivery failure')
      if (heldFollowup?.childId === childId) {
        heldFollowup.enter()
        await heldFollowup.released
      }
      deliveries.push({ childId, content })
      const child = liveAgents.get(childId)
      if (child) child.status = 'running'
      return `message-${++messageSeq}`
    },
    interrupt(childId) {
      const child = liveAgents.get(childId)
      if (child) {
        child.interruptCount = (child.interruptCount ?? 0) + 1
        publishStatus(child, 'idle')
      }
    },
    async drainContinuableChildren(parent, childIds) {
      for (const childId of childIds) {
        const child = liveAgents.get(childId)
        if (child) {
          child.drainCount = (child.drainCount ?? 0) + 1
          publishStatus(child, 'idle')
          liveAgents.delete(childId)
        }
      }
      void parent
    },
  },
  logger: { debug() {}, warn() {} },
}

const agentTeamsRuntime = registerAgentTeamsTools(ctx, {
  stateDir: '.agent-teams',
  memberProvider: 'spawn',
  settings: {
    get: () => memberDefaults,
  },
  memberMaxDepth: 1,
  maxMembers: roleInheritanceMemberNames.length,
  delegationPolicy: {
    defaultMode: () => memberDefaults.delegationMode,
    order: 117,
    text: policy => `${policyMarker(policy)}\n\nmember policy usage`,
  },
  testObserver: {
    onInitializeProfileTeamPersistence(operation) {
      profilePersistenceCalls[operation] += 1
    },
  },
  profiles: {
    'demo-delivery': {
      description: 'tiny delivery team',
      protocol: 'Discuss, then implement. Do not invent unanswered questions.',
      members: [
        { name: 'analyst', role: 'requirements', provider: 'fake', model: 'fake-analyst', reasoning_mode: 'target-default' },
        { name: 'implementer', role: 'builder', provider: 'fake', model: 'fake-implementer', reasoning_mode: 'target-default' },
      ],
      tasks: [
        { id: 'requirements', subject: 'Requirements', assignee: 'analyst', description: 'Write the first cut.' },
        { id: 'implement', subject: 'Implement', assignee: 'implementer', dependencies: ['requirements'], description: 'Build from the approved requirements.' },
      ],
    },
    'dynamic-delivery': {
      description: 'roster only',
      protocol: 'Plan from the goal. Do not invent unanswered questions.',
      taskPlanning: 'captain',
      members: [
        { name: 'analyst', role: 'requirements analyst', provider: 'fake', model: 'fake-analyst', reasoning_mode: 'target-default' },
        { name: 'implementer', role: 'implementer', provider: 'fake', model: 'fake-implementer', reasoning_mode: 'target-default' },
        { name: 'tester', role: 'test engineer', provider: 'fake', model: 'fake-tester', reasoning_mode: 'target-default' },
        { name: 'reviewer', role: 'code reviewer', provider: 'fake', model: 'fake-reviewer', reasoning_mode: 'target-default' },
        { name: 'release', role: 'release engineer', provider: 'fake', model: 'fake-release', reasoning_mode: 'target-default' },
      ],
      tasks: [],
    },
    'software-delivery': {
      taskPlanning: 'captain',
      members: [
        { name: 'implementer', role: 'builder', provider: 'fake', model: 'fake-implementer', reasoning_mode: 'target-default' },
      ],
      tasks: [],
    },
    'role-policy': {
      taskPlanning: 'captain',
      members: [
        { name: 'implementer', role: 'builder', reasoning_mode: 'target-default' },
        { name: 'reviewer', role: 'reviewer', provider: 'opencode-go', model: 'review-model', reasoning_mode: 'explicit', reasoning_effort: 'max' },
      ],
    },
    'role-policy-invalid': {
      taskPlanning: 'captain',
      members: [
        { name: 'implementer', role: 'builder', reasoning_mode: 'target-default' },
        { name: 'reviewer', role: 'reviewer', provider: 'opencode-go', model: 'unavailable-review-model', reasoning_mode: 'explicit', reasoning_effort: 'max' },
      ],
    },
    'rule-role-inheritance': {
      taskPlanning: 'captain',
      members: [
        { name: 'analyst', role: 'requirements analyst', provider: 'fake', model: 'fake-analyst', reasoning_mode: 'explicit', reasoning_effort: 'low' },
        { name: 'implementer', role: 'implementation engineer', provider: 'fake', model: 'fake-implementer', reasoning_mode: 'explicit', reasoning_effort: 'high' },
        { name: 'tester', role: 'verification engineer', provider: 'fake', model: 'fake-tester', reasoning_mode: 'explicit', reasoning_effort: 'max' },
        { name: 'reviewer', role: 'code and risk reviewer', provider: 'fake', model: 'fake-reviewer', reasoning_mode: 'explicit', reasoning_effort: 'xhigh' },
      ],
    },
  },})

function execFor(subject, extra = {}) {
  return { agent: subject, signal: new AbortController().signal, ...extra }
}

async function call(name, args, subject = captain, extra = {}) {
  const definition = definitions.get(name)
  if (!definition) throw new Error(`missing tool ${name}`)
  return definition.execute(args, execFor(subject, extra))
}

async function callAsModel(name, args, subject = captain, extra = {}) {
  const definition = definitions.get(name)
  if (!definition) throw new Error(`missing tool ${name}`)
  const parameters = definition.parameters?.properties ?? {}
  const normalizedArgs = { ...args }
  for (const [key, schema] of Object.entries(parameters)) {
    if (normalizedArgs[key] === undefined && schema?.default !== undefined) {
      normalizedArgs[key] = schema.default
    }
  }
  return definition.execute(normalizedArgs, execFor(subject, extra))
}

function deliveryText(delivery) {
  if (!delivery) return ''
  if (!Array.isArray(delivery.content)) return String(delivery.content)
  return delivery.content.map(block => block?.text ?? '').join('')
}

const teamId = 'lifecycle'
const stateRoot = join(workspace, '.agent-teams')
const state = () => readTeam(stateRoot, teamId)
const task = async id => (await state())?.tasks.find(candidate => candidate.id === id)

console.log('dsh-agent-teams lifecycle verification')

const stagedExecutionGuard = await call('agent_teams_create', {
  name: 'Staged Execution Guard',
  description: 'Prove staged task execution cannot bypass approval',
  profile: 'software-delivery',
  approval: 'required',
})
const stagedExecutionPlan = await call('agent_teams_edit_plan', {
  operations: [
    { action: 'add_task', subject: 'Must remain pending', dependencies: [], assignee: 'implementer' },
    { action: 'add_task', subject: 'Must not be taken over', dependencies: [], assignee: 'implementer' },
  ],
  submit_for_review: true,
})
const stagedExecutionBefore = JSON.stringify(await readTeam(stateRoot, stagedExecutionGuard.team_id))
const stagedExecutionChildrenBefore = childSeq
const stagedExecutionDeliveriesBefore = deliveries.length
let stagedClaimRejected = false
try {
  await call('agent_teams_claim_task', { task_id: 't1' })
} catch (error) {
  stagedClaimRejected = /staged|approval|running/i.test(String(error?.message ?? error))
}
let stagedReassignRejected = false
try {
  await call('agent_teams_reassign_task', {
    task_id: 't2', assignee: 'captain', reason: 'must not bypass staged approval',
  })
} catch (error) {
  stagedReassignRejected = /staged|approval|running/i.test(String(error?.message ?? error))
}
const stagedExecutionAfter = JSON.stringify(await readTeam(stateRoot, stagedExecutionGuard.team_id))
check('staged execution tools fail closed without task, spawn, or delivery side effects',
  stagedExecutionPlan.review_state === 'ready_for_review'
    && stagedClaimRejected
    && stagedReassignRejected
    && stagedExecutionAfter === stagedExecutionBefore
    && childSeq === stagedExecutionChildrenBefore
    && deliveries.length === stagedExecutionDeliveriesBefore)
await call('agent_teams_delete', {})

const stagedRosterGuard = await call('agent_teams_create', {
  name: 'Staged Roster Revision Guard',
  description: 'Prove staged member removal invalidates prepared approval',
  profile: 'dynamic-delivery',
  approval: 'required',
})
const stagedRosterPlan = await call('agent_teams_edit_plan', {
  operations: [
    { action: 'add_task', subject: 'Keep implementer task', dependencies: [], assignee: 'implementer' },
  ],
  submit_for_review: true,
})
const staleRosterCredential = await agentTeamsRuntime.prepareWebApproval(
  captain,
  stagedRosterGuard.team_id,
  stagedRosterPlan.plan_revision,
)
const stagedRosterChildrenBefore = childSeq
await call('agent_teams_remove_member', { name: 'reviewer' })
const stagedRosterAfterRemoval = await readTeam(stateRoot, stagedRosterGuard.team_id)
const resubmittedRosterPlan = await call('agent_teams_edit_plan', {
  operations: [],
  submit_for_review: true,
})
let staleRosterApprovalRejected = false
try {
  await agentTeamsRuntime.approveStagedTeam(captain, stagedRosterGuard.team_id, {
    source: 'web',
    token: staleRosterCredential.token,
    expectedPlanRevision: staleRosterCredential.planRevision,
  })
} catch (error) {
  staleRosterApprovalRejected = /stale plan revision|credential invalid/i.test(String(error?.message ?? error))
}
const stagedRosterAfterRejectedApproval = await readTeam(stateRoot, stagedRosterGuard.team_id)
check('staged member removal changes the roster revision and invalidates old approval',
  stagedRosterAfterRemoval?.phase === 'staged'
    && stagedRosterAfterRemoval.planReviewState === 'building'
    && stagedRosterAfterRemoval.planRevision === stagedRosterPlan.plan_revision + 1
    && !stagedRosterAfterRemoval.members.some(member => member.name === 'reviewer')
    && stagedRosterAfterRemoval.tasks[0]?.assignee === 'implementer'
    && resubmittedRosterPlan.review_state === 'ready_for_review'
    && resubmittedRosterPlan.plan_revision === stagedRosterAfterRemoval.planRevision
    && staleRosterApprovalRejected
    && stagedRosterAfterRejectedApproval?.phase === 'staged'
    && childSeq === stagedRosterChildrenBefore)
await call('agent_teams_delete', {})

const createdStaged = await call('agent_teams_create', {
  description: 'Implement trusted staged approval',
  profile: 'software-delivery',
  approval: 'required',
})
let stagedApprovalTeam = await readTeam(stateRoot, createdStaged.team_id)
check('omitted Team name is generated', createdStaged.team_name.length > 8)
check('required approval begins building', stagedApprovalTeam?.phase === 'staged' && stagedApprovalTeam.planReviewState === 'building')

const submittedStaged = await call('agent_teams_edit_plan', {
  operations: [{ action: 'add_task', subject: 'Implement approval', dependencies: [], assignee: 'implementer' }],
  submit_for_review: true,
})
check('atomic submission becomes ready', submittedStaged.review_state === 'ready_for_review')

const genericApproval = await call('agent_teams_approve', {
  confirmation: '继续',
  expected_plan_revision: submittedStaged.plan_revision,
}, captain, { rootCallId: 'generic-approval-without-user-evidence' })
stagedApprovalTeam = await readTeam(stateRoot, createdStaged.team_id)
check('generic approval is rejected without writes, spawns, or deliveries',
  genericApproval.status === 'approval_required'
    && stagedApprovalTeam?.phase === 'staged'
    && childSeq === stagedRosterChildrenBefore
    && deliveries.length === stagedExecutionDeliveriesBefore)
let staleWebPrepareRejected = false
try {
  await agentTeamsRuntime.prepareWebApproval(captain, createdStaged.team_id, submittedStaged.plan_revision - 1)
} catch (error) {
  staleWebPrepareRejected = /stale plan revision/i.test(String(error?.message ?? error))
}
check('Web approval preparation rejects a stale plan revision without writes',
  staleWebPrepareRejected && (await readTeam(stateRoot, createdStaged.team_id))?.phase === 'staged')
const preparedWebApproval = await agentTeamsRuntime.prepareWebApproval(
  captain,
  createdStaged.team_id,
  submittedStaged.plan_revision,
)
const approvedWebTeam = await agentTeamsRuntime.approveStagedTeam(captain, createdStaged.team_id, {
  source: 'web',
  token: preparedWebApproval.token,
  expectedPlanRevision: preparedWebApproval.planRevision,
})
const persistedWebTeam = await readTeam(stateRoot, createdStaged.team_id)
check('prepared Web approval commits receipt provenance through the unified barrier',
  approvedWebTeam.approvalSource === 'web'
    && persistedWebTeam?.phase === 'running'
    && persistedWebTeam.approvalSource === 'web'
    && persistedWebTeam.approvedPlanRevision === submittedStaged.plan_revision
    && persistedWebTeam.planRevision === submittedStaged.plan_revision
    && /^web:receipt:/.test(persistedWebTeam.approvalEvidenceId))
await call('agent_teams_delete', {})

const createProfileDescription = definitions.get('agent_teams_create')
  ?.parameters?.properties?.profile?.description ?? ''
check('create schema lists configured Profiles and says to omit an unspecified Profile',
  /demo-delivery/.test(createProfileDescription)
    && /dynamic-delivery/.test(createProfileDescription)
    && /omit/i.test(createProfileDescription))

const omittedProfileCreation = await call('agent_teams_create', {
  name: 'Ad Hoc Omitted Profile',
  description: 'missing optional profile stays ad hoc',
})
const omittedProfileTeam = await readTeam(stateRoot, 'ad-hoc-omitted-profile')
check('create without Profile produces an ad-hoc Team',
  omittedProfileCreation.profile === undefined
    && omittedProfileTeam?.profile === undefined
    && omittedProfileTeam?.members.length === 0
    && omittedProfileTeam?.tasks.length === 0)
await call('agent_teams_delete', {})

let blankProfileCreation
let blankProfileError
try {
  blankProfileCreation = await call('agent_teams_create', {
    name: 'Ad Hoc Blank Profile',
    description: 'blank optional profile stays ad hoc',
    profile: '   ',
  })
} catch (error) {
  blankProfileError = error
}
const blankProfileTeam = await readTeam(stateRoot, 'ad-hoc-blank-profile')
check('blank Profile normalizes to the same ad-hoc Team shape',
  blankProfileError === undefined
    && blankProfileCreation?.profile === undefined
    && blankProfileTeam?.profile === undefined
    && blankProfileTeam?.members.length === omittedProfileTeam?.members.length
    && blankProfileTeam?.tasks.length === omittedProfileTeam?.tasks.length)
if (blankProfileTeam !== undefined) await call('agent_teams_delete', {})

const entriesBeforeUnknownProfile = (await readdir(stateRoot)).sort()
const childrenBeforeUnknownProfile = children.length
const persistenceBeforeUnknownProfile = { ...profilePersistenceCalls }
let unknownProfileError
try {
  await call('agent_teams_create', {
    name: 'Unknown Profile',
    description: 'strict unknown Profile check',
    profile: 'not-configured',
  })
} catch (error) {
  unknownProfileError = error
}
check('unknown non-empty Profile rejects before state write or member spawn',
  /unknown AgentTeams profile "not-configured".*demo-delivery.*dynamic-delivery/i
    .test(String(unknownProfileError?.message ?? unknownProfileError))
    && JSON.stringify((await readdir(stateRoot)).sort()) === JSON.stringify(entriesBeforeUnknownProfile)
    && children.length === childrenBeforeUnknownProfile
    && profilePersistenceCalls.createTeamDir === persistenceBeforeUnknownProfile.createTeamDir
    && profilePersistenceCalls.writeTeam === persistenceBeforeUnknownProfile.writeTeam)

const modelResolutionCallsBeforeRolePolicy = modelResolutionCalls.length
const persistenceBeforeRolePolicy = { ...profilePersistenceCalls }
const rolePolicyCreation = await call('agent_teams_create', {
  name: 'Role Policy',
  description: 'role policy preflight',
  profile: 'role-policy',
})
const rolePolicyTeam = await readTeam(stateRoot, 'role-policy')
const rolePolicyCalls = modelResolutionCalls.slice(modelResolutionCallsBeforeRolePolicy)
check('profile members resolve from their own role policies',
  rolePolicyCreation.profile === 'role-policy'
    && rolePolicyCalls.length === 2
    && rolePolicyCalls[0]?.provider === 'fake'
    && rolePolicyCalls[0]?.model === 'fake-model'
    && rolePolicyCalls[0]?.reasoningEffort === undefined
    && rolePolicyCalls[1]?.provider === 'opencode-go'
    && rolePolicyCalls[1]?.model === 'review-model'
    && rolePolicyCalls[1]?.reasoningEffort === 'max'
    && rolePolicyTeam?.members.find(member => member.name === 'reviewer')?.provider === 'opencode-go'
    && profilePersistenceCalls.createTeamDir === persistenceBeforeRolePolicy.createTeamDir + 1
    && profilePersistenceCalls.writeTeam === persistenceBeforeRolePolicy.writeTeam + 1)
await call('agent_teams_delete', {})

const inheritedRoleTeamCreation = await call('agent_teams_create', {
  name: 'Rule Role Inheritance',
  description: 'numbered members inherit their unnumbered role model policy',
  profile: 'rule-role-inheritance',
})
const inheritedRoleNames = roleInheritanceMemberNames.filter(name => (
  name !== 'analyst'
    && name !== 'implementer'
    && name !== 'tester'
    && name !== 'reviewer'
    && name !== 'reviewer4'
    && name !== 'custom-role2'
))
const addMemberReasoningModeDefault = definitions.get('agent_teams_add_member')
  ?.parameters?.properties?.reasoning_mode?.default
const inheritedRoleAdditions = []
for (const name of inheritedRoleNames) {
  // Models may still echo the optional target-default mode even when no
  // provider/model/effort was requested. That payload must remain eligible
  // for numbered-role inheritance rather than disabling the frozen base role.
  inheritedRoleAdditions.push(await call('agent_teams_add_member', {
    name,
    reasoning_mode: 'target-default',
  }))
}
const explicitRoleOverride = await call('agent_teams_add_member', {
  name: 'reviewer4',
  provider: 'fake',
  model: 'custom-review-model',
  reasoning_mode: 'explicit',
  reasoning_effort: 'low',
})
const customNumberedRole = await call('agent_teams_add_member', { name: 'custom-role2', role: 'unmatched custom role' })
const inheritedRoleTeam = await readTeam(stateRoot, 'rule-role-inheritance')
const inheritedRoleByName = new Map(inheritedRoleTeam?.members.map(member => [member.name, member]) ?? [])
const inheritedRoutes = new Map(inheritedRoleAdditions.map(member => [member.member_name, member]))
check('numbered rule roles inherit the matching base role through the real add-member tool',
  addMemberReasoningModeDefault === undefined
    && inheritedRoleTeamCreation.profile === 'rule-role-inheritance'
    && inheritedRoutes.get('reviewer2')?.provider === 'fake'
    && inheritedRoutes.get('reviewer2')?.model === 'fake-reviewer'
    && inheritedRoutes.get('reviewer2')?.reasoning_effort === 'xhigh'
    && inheritedRoutes.get('reviewer3')?.model === 'fake-reviewer'
    && inheritedRoutes.get('analyst2')?.model === 'fake-analyst'
    && inheritedRoutes.get('analyst2')?.reasoning_effort === 'low'
    && inheritedRoutes.get('implementer2')?.model === 'fake-implementer'
    && inheritedRoutes.get('implementer2')?.reasoning_effort === 'high'
    && inheritedRoutes.get('tester2')?.model === 'fake-tester'
    && inheritedRoutes.get('tester2')?.reasoning_effort === 'max'
    && inheritedRoutes.get('reviewer5')?.model === 'fake-reviewer'
    && inheritedRoutes.get('reviewer6')?.model === 'fake-reviewer'
    && inheritedRoleByName.get('reviewer3')?.model === 'fake-reviewer'
    && inheritedRoleByName.get('reviewer6')?.reasoningMode === 'explicit')
check('explicit numbered-role routing still wins over the base role template',
  explicitRoleOverride.model === 'custom-review-model'
    && explicitRoleOverride.reasoning_effort === 'low'
    && inheritedRoleByName.get('reviewer4')?.model === 'custom-review-model')
check('unmatched numbered custom roles retain the captain route',
  customNumberedRole.provider === 'fake'
    && customNumberedRole.model === 'fake-model'
    && customNumberedRole.reasoning_effort === undefined)
await call('agent_teams_delete', {})
const stateEntriesBeforeInvalidProfile = (await readdir(stateRoot)).sort()
const childrenBeforeInvalidProfile = children.length
const profilePersistenceBeforeInvalid = { ...profilePersistenceCalls }
advertisedModels = ['fake-model']
let invalidProfileRejected = false
try {
  await call('agent_teams_create', {
    name: 'Role Policy Invalid',
    description: 'unavailable reviewer must not create durable state',
    profile: 'role-policy-invalid',
  })
} catch (error) {
  invalidProfileRejected = /unknown member model.*unavailable-review-model/i.test(String(error?.message ?? error))
}
const stateWrites = (await readdir(stateRoot)).filter((entry) => entry === 'role-policy-invalid').length
const spawnCalls = children.length - childrenBeforeInvalidProfile
check('unavailable profile reviewer rejects before directory write or spawn',
  invalidProfileRejected
    && stateWrites === 0
    && spawnCalls === 0
    && JSON.stringify((await readdir(stateRoot)).sort()) === JSON.stringify(stateEntriesBeforeInvalidProfile)
    && profilePersistenceCalls.createTeamDir === profilePersistenceBeforeInvalid.createTeamDir
    && profilePersistenceCalls.writeTeam === profilePersistenceBeforeInvalid.writeTeam)
advertisedModels = []

// ── /agent-teams slash command and gesture boundary ───────────────────
const commandDefinitions = new Map()
ctx.commands = {
  register(definition) {
    commandDefinitions.set(definition.name, definition)
  },
}
const liveProfiles = {
  'demo-delivery': {
    description: 'tiny delivery team',
    protocol: 'Discuss, then implement. Do not invent unanswered questions.',
    members: [
      { name: 'analyst', role: 'requirements', provider: 'fake', model: 'fake-analyst', reasoning_mode: 'target-default' },
      { name: 'implementer', role: 'builder', provider: 'fake', model: 'fake-implementer', reasoning_mode: 'target-default' },
    ],
    tasks: [
      { id: 'requirements', subject: 'Requirements', assignee: 'analyst' },
      { id: 'implement', subject: 'Implement', assignee: 'implementer', dependencies: ['requirements'] },
    ],
  },
}
registerAgentTeamsCommand(ctx, () => liveProfiles)
installAgentTeamsGestureBoundary(ctx, () => liveProfiles)

const command = commandDefinitions.get('agent-teams')
const profileCommand = commandDefinitions.get('agent-teams-demo-delivery')
check('slash command registers as /agent-teams',
  command !== undefined && typeof command.description === 'string' && command.description.length > 0)
check('slash command advertises an input hint for the menu placeholder',
  typeof command?.input?.hint === 'string' && command.input.hint.length > 0)
check('configured profile registers a concise dedicated slash command',
  profileCommand !== undefined && profileCommandName('demo-delivery') === 'agent-teams-demo-delivery'
    && typeof profileCommand.description === 'string' && profileCommand.description.includes('demo-delivery'))
check('unsafe profile names do not generate ambiguous commands',
  profileCommandName('delivery team') === undefined && profileCommandName('delivery_team') === undefined)

const bare = command.handler({
  agent: captain, rawInput: '   ', signal: new AbortController().signal, commandId: 'cmd-bare',
})
check('bare /agent-teams reports usage instead of activating',
  bare.kind === 'error' && bare.text.includes('Usage: /agent-teams')
    && captain.followups.length === 0)

const goal = 'ship a tiny CLI'
const activated = command.handler({
  agent: captain, rawInput: `  ${goal}  `, signal: new AbortController().signal, commandId: 'cmd-goal',
})
check('argued /agent-teams queues one visible user turn',
  activated.kind === 'success' && captain.followups.length === 1)
const submittedCommand = captain.followups[0]
check('slash command preserves the exact submitted line as user-authored chat',
  submittedCommand?.source?.kind === 'user'
    && submittedCommand.content.some(block => block.type === 'text'
      && block.text === `/agent-teams  ${goal}  `))
check('preserved slash command still activates through the gesture boundary',
  invokedAgentTeamsGoal([submittedCommand]) === goal)
check('activation directive names the protocol', buildActivationDirective(goal).includes('AgentTeams protocol'))
const profileGoal = 'ship the prepared release'
const profileActivated = profileCommand.handler({
  agent: captain, rawInput: ` ${profileGoal}`, signal: new AbortController().signal, commandId: 'cmd-profile-alias',
})
check('profile command queues a visible profile-specific user turn',
  profileActivated.kind === 'success' && captain.followups.length === 2
    && captain.followups[1]?.content.some(block => block.type === 'text' && block.text === `/agent-teams-demo-delivery ${profileGoal}`))

const userMessage = text => ({ id: 'm', role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } })
check('gesture recognizes a leading /agent-teams token',
  invokedAgentTeamsGoal([userMessage('/agent-teams ship a CLI')]) === 'ship a CLI')
check('profile command gesture selects its configured profile and goal',
  invokedAgentTeamsInvocation([userMessage('/agent-teams-demo-delivery ship a CLI')], () => liveProfiles)?.profile === 'demo-delivery'
    && invokedAgentTeamsInvocation([userMessage('/agent-teams-demo-delivery ship a CLI')], () => liveProfiles)?.goal === 'ship a CLI')
check('bare profile command gesture asks for the goal',
  invokedAgentTeamsInvocation([userMessage('/agent-teams-demo-delivery')], () => liveProfiles)?.profile === 'demo-delivery'
    && invokedAgentTeamsInvocation([userMessage('/agent-teams-demo-delivery')], () => liveProfiles)?.goal === '')
check('unknown profile command stays ordinary prose',
  invokedAgentTeamsInvocation([userMessage('/agent-teams-missing ship a CLI')], () => liveProfiles) === undefined)
check('bare gesture yields an empty goal', invokedAgentTeamsGoal([userMessage('  /agent-teams')]) === '')
check('mid-sentence mention stays ordinary prose',
  invokedAgentTeamsGoal([userMessage('how do I use /agent-teams here?')]) === undefined)
check('non-user sources cannot forge the gesture',
  invokedAgentTeamsGoal([{ ...userMessage('/agent-teams x'), source: { kind: 'plugin', plugin: 'fake' } }]) === undefined)
check('latest user gesture wins in a batch',
  invokedAgentTeamsGoal([userMessage('/agent-teams first'), userMessage('/agent-teams second')]) === 'second')
const profileOnly = command.handler({
  agent: captain, rawInput: '--profile demo-delivery', signal: new AbortController().signal, commandId: 'cmd-profile-only',
})
check('slash --profile without a goal still activates',
  profileOnly.kind === 'success' && captain.followups.length === 3)
check('profile-only activation asks for the goal',
  buildActivationDirective('', 'demo-delivery').includes('The goal was not given')
    && buildActivationDirective('', 'demo-delivery').includes('Use configured AgentTeams profile "demo-delivery"'))
check('captain-planning activation starts automatically with model-owned task planning',
  buildActivationDirective('ship it', 'dynamic-delivery', 'captain').includes('approval="automatic"')
    && buildActivationDirective('ship it', 'dynamic-delivery', 'captain').includes('Omit name so the plugin generates it')
    && buildActivationDirective('ship it', 'dynamic-delivery', 'captain').includes('captain-owned AgentTeams task tools')
    && buildActivationDirective('ship it', 'dynamic-delivery', 'captain').includes('Do not ask the user to name')
    && !buildActivationDirective('ship it', 'dynamic-delivery', 'captain').includes('Call agent_teams_create with approval="required"')
    && !buildActivationDirective('ship it', 'dynamic-delivery', 'captain').includes('review the Web plan'))
const unknownProfile = command.handler({
  agent: captain, rawInput: '--profile missing 做X', signal: new AbortController().signal, commandId: 'cmd-unknown',
})
check('unknown slash profile reports error and does not followup',
  unknownProfile.kind === 'error' && captain.followups.length === 3)
check('leading ordinary token is never treated as a profile',
  invokedAgentTeamsInvocation([userMessage('/agent-teams research this bug')])?.goal === 'research this bug'
    && invokedAgentTeamsInvocation([userMessage('/agent-teams research this bug')])?.profile === undefined)
liveProfiles['hot-reload'] = { members: [{ name: 'solo', provider: 'fake', model: 'fake', reasoning_mode: 'target-default' }] }
check('command getter sees HMR profile names',
  command.handler({
    agent: captain, rawInput: '--profile hot-reload', signal: new AbortController().signal, commandId: 'cmd-hmr',
  }).kind === 'success')
delete liveProfiles['hot-reload']

try {
  const createdProfile = await call('agent_teams_create', {
    name: 'Profile Demo',
    description: 'ship a tiny demo',
    profile: 'demo-delivery',
  })
  const profileTeam = await readTeam(stateRoot, 'profile-demo')
  check('create(profile) returns profile members tasks and seed ids',
    createdProfile.profile === 'demo-delivery'
      && createdProfile.members?.length === 2
      && createdProfile.tasks?.length === 2
      && createdProfile.tasks?.[0]?.seed_id === 'requirements'
      && createdProfile.tasks?.[1]?.seed_id === 'implement')
  check('create(profile) persists snapshot members and mapped dependencies',
    profileTeam?.profile?.name === 'demo-delivery'
      && profileTeam.members.map(member => member.name).join(',') === 'analyst,implementer'
      && profileTeam.tasks[1]?.dependencies.join(',') === 't1'
      && profileTeam.tasks[1]?.assignee === 'implementer')
  const analyst = liveAgents.get(createdProfile.members[0].member_id)
  const implementer = liveAgents.get(createdProfile.members[1].member_id)
  analyst.status = 'idle'
  implementer.status = 'idle'
  const readOnlyDeliveries = deliveries.length
  await call('agent_teams_status', {})
  check('default status is read-only and does not wake members', deliveries.length === readOnlyDeliveries)
  await call('agent_teams_status', { wake: 'recover' })
  const afterKick = await readTeam(stateRoot, 'profile-demo')
  const firstSeed = afterKick?.tasks[0]
  check('first-stage seed is assigned only to the configured member',
    firstSeed?.status === 'claimed' && firstSeed.assignee === 'analyst'
      && deliveries.some(delivery => delivery.childId === analyst.id)
      && !deliveries.some(delivery => delivery.childId === implementer.id && String(delivery.content?.[0]?.text ?? '').includes('Implement')))
  const firstAssignment = deliveries.find(delivery => delivery.childId === analyst.id)
  const assignmentText = Array.isArray(firstAssignment?.content)
    ? firstAssignment.content.map(block => block.text ?? '').join('\n')
    : String(firstAssignment?.content ?? '')
  check('first assignment includes team goal and protocol',
    assignmentText.includes('ship a tiny demo')
      && assignmentText.includes('Discuss, then implement'))
  const analystClaim = await call('agent_teams_claim_task', { task_id: firstSeed.id }, analyst)
  await call('agent_teams_update_task', { task_id: firstSeed.id, status: 'in_progress', attempt_id: analystClaim.attempt_id }, analyst)
  await call('agent_teams_update_task', {
    task_id: firstSeed.id,
    status: 'failed',
    attempt_id: analystClaim.attempt_id,
    output: 'Need a user decision before design.',
  }, analyst)
  publishStatus(analyst, 'idle')
  publishStatus(implementer, 'idle')
  check('failed upstream does not unlock the next configured stage',
    (await readTeam(stateRoot, 'profile-demo'))?.tasks[1]?.status === 'pending'
      && !deliveries.some(delivery => delivery.childId === implementer.id && String(delivery.content?.[0]?.text ?? '').includes('Implement')))
  await call('agent_teams_reassign_task', { task_id: firstSeed.id, assignee: 'analyst', reason: 'retry after user answer' })
  const retryClaim = await call('agent_teams_claim_task', { task_id: firstSeed.id }, analyst)
  await call('agent_teams_update_task', { task_id: firstSeed.id, status: 'in_progress', attempt_id: retryClaim.attempt_id }, analyst)
  await call('agent_teams_update_task', {
    task_id: firstSeed.id,
    status: 'completed',
    attempt_id: retryClaim.attempt_id,
    output: 'Scope confirmed: ship the tiny demo.',
  }, analyst)
  publishStatus(analyst, 'idle')
  publishStatus(implementer, 'idle')
  const secondSeed = (await readTeam(stateRoot, 'profile-demo'))?.tasks[1]
  check('completed upstream dispatches the configured downstream assignee',
    secondSeed?.status === 'claimed' && secondSeed.assignee === 'implementer')
  const secondAssignment = [...deliveries].reverse().find(delivery => delivery.childId === implementer.id)
  const secondText = Array.isArray(secondAssignment?.content)
    ? secondAssignment.content.map(block => block.text ?? '').join('\n')
    : String(secondAssignment?.content ?? '')
  check('downstream assignment includes dependency output and seed id',
    secondText.includes('Scope confirmed')
      && secondText.includes('[requirements]'))
  await call('agent_teams_send_message', { to: 'implementer', content: 'stop and wait for a user answer' })
  const deliveriesAfterMail = deliveries.length
  await call('agent_teams_status', { wake: 'recover' })
  check('unread mailbox prevents a same-kick new assignment',
    deliveries.length >= deliveriesAfterMail
      && (await readTeam(stateRoot, 'profile-demo'))?.tasks[1]?.assignee === 'implementer')
  const profileStatus = await call('agent_teams_status', {})
  check('status exposes profile snapshot and task seed ids',
    profileStatus.profile?.name === 'demo-delivery'
      && profileStatus.tasks.some(item => item.seed_id === 'requirements')
      && profileStatus.tasks.some(item => item.seed_id === 'implement'))
  await call('agent_teams_delete', {})

  const deliveriesBeforeDiscard = deliveries.length
  const captainCancelsBeforeDiscard = captain.cancelCount ?? 0
  const captainInjectionsBeforeDiscard = captain.injections.length
  await call('agent_teams_create', {
    name: 'Rejected Demo',
    description: 'plan the user will reject',
    profile: 'dynamic-delivery',
    approval: 'required',
  })
  await call('agent_teams_create_task', { subject: 'should never run', assignee: 'analyst' })
  const discardedPlan = await agentTeamsRuntime.discardStagedTeam(captain, 'rejected-demo')
  const discardedArchive = await readArchivedTeam(stateRoot, 'rejected-demo')
  check('discarding a staged plan archives it without spawning or dispatching',
    discardedPlan.teamId === 'rejected-demo'
      && await readTeam(stateRoot, 'rejected-demo') === undefined
      && discardedArchive?.phase === 'staged'
      && discardedArchive.members.every(member => member.id === '')
      && discardedArchive.tasks.every(task => task.status === 'pending')
      && deliveries.length === deliveriesBeforeDiscard)
  const discardControlText = captain.injections.at(-1)?.content?.map(block => block.text ?? '').join('\n') ?? ''
  check('discard aborts the active Captain turn and parks an authoritative no-recreate context',
    (captain.cancelCount ?? 0) === captainCancelsBeforeDiscard + 1
      && captain.injections.length === captainInjectionsBeforeDiscard + 1
      && /Do not call agent_teams_create/.test(discardControlText)
      && /Wait for a later explicit user request/.test(discardControlText)
      && captain.lastCancel?.options?.keepInbox === true)

  // Exercise the staged-plan editing contract with role-local policies.
  const createdDynamic = await call('agent_teams_create', {
    name: 'Dynamic Demo',
    description: 'goal only',
    profile: 'dynamic-delivery',
    approval: 'required',
  })
  const stagedDynamic = await readTeam(stateRoot, 'dynamic-demo')
  check('captain-planning create stages only the configured roster',
    createdDynamic.profile === 'dynamic-delivery'
      && createdDynamic.task_planning === 'captain'
      && createdDynamic.phase === 'staged'
      && createdDynamic.members?.length === 5
      && createdDynamic.members.every(member => member.member_id === '')
      && createdDynamic.tasks?.length === 0
      && stagedDynamic?.profile?.taskPlanning === 'captain'
      && stagedDynamic.phase === 'staged'
      && stagedDynamic.members.every(member => member.id === '')
      && stagedDynamic.tasks.length === 0)
  const deliveriesBeforePlan = deliveries.length
  const dynamicFirst = await call('agent_teams_create_task', { subject: 'analyze goal', assignee: 'analyst' })
  const dynamicSecond = await call('agent_teams_create_task', {
    subject: 'implement result',
    assignee: 'implementer',
    dependencies: [dynamicFirst.task_id],
  })
  const roundTripSource = await readTeam(stateRoot, 'dynamic-demo')
  const roundTripSnapshot = roundTripSource === undefined
    ? undefined
    : await assembleTeamSnapshot(ctx, stateRoot, 'lifecycle', roundTripSource)
  const roundTripTask = roundTripSnapshot?.tasks.find(item => item.id === dynamicSecond.task_id)
  if (roundTripTask !== undefined) {
    await agentTeamsRuntime.updateStagedPlan(captain, 'dynamic-demo', stagedPlanMutationFromPayload(buildStagedTaskMutationPayload({
      sessionId: captain.id,
      teamId: 'dynamic-demo',
      expectedPlanRevision: roundTripSource?.planRevision ?? 1,
      taskId: roundTripTask.id,
      subject: 'browser quality contract',
      description: 'Persist every browser-editable task field.',
      assignee: roundTripTask.assignee,
      dependencies: roundTripTask.dependencies.join(', '),
      kind: 'work',
      round: '3',
      objective: 'Prove the complete staged contract survives the Host boundary.',
      inScope: 'src/\ntests/',
      outOfScope: 'dist/',
      acceptance: 'every field persists',
      verify: 'pnpm test',
      deliverables: 'src/index.ts',
      nonGoals: 'do not publish',
      reviewedTaskId: dynamicFirst.task_id,
      sourceTaskId: dynamicFirst.task_id,
      sourceFindingIds: 'finding-1',
      coverageOf: 'goal-1',
    })), { origin: 'captain', submitForReview: false })
  }
  const roundTrippedTask = (await readTeam(stateRoot, 'dynamic-demo'))?.tasks.find(item => item.id === dynamicSecond.task_id)
  check('snapshot and browser-shaped Host payload persist the complete staged task contract',
    roundTripTask !== undefined
      && roundTripSnapshot?.planRevision === roundTripSource?.planRevision
      && roundTrippedTask?.subject === 'browser quality contract'
      && roundTrippedTask.description === 'Persist every browser-editable task field.'
      && roundTrippedTask.assignee === roundTripTask.assignee
      && roundTrippedTask.dependencies.join(',') === roundTripTask.dependencies.join(',')
      && roundTrippedTask.kind === 'work'
      && roundTrippedTask.round === 3
      && roundTrippedTask.objective === 'Prove the complete staged contract survives the Host boundary.'
      && roundTrippedTask.inScope?.join(',') === 'src/,tests/'
      && roundTrippedTask.outOfScope?.join(',') === 'dist/'
      && roundTrippedTask.acceptance?.join(',') === 'every field persists'
      && roundTrippedTask.verify?.join(',') === 'pnpm test'
      && roundTrippedTask.deliverables?.join(',') === 'src/index.ts'
      && roundTrippedTask.nonGoals?.join(',') === 'do not publish'
      && roundTrippedTask.reviewedTaskId === dynamicFirst.task_id
      && roundTrippedTask.sourceTaskId === dynamicFirst.task_id
      && roundTrippedTask.sourceFindingIds?.join(',') === 'finding-1'
      && roundTrippedTask.coverageOf?.join(',') === 'goal-1')
  const clearSource = await readTeam(stateRoot, 'dynamic-demo')
  const clearSnapshot = clearSource === undefined
    ? undefined
    : await assembleTeamSnapshot(ctx, stateRoot, 'lifecycle', clearSource)
  const clearTask = clearSnapshot?.tasks.find(item => item.id === dynamicSecond.task_id)
  if (clearTask !== undefined) {
    await agentTeamsRuntime.updateStagedPlan(captain, 'dynamic-demo', stagedPlanMutationFromPayload(buildStagedTaskMutationPayload({
      sessionId: captain.id,
      teamId: 'dynamic-demo',
      expectedPlanRevision: clearSource?.planRevision ?? 1,
      taskId: clearTask.id,
      subject: clearTask.subject,
      description: '',
      assignee: clearTask.assignee,
      dependencies: '',
      kind: 'work',
      round: '',
      objective: '',
      inScope: '',
      outOfScope: '',
      acceptance: '',
      verify: '',
      deliverables: '',
      nonGoals: '',
      reviewedTaskId: '',
      sourceTaskId: '',
      sourceFindingIds: '',
      coverageOf: '',
    })), { origin: 'captain', submitForReview: false })
  }
  const clearedTask = (await readTeam(stateRoot, 'dynamic-demo'))?.tasks.find(item => item.id === dynamicSecond.task_id)
  check('browser-shaped empty lists and strings clear every optional staged task field durably',
    clearTask !== undefined
      && clearedTask?.dependencies.length === 0
      && clearedTask.kind === 'work'
      && !Object.hasOwn(clearedTask, 'round')
      && !Object.hasOwn(clearedTask, 'description')
      && !Object.hasOwn(clearedTask, 'objective')
      && !Object.hasOwn(clearedTask, 'inScope')
      && !Object.hasOwn(clearedTask, 'outOfScope')
      && !Object.hasOwn(clearedTask, 'acceptance')
      && !Object.hasOwn(clearedTask, 'verify')
      && !Object.hasOwn(clearedTask, 'deliverables')
      && !Object.hasOwn(clearedTask, 'nonGoals')
      && !Object.hasOwn(clearedTask, 'reviewedTaskId')
      && !Object.hasOwn(clearedTask, 'sourceTaskId')
      && !Object.hasOwn(clearedTask, 'sourceFindingIds')
      && !Object.hasOwn(clearedTask, 'coverageOf'))
  await agentTeamsRuntime.updateStagedPlan(captain, 'dynamic-demo', {
    action: 'update_member',
    memberName: 'reviewer',
    role: 'security reviewer',
    provider: 'fake-provider',
    model: 'fake-reviewer-updated',
    reasoningMode: 'explicit',
    reasoningEffort: 'high',
    executionPrompt: 'Review security-sensitive changes only.',
  }, { origin: 'captain', submitForReview: false })
  await agentTeamsRuntime.updateStagedPlan(captain, 'dynamic-demo', {
    action: 'update_member',
    memberName: 'reviewer',
    role: 'security reviewer',
    provider: 'fake-provider',
    model: 'fake-reviewer-updated',
    reasoningMode: 'explicit',
    executionPrompt: 'Review security-sensitive changes only.',
  }, { origin: 'captain', submitForReview: false })
  const preservedExplicitStagedMember = (await readTeam(stateRoot, 'dynamic-demo'))?.members.find(member => member.name === 'reviewer')
  check('direct staged member edit may retain omitted explicit effort',
    preservedExplicitStagedMember?.reasoningMode === 'explicit'
      && preservedExplicitStagedMember.reasoningEffort === 'high')
  let browserTargetDefaultError
  try {
    await agentTeamsRuntime.updateStagedPlan(captain, 'dynamic-demo', stagedPlanMutationFromPayload({
      action: 'update_member',
      memberName: 'reviewer',
      role: 'security reviewer',
      provider: 'fake-provider',
      model: 'fake-reviewer-updated',
      reasoningMode: 'target-default',
      executionPrompt: 'Review security-sensitive changes only.',
    }), { origin: 'captain', submitForReview: false })
  } catch (error) {
    browserTargetDefaultError = error
  }
  const browserTargetDefaultMember = (await readTeam(stateRoot, 'dynamic-demo'))?.members.find(member => member.name === 'reviewer')
  check('browser staged member edit can switch explicit policy to target-default without retaining explicit effort',
    browserTargetDefaultError === undefined
      && browserTargetDefaultMember?.reasoningMode === 'target-default'
      && browserTargetDefaultMember.reasoningEffort === undefined)
  await agentTeamsRuntime.updateStagedPlan(captain, 'dynamic-demo', {
    action: 'update_member',
    memberName: 'reviewer',
    role: 'security reviewer',
    provider: 'fake-provider',
    model: 'fake-reviewer-updated',
    reasoningMode: 'explicit',
    reasoningEffort: 'high',
    executionPrompt: 'Review security-sensitive changes only.',
  }, { origin: 'captain', submitForReview: false })
  let modelRouteAwareEdit
  let modelRouteAwareError
  try {
    modelRouteAwareEdit = await call('agent_teams_edit_plan', {
      operations: [{
        action: 'update_member',
        member_name: 'reviewer',
        reasoning_mode: 'route-aware',
      }],
    })
  } catch (error) {
    modelRouteAwareError = error
  }
  const modelRouteAwareMember = (await readTeam(stateRoot, 'dynamic-demo'))?.members.find(member => member.name === 'reviewer')
  check('model-facing staged member edit can switch explicit policy to route-aware without retaining explicit effort',
    modelRouteAwareError === undefined
      && modelRouteAwareEdit?.status === 'staged'
      && modelRouteAwareMember?.reasoningMode === 'route-aware'
      && modelRouteAwareMember.reasoningEffort === undefined)
  await agentTeamsRuntime.updateStagedPlan(captain, 'dynamic-demo', {
    action: 'update_task',
    taskId: dynamicSecond.task_id,
    subject: 'implement approved result',
    description: 'Use the analyst output.',
    assignee: 'implementer',
    dependencies: [dynamicFirst.task_id],
  }, { origin: 'captain', submitForReview: false })
  const editedDynamic = await readTeam(stateRoot, 'dynamic-demo')
  check('staged roster and DAG are editable without spawning or dispatching',
    editedDynamic?.members.find(member => member.name === 'reviewer')?.model === 'fake-reviewer-updated'
      && editedDynamic.members.find(member => member.name === 'reviewer')?.executionPrompt === 'Review security-sensitive changes only.'
      && editedDynamic.tasks[1]?.subject === 'implement approved result'
      && editedDynamic.tasks[1]?.dependencies.join(',') === dynamicFirst.task_id
      && editedDynamic.tasks.every(item => item.status === 'pending')
      && deliveries.length === deliveriesBeforePlan)

  const preservedPolicyBeforeEdit = editedDynamic?.members.find(member => member.name === 'implementer')
  if (preservedPolicyBeforeEdit !== undefined) {
    preservedPolicyBeforeEdit.provider = 'fake-materialized'
    preservedPolicyBeforeEdit.model = 'fake-materialized-model'
    preservedPolicyBeforeEdit.reasoningEffort = 'materialized-default'
    await writeTeam(stateRoot, editedDynamic)
  }
  const preservedPolicyEdit = await call('agent_teams_edit_plan', {
    operations: [{ action: 'update_member', member_name: 'implementer', role: 'implementation engineer' }],
  })
  const preservedPolicyAfterEdit = (await readTeam(stateRoot, 'dynamic-demo'))?.members.find(member => member.name === 'implementer')
  const preservedPolicyResolution = modelResolutionCalls.at(-1)
  check('model-facing staged member edit omits materialized effort for non-explicit policy',
    preservedPolicyEdit.status === 'staged'
      && preservedPolicyBeforeEdit?.reasoningMode === 'target-default'
      && preservedPolicyBeforeEdit.reasoningEffort === 'materialized-default'
      && preservedPolicyAfterEdit?.reasoningMode === preservedPolicyBeforeEdit.reasoningMode
      && preservedPolicyAfterEdit?.reasoningEffort === 'materialized-default'
      && preservedPolicyResolution?.provider === 'fake-materialized'
      && preservedPolicyResolution?.model === 'fake-materialized-model'
      && preservedPolicyResolution?.reasoningEffort === undefined)

  const legacyStaged = await readTeam(stateRoot, 'dynamic-demo')
  const legacyMember = legacyStaged?.members.find(member => member.name === 'implementer')
  const legacyReasoningMode = legacyMember?.reasoningMode
  if (legacyStaged !== undefined && legacyMember !== undefined) {
    delete legacyMember.reasoningMode
    await writeTeam(stateRoot, legacyStaged)
  }
  let directLegacyPolicyRejected = false
  try {
    await agentTeamsRuntime.updateStagedPlan(captain, 'dynamic-demo', {
      action: 'update_member',
      memberName: 'implementer',
      role: 'implementation engineer',
      provider: legacyMember?.provider ?? '',
      model: legacyMember?.model ?? '',
    }, { origin: 'captain', submitForReview: false })
  } catch (error) {
    directLegacyPolicyRejected = /missing reasoningMode|AgentTeams V2 状态无效/i.test(String(error?.message ?? error))
  }
  check('strict V2 boundary rejects a staged member missing reasoningMode before direct mutation', directLegacyPolicyRejected)
  if (legacyStaged !== undefined && legacyMember !== undefined) {
    legacyMember.reasoningMode = legacyReasoningMode
    await writeTeam(stateRoot, legacyStaged)
  }
  if (legacyStaged !== undefined && legacyMember !== undefined) {
    delete legacyMember.reasoningMode
    await writeTeam(stateRoot, legacyStaged)
  }
  let modelLegacyPolicyRejected = false
  try {
    await call('agent_teams_edit_plan', {
      operations: [{ action: 'update_member', member_name: 'implementer', role: 'implementation engineer' }],
    })
  } catch (error) {
    modelLegacyPolicyRejected = /missing reasoningMode|AgentTeams V2 状态无效/i.test(String(error?.message ?? error))
  }
  check('strict V2 boundary rejects a staged member missing reasoningMode before model-facing mutation', modelLegacyPolicyRejected)
  if (legacyStaged !== undefined && legacyMember !== undefined) {
    legacyMember.reasoningMode = legacyReasoningMode
    await writeTeam(stateRoot, legacyStaged)
  }
  const obsoleteReview = await call('agent_teams_create_task', {
    subject: 'obsolete review',
    assignee: 'reviewer',
    dependencies: [dynamicFirst.task_id],
  })
  await agentTeamsRuntime.updateStagedPlan(captain, 'dynamic-demo', {
    action: 'update_task',
    taskId: dynamicSecond.task_id,
    subject: 'implement approved result',
    description: 'Use the analyst output.',
    assignee: 'implementer',
    dependencies: [obsoleteReview.task_id],
  }, { origin: 'captain', submitForReview: false })
  let rejectedAtomicEdit = false
  try {
    await call('agent_teams_edit_plan', {
      operations: [
        { action: 'remove_task', task_id: obsoleteReview.task_id },
        { action: 'update_task', task_id: dynamicSecond.task_id, dependencies: [dynamicFirst.task_id] },
        { action: 'remove_member', member_name: 'reviewer' },
      ],
    })
  } catch {
    rejectedAtomicEdit = true
  }
  const unchangedAfterRejectedEdit = await readTeam(stateRoot, 'dynamic-demo')
  check('invalid staged plan batches fail atomically without a partial write',
    rejectedAtomicEdit
      && unchangedAfterRejectedEdit?.tasks.some(item => item.id === obsoleteReview.task_id)
      && unchangedAfterRejectedEdit.tasks.find(item => item.id === dynamicSecond.task_id)?.dependencies.join(',') === obsoleteReview.task_id
      && unchangedAfterRejectedEdit.members.some(member => member.name === 'reviewer'))
  await call('agent_teams_edit_plan', { operations: [], submit_for_review: true })
  const captainCancelsBeforeContinue = captain.cancelCount ?? 0
  const captainFollowupsBeforeContinue = captain.followups.length
  const continuedPlan = await agentTeamsRuntime.continueStagedPlanning(captain, 'dynamic-demo')
  const waitingPlan = await readTeam(stateRoot, 'dynamic-demo')
  const feedbackControlText = captain.followups.at(-1)?.content?.map(block => block.text ?? '').join('\n') ?? ''
  check('return-to-chat cancels the planning turn and asks one question without recreating the team',
    continuedPlan.alreadyWaiting === false
      && waitingPlan?.planReviewState === 'awaiting_feedback'
      && (captain.cancelCount ?? 0) === captainCancelsBeforeContinue + 1
      && captain.followups.length === captainFollowupsBeforeContinue + 1
      && /Ask the user one concise, concrete question/.test(feedbackControlText)
      && /Do not create a replacement team/.test(feedbackControlText))
  const repeatedContinue = await agentTeamsRuntime.continueStagedPlanning(captain, 'dynamic-demo')
  check('return-to-chat is idempotent while feedback is already pending',
    repeatedContinue.alreadyWaiting === true
      && (captain.cancelCount ?? 0) === captainCancelsBeforeContinue + 1
      && captain.followups.length === captainFollowupsBeforeContinue + 1)
  const modelEditedPlan = await call('agent_teams_edit_plan', {
    operations: [
      {
        action: 'update_task',
        task_id: dynamicSecond.task_id,
        dependencies: [dynamicFirst.task_id],
        kind: 'implementation',
        objective: 'Implement the approved result',
        inScope: ['artifacts/'],
        acceptance: ['The implementation evidence is complete'],
        verify: ['verify-local-candidate.sh'],
        deliverables: ['artifacts/IMPLEMENTATION-EVIDENCE.md'],
        coverageOf: ['goal'],
      },
      { action: 'remove_task', task_id: obsoleteReview.task_id },
      { action: 'remove_member', member_name: 'reviewer' },
    ],
    submit_for_review: true,
  })
  const modelEditedDynamic = await readTeam(stateRoot, 'dynamic-demo')
  const editedImplementation = modelEditedDynamic?.tasks.find(item => item.id === dynamicSecond.task_id)
  check('captain can revise the staged DAG and roster through one model-facing atomic tool',
    modelEditedPlan.status === 'staged'
      && modelEditedPlan.tasks === 2
      && modelEditedPlan.members === 4
      && modelEditedDynamic?.tasks.every(item => item.id !== obsoleteReview.task_id)
      && modelEditedDynamic.tasks.find(item => item.id === dynamicSecond.task_id)?.dependencies.join(',') === dynamicFirst.task_id
      && editedImplementation?.kind === 'implementation'
      && editedImplementation.objective === 'Implement the approved result'
      && editedImplementation.inScope?.join(',') === 'artifacts/'
      && editedImplementation.deliverables?.join(',') === 'artifacts/IMPLEMENTATION-EVIDENCE.md'
      && modelEditedDynamic.members.every(member => member.name !== 'reviewer')
      && modelEditedDynamic.members.every(member => member.id === '')
      && modelEditedDynamic.tasks.every(item => item.status === 'pending')
      && modelEditedDynamic.planReviewState === 'ready_for_review'
      && deliveries.length === deliveriesBeforePlan)
  const approvalBase = Date.now()
  captain.session.events.push(
    { type: 'turn/start', seq: 7001, time: approvalBase, data: { turn: 701 } },
    { type: 'user/message', seq: 7002, time: approvalBase + 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'I approve the AgentTeams plan' }] } },
    { type: 'tool/call', seq: 7003, time: approvalBase + 2, data: { turn: 701, callId: 'dynamic-approval', name: 'agent_teams_approve', arguments: '{}' } },
  )
  const approvedDynamic = await call('agent_teams_approve', {
    confirmation: 'I approve the AgentTeams plan',
    expected_plan_revision: modelEditedDynamic.planRevision,
  }, captain, { rootCallId: 'dynamic-approval' })
  const dynamicTeam = await readTeam(stateRoot, 'dynamic-demo')
  const approvedDynamicRevision = dynamicTeam?.planRevision
  check('approval atomically spawns the final roster before dispatch',
    approvedDynamic.status === 'running'
      && dynamicTeam?.phase === 'running'
      && typeof dynamicTeam.approvedAt === 'number'
      && dynamicTeam.approvalSource === 'chat'
      && dynamicTeam.approvedPlanRevision === dynamicTeam.planRevision
      && dynamicTeam.approvalEvidenceId === 'chat:user-event:7002'
      && dynamicTeam.members.every(member => member.id !== '')
      && dynamicTeam.tasks[0]?.status === 'pending'
      && dynamicTeam.tasks[1]?.status === 'pending')
  const approvalInjectionText = captain.injections.at(-1)?.content?.map(block => block.text ?? '').join('\n') ?? ''
  check('chat approval injects only sanitized provenance context',
    approvalInjectionText.includes('dynamic-demo')
      && approvalInjectionText.includes('chat')
      && approvalInjectionText.includes(String(approvedDynamicRevision))
      && approvalInjectionText.includes('chat:user-event:7002')
      && !approvalInjectionText.includes('I approve the AgentTeams plan'))
  for (const member of dynamicTeam.members) publishStatus(liveAgents.get(member.id), 'idle')
  await new Promise(resolve => setTimeout(resolve, 20))
  await call('agent_teams_status', {})
  const dispatchedDynamic = await readTeam(stateRoot, 'dynamic-demo')
  check('approved plan revision remains unchanged after member spawn', dispatchedDynamic?.planRevision === approvedDynamicRevision)
  check('approved plan dispatches only after a spawned member becomes idle',
    dispatchedDynamic?.tasks[0]?.status === 'claimed'
      && dispatchedDynamic.tasks[1]?.status === 'pending')
  const dynamicAnalyst = liveAgents.get(dynamicTeam.members.find(member => member.name === 'analyst')?.id)
  const dynamicImplementer = liveAgents.get(dynamicTeam.members.find(member => member.name === 'implementer')?.id)
  const interruptedBeforeHalt = dynamicAnalyst.interruptCount ?? 0
  const captainCancelsBeforeHalt = captain.cancelCount ?? 0
  const halt = await haltTeamWork({
    ctx,
    stateRoot,
    teamId: 'dynamic-demo',
    captain,
    signal: new AbortController().signal,
  })
  const haltedTeam = await readTeam(stateRoot, 'dynamic-demo')
  check('captain halt cancels the approved graph and keeps the team',
    halt.alreadyHalted === false
      && halt.cancelledTasks === 2
      && haltedTeam?.halted === true
      && haltedTeam.tasks.every(item => item.status === 'cancelled'))
  check('team halt cancels the captain turn while preserving queued user input',
    captain.cancelCount === captainCancelsBeforeHalt + 2
      && captain.lastCancel?.cause?.kind === 'user'
      && captain.lastCancel?.options?.keepInbox === true)
  check('captain halt interrupts and drains graph members',
    (dynamicAnalyst.interruptCount ?? 0) > interruptedBeforeHalt
      && (dynamicImplementer.interruptCount ?? 0) > 0
      && (dynamicAnalyst.drainCount ?? 0) > 0
      && (dynamicImplementer.drainCount ?? 0) > 0
      && !liveAgents.has(dynamicAnalyst.id)
      && !liveAgents.has(dynamicImplementer.id))
  const deliveriesAfterHalt = deliveries.length
  await call('agent_teams_status', {})
  check('halted team does not redispatch cancelled graph',
    deliveries.length === deliveriesAfterHalt
      && (await readTeam(stateRoot, 'dynamic-demo'))?.tasks.every(item => item.status === 'cancelled'))
  let silentCreateUnhalted = false
  try {
    await call('agent_teams_create_task', { subject: 'must stay halted' })
    silentCreateUnhalted = (await readTeam(stateRoot, 'dynamic-demo'))?.halted !== true
  } catch {
    silentCreateUnhalted = (await readTeam(stateRoot, 'dynamic-demo'))?.halted !== true
  }
  check('halted create_task does not silently resume',
    silentCreateUnhalted === false && (await readTeam(stateRoot, 'dynamic-demo'))?.halted === true)
  const resume = await call('agent_teams_resume', { reason: 'continue after user answer' })
  check('explicit resume clears halt and keeps cancelled tasks cancelled',
    resume.status === 'resumed'
      && (await readTeam(stateRoot, 'dynamic-demo'))?.halted !== true
      && (await readTeam(stateRoot, 'dynamic-demo'))?.tasks.every(item => item.status === 'cancelled'))
  await call('agent_teams_delete', {})
  const haltedArchive = await readArchivedTeam(stateRoot, 'dynamic-demo')
  check('shutdown preserves cancelled task history in the archive',
    haltedArchive?.tasks.length === 2
      && haltedArchive.tasks.every(item => item.status === 'cancelled'))

  await call('agent_teams_create', { name: 'Assignee Boundary', description: 'captain and shared-pool task assignment' })
  let captainOwnedTask
  let captainOwnedTaskError
  try {
    captainOwnedTask = await call('agent_teams_create_task', {
      subject: 'captain-owned follow-up',
      assignee: 'captain',
    })
  } catch (error) {
    captainOwnedTaskError = error
  }
  let sharedPoolTask
  let sharedPoolTaskError
  try {
    sharedPoolTask = await call('agent_teams_create_task', {
      subject: 'shared-pool follow-up',
      assignee: '',
    })
  } catch (error) {
    sharedPoolTaskError = error
  }
  const assigneeBoundaryTeam = await readTeam(stateRoot, 'assignee-boundary')
  check('create_task accepts captain as a captain-owned task alias',
    captainOwnedTaskError === undefined
      && captainOwnedTask?.assignee === 'captain'
      && assigneeBoundaryTeam?.tasks.some(task => task.subject === 'captain-owned follow-up' && task.assignee === 'captain'))
  check('create_task normalizes an empty assignee into the shared pool',
    sharedPoolTaskError === undefined
      && sharedPoolTask?.assignee === undefined
      && assigneeBoundaryTeam?.tasks.some(task => task.subject === 'shared-pool follow-up' && task.assignee === undefined))
  await call('agent_teams_delete', {})

  await call('agent_teams_create', { name: 'Quality Loop', description: 'review loop' })
  await call('agent_teams_add_member', { name: 'builder', role: 'implementer' })
  await call('agent_teams_add_member', { name: 'critic', role: 'reviewer' })
  const impl = await call('agent_teams_create_task', {
    subject: 'implement parser',
    assignee: 'builder',
    kind: 'implementation',
    objective: 'Ship the parser',
    inScope: ['src/parser.ts'],
    acceptance: ['parser accepts empty input'],
    verify: ['pnpm test'],
  })
  let missingContractRejected = false
  try {
    await call('agent_teams_create_task', { subject: 'impl without contract', kind: 'implementation' })
  } catch {
    missingContractRejected = true
  }
  check('quality implementation without contract is rejected', missingContractRejected)
  const qualityTeam = await readTeam(stateRoot, 'quality-loop')
  const builder = [...liveAgents.values()].find(agent => qualityTeam?.members.some(member => member.id === agent.id && member.name === 'builder'))
  const criticMember = [...liveAgents.values()].find(agent => qualityTeam?.members.some(member => member.id === agent.id && member.name === 'critic'))
  const implClaim = await call('agent_teams_claim_task', { task_id: impl.task_id }, builder)
  await call('agent_teams_update_task', { task_id: impl.task_id, status: 'in_progress', attempt_id: implClaim.attempt_id }, builder)
  let illegalCompleteRejected = false
  try {
    await call('agent_teams_update_task', {
      task_id: impl.task_id,
      status: 'completed',
      attempt_id: implClaim.attempt_id,
      output: 'looks fine',
    }, builder)
  } catch {
    illegalCompleteRejected = true
  }
  check('illegal completed without acceptance evidence is rejected', illegalCompleteRejected)
  await call('agent_teams_update_task', {
    task_id: impl.task_id,
    status: 'completed',
    attempt_id: implClaim.attempt_id,
    output: 'parser shipped',
    changedPaths: ['src/parser.ts'],
    acceptanceResults: [{ criterion: 'parser accepts empty input', status: 'passed' }],
    commandsRun: [{ command: 'pnpm test', status: 'passed' }],
  }, builder)
  const review = await call('agent_teams_create_task', {
    subject: 'review parser',
    assignee: 'critic',
    kind: 'review',
    objective: 'Review the parser',
    acceptance: ['no blocker or high findings'],
    reviewedTaskId: impl.task_id,
  })
  const reviewClaim = await call('agent_teams_claim_task', { task_id: review.task_id }, criticMember)
  await call('agent_teams_update_task', { task_id: review.task_id, status: 'in_progress', attempt_id: reviewClaim.attempt_id }, criticMember)
  let needsRevisionCompleteRejected = false
  try {
    await call('agent_teams_update_task', {
      task_id: review.task_id,
      status: 'completed',
      attempt_id: reviewClaim.attempt_id,
      verdict: 'needs_revision',
      findings: [{ id: 'C-001', severity: 'high', problem: 'null crash', requiredFix: 'guard empty input', file: 'src/parser.ts' }],
    }, criticMember)
  } catch {
    needsRevisionCompleteRejected = true
  }
  check('review needs_revision cannot complete', needsRevisionCompleteRejected)
  await call('agent_teams_update_task', {
    task_id: review.task_id,
    status: 'failed',
    attempt_id: reviewClaim.attempt_id,
    verdict: 'needs_revision',
    findings: [{ id: 'C-001', severity: 'high', problem: 'null crash', requiredFix: 'guard empty input', file: 'src/parser.ts' }],
  }, criticMember)
  const afterReview = await readTeam(stateRoot, 'quality-loop')
  const repair = afterReview?.tasks.find(item => item.kind === 'repair')
  const nextReview = afterReview?.tasks.find(item => item.kind === 'review' && item.id !== review.task_id)
  check('needs_revision opens repair and next review',
    repair !== undefined && nextReview !== undefined
      && repair.dependencies.includes(impl.task_id)
      && !repair.dependencies.includes(review.task_id)
      && nextReview.assignee === 'critic'
      && nextReview.assignee !== 'builder')
  await call('agent_teams_delete', {})

  await call('agent_teams_create', { name: 'Lifecycle', description: 'adversarial DAG' })
  const addedAlpha = await call('agent_teams_add_member', { name: 'alpha', role: 'slow implementer' })
  const addedBeta = await call('agent_teams_add_member', { name: 'beta', role: 'researcher' })
  const persistedAlpha = (await state()).members.find(member => member.name === 'alpha')
  check('member additions ignore global route settings and persist the role policy',
    addedAlpha.provider === 'fake'
      && addedAlpha.model === 'fake-model'
      && addedAlpha.reasoning_effort === undefined
      && addedBeta.provider === 'fake'
      && addedBeta.model === 'fake-model'
      && addedBeta.reasoning_effort === undefined
      && persistedAlpha?.provider === 'fake'
      && persistedAlpha.model === 'fake-model'
      && persistedAlpha.reasoningMode === 'target-default')
  const addedGamma = await call('agent_teams_add_member', { name: 'gamma', role: 'reviewer' })
  const alpha = liveAgents.get(addedAlpha.member_id)
  const beta = liveAgents.get(addedBeta.member_id)
  const gamma = liveAgents.get(addedGamma.member_id)
  check('AgentTeams internal startContinuable succeeds under Team policy',
    typeof addedAlpha.member_id === 'string' && alpha !== undefined)
  check('member receives Team policy before publication',
    lifecycleSections.get(alpha)?.text.includes(policyMarker('teams-v1'))
      && NATIVE_DELEGATION_TOOLS.every(name => alpha.ctx.tools.get(name, alpha) === undefined))
  check('captain-only and Team restrictions preserve member-local report tools',
    alpha.ctx.tools.get('agent_teams_send_message', alpha) !== undefined
      && alpha.ctx.tools.get('agent_teams_update_task', alpha) !== undefined)
  publishStatus(alpha, 'idle')
  publishStatus(beta, 'idle')
  publishStatus(gamma, 'idle')

  const t1 = await call('agent_teams_create_task', { subject: 'slow branch', assignee: 'alpha' })
  const firstAttempt = await task(t1.task_id)
  check('idle assigned member is claimed and woken automatically',
    firstAttempt?.status === 'claimed' && firstAttempt.assignee === 'alpha'
      && deliveries.some(delivery => delivery.childId === alpha.id))
  const alphaAssignment = deliveries.find(delivery => delivery.childId === alpha.id
    && deliveryText(delivery).includes(`Task: ${t1.task_id}`))
  const alphaAssignmentText = deliveryText(alphaAssignment)
  const assignmentShapeOk = alphaAssignmentText
    .includes(`agent_teams_claim_task({"task_id":"${t1.task_id}"})`)
    && alphaAssignmentText.includes('omit the assignee property entirely')
  check('automatic assignment gives members an exact task-id-only claim shape',
    assignmentShapeOk,
    assignmentShapeOk ? '' : alphaAssignmentText || 'missing assignment delivery')
  const alphaClaim = await call('agent_teams_claim_task', { task_id: t1.task_id }, alpha)
  check('member observes the scheduler attempt idempotently', alphaClaim.attempt_id === firstAttempt?.attemptId)
  const alphaEmptyClaim = await call('agent_teams_claim_task', {
    task_id: t1.task_id, assignee: '',
  }, alpha)
  const alphaWhitespaceClaim = await call('agent_teams_claim_task', {
    task_id: t1.task_id, assignee: '   ',
  }, alpha)
  const alphaSelfClaim = await call('agent_teams_claim_task', {
    task_id: t1.task_id, assignee: 'alpha',
  }, alpha)
  check('member empty, whitespace, and self assignee noise remain idempotent',
    [alphaEmptyClaim, alphaWhitespaceClaim, alphaSelfClaim]
      .every(claim => claim.attempt_id === firstAttempt?.attemptId))
  for (const forbiddenAssignee of ['captain', 'beta']) {
    let rejected = false
    try {
      await call('agent_teams_claim_task', {
        task_id: t1.task_id, assignee: forbiddenAssignee,
      }, alpha)
    } catch (error) {
      rejected = /members cannot set assignee when claiming a task/.test(String(error))
    }
    check(`member cannot claim as ${forbiddenAssignee}`, rejected)
  }
  await call('agent_teams_update_task', {
    task_id: t1.task_id, status: 'in_progress', attempt_id: alphaClaim.attempt_id,
  }, alpha)

  const t2 = await call('agent_teams_create_task', { subject: 'parallel research', assignee: 'beta' })
  const t3 = await call('agent_teams_create_task', {
    subject: 'integration gate', assignee: 'gamma', dependencies: [t1.task_id, t2.task_id],
  })
  const betaClaim = await call('agent_teams_claim_task', { task_id: t2.task_id }, beta)
  await call('agent_teams_update_task', {
    task_id: t2.task_id, status: 'in_progress', attempt_id: betaClaim.attempt_id,
  }, beta)
  check('dependency gate stays pending before both branches complete', (await task(t3.task_id))?.status === 'pending')

  // A normal turn may end while its task is intentionally parked waiting for
  // guidance, and a user can explicitly pause a running member. Neither case
  // authorizes the scheduler to revoke the live attempt. Repeated status kicks
  // must be idempotent until the captain performs an explicit reassignment.
  publishStatus(alpha, 'idle')
  await new Promise(resolve => setTimeout(resolve, 20))
  // Normal continuable settlement disposes its live AgentHandle between
  // turns. The process-local idle observation must still distinguish this
  // parked attempt from a cold process restart.
  liveAgents.delete(alpha.id)
  const deliveriesBeforeParkedKicks = deliveries.length
  await Promise.all([
    call('agent_teams_status', { wake: 'recover' }),
    call('agent_teams_status', { wake: 'recover' }),
    call('agent_teams_status', { wake: 'recover' }),
  ])
  await new Promise(resolve => setTimeout(resolve, 20))
  const parkedAlpha = await task(t1.task_id)
  check('resident idle owner keeps its open attempt across repeated scheduler kicks',
    parkedAlpha?.status === 'in_progress'
      && parkedAlpha.attempt === alphaClaim.attempt
      && parkedAlpha.attemptId === alphaClaim.attempt_id
      && deliveries.length === deliveriesBeforeParkedKicks)
  liveAgents.set(alpha.id, alpha)

  publishStatus(beta, 'idle')
  await new Promise(resolve => setTimeout(resolve, 20))
  const deliveriesBeforeResume = deliveries.length
  const resumedBeta = await call('agent_teams_send_message', {
    to: 'beta', content: 'Continue the same parked task and keep its current attempt id.',
  })
  const resumedBetaTask = await task(t2.task_id)
  check('captain message resumes a parked owner without rotating its attempt',
    resumedBeta.delivered === 'wake'
      && deliveries.length === deliveriesBeforeResume + 1
      && resumedBetaTask?.attempt === betaClaim.attempt
      && resumedBetaTask.attemptId === betaClaim.attempt_id)

  let unsafeCaptainTakeoverRejected = false
  try {
    await call('agent_teams_update_task', {
      task_id: t1.task_id, status: 'completed', output: 'captain bypassed handoff',
    })
  } catch (error) {
    unsafeCaptainTakeoverRejected = /reassign_task/.test(String(error))
  }
  check('captain cannot bypass the safe takeover protocol', unsafeCaptainTakeoverRejected)

  const takeover = await call('agent_teams_reassign_task', {
    task_id: t1.task_id, assignee: 'gamma', reason: 'alpha is stuck',
  })
  const reassigned = await task(t1.task_id)
  check('reassignment quiesces old owner and creates a new attempt',
    takeover.assignee === 'gamma' && reassigned?.status === 'claimed'
      && reassigned.attemptId !== alphaClaim.attempt_id
      && takeover.attempt === alphaClaim.attempt + 1)
  let staleRejected = false
  try {
    await call('agent_teams_update_task', {
      task_id: t1.task_id, status: 'completed', output: 'late alpha', attempt_id: alphaClaim.attempt_id,
    }, alpha)
  } catch (error) {
    staleRejected = /assigned to|stale attempt/.test(String(error))
  }
  check('old member cannot publish a late takeover result', staleRejected)

  const gammaClaim = await call('agent_teams_claim_task', { task_id: t1.task_id }, gamma)
  await call('agent_teams_update_task', {
    task_id: t1.task_id, status: 'in_progress', attempt_id: gammaClaim.attempt_id,
  }, gamma)
  await call('agent_teams_update_task', {
    task_id: t1.task_id, status: 'completed', output: 'gamma result', attempt_id: gammaClaim.attempt_id,
  }, gamma)
  await call('agent_teams_update_task', {
    task_id: t2.task_id, status: 'completed', output: 'beta result', attempt_id: betaClaim.attempt_id,
  }, beta)
  check('resumed member completes with the original parked capability',
    (await task(t2.task_id))?.status === 'completed'
      && (await task(t2.task_id))?.attemptId === betaClaim.attempt_id)
  publishStatus(beta, 'idle')
  publishStatus(gamma, 'idle')
  await new Promise(resolve => setTimeout(resolve, 20))
  const gate = await task(t3.task_id)
  check('completing dependencies dispatches the downstream task', gate?.status === 'claimed' && gate.assignee === 'gamma')
  const gateClaim = await call('agent_teams_claim_task', { task_id: t3.task_id }, gamma)
  await call('agent_teams_update_task', {
    task_id: t3.task_id, status: 'in_progress', attempt_id: gateClaim.attempt_id,
  }, gamma)
  await call('agent_teams_update_task', {
    task_id: t3.task_id, status: 'completed', output: 'integrated', attempt_id: gateClaim.attempt_id,
  }, gamma)

  publishStatus(alpha, 'idle')
  publishStatus(beta, 'idle')
  gamma.status = 'running'
  const t4 = await call('agent_teams_create_task', { subject: 'later-round assigned work', assignee: 'alpha' })
  const reused = await task(t4.task_id)
  check('previously interrupted member is reused in a later round', reused?.assignee === 'alpha' && reused.status === 'claimed')

  const t5 = await call('agent_teams_create_task', { subject: 'must wait behind alpha', assignee: 'alpha' })
  let busyRejected = false
  try {
    await call('agent_teams_claim_task', { task_id: t5.task_id }, alpha)
  } catch (error) {
    busyRejected = /busy with/.test(String(error))
  }
  check('a member cannot claim a second unfinished task', busyRejected)
  await call('agent_teams_reassign_task', {
    task_id: t5.task_id, assignee: 'captain', reason: 'close busy-check task',
  })
  await call('agent_teams_update_task', { task_id: t5.task_id, status: 'in_progress' })
  await call('agent_teams_update_task', { task_id: t5.task_id, status: 'completed', output: 'closed' })

  await call('agent_teams_remove_member', { name: 'alpha' })
  const afterRemoval = await state()
  const recovered = afterRemoval?.tasks.find(candidate => candidate.id === t4.task_id)
  check('removing a member revokes and redispatches its unfinished task',
    afterRemoval?.members.find(member => member.name === 'alpha')?.status === 'removed'
      && recovered?.assignee !== 'alpha')
  check('removing a member preserves its catalog entry for transcript history',
    (await ctx.subagents.listChildren(captain.id)).some(child => child.id === alpha.id))
  let removedFollowupRejected = false
  const deliveriesBeforeRemovedFollowup = deliveries.length
  try {
    await ctx.subagents.followup(captain, alpha.id, [{ type: 'text', text: 'must not resume' }], {
      source: { kind: 'plugin', plugin: 'verification' }, signal: new AbortController().signal,
    })
  } catch (error) {
    removedFollowupRejected = error?.code === 'NOT_RESUMABLE'
  }
  check('removing a member blocks direct followup before resume',
    removedFollowupRejected && deliveries.length === deliveriesBeforeRemovedFollowup)
  let removedRejected = false
  try {
    await call('agent_teams_update_task', {
      task_id: t4.task_id, status: 'completed', output: 'removed alpha', attempt_id: reused?.attemptId,
    }, alpha)
  } catch {
    removedRejected = true
  }
  check('removed member loses participant authorization', removedRejected)

  // Finish all work recovered from alpha so beta/gamma are free for later races.
  for (const recoveredTaskId of [t4.task_id]) {
    const current = await task(recoveredTaskId)
    if (!current?.assignee || current.status !== 'claimed') continue
    const owner = current.assignee === 'beta' ? beta : gamma
    const claim = await call('agent_teams_claim_task', { task_id: recoveredTaskId }, owner)
    await call('agent_teams_update_task', { task_id: recoveredTaskId, status: 'in_progress', attempt_id: claim.attempt_id }, owner)
    await call('agent_teams_update_task', {
      task_id: recoveredTaskId, status: 'completed', output: 'recovered', attempt_id: claim.attempt_id,
    }, owner)
  }

  gamma.status = 'idle'
  failNextDelivery.add(gamma.id)
  const fallback = await call('agent_teams_send_message', { to: 'gamma', content: 'durable fallback' })
  check('failed live message remains one unread durable fallback',
    fallback.delivered === 'mailbox' && (await readUnreadMailbox(stateRoot, teamId, 'gamma')).length === 1)
  const deliveriesBeforeReadOnlyStatus = deliveries.length
  await call('agent_teams_status', {})
  check('read-only status preserves unread fallback and does not wake members',
    deliveries.length === deliveriesBeforeReadOnlyStatus
      && (await readUnreadMailbox(stateRoot, teamId, 'gamma')).length === 1)
  await call('agent_teams_status', { acknowledge: true }, gamma)
  check('explicit status acknowledgement consumes the displayed mailbox',
    (await readUnreadMailbox(stateRoot, teamId, 'gamma')).length === 0)

  failNextDelivery.add(gamma.id)
  const recoveryFallback = await call('agent_teams_send_message', { to: 'gamma', content: 'recoverable fallback' })
  check('second failed live message remains durable before recovery',
    recoveryFallback.delivered === 'mailbox' && (await readUnreadMailbox(stateRoot, teamId, 'gamma')).length === 1)
  await call('agent_teams_status', { wake: 'recover' })
  check('status kick redelivers and acknowledges fallback exactly once',
    (await readUnreadMailbox(stateRoot, teamId, 'gamma')).length === 0)

  const memberRecoveryStatus = await call('agent_teams_status', { wake: 'recover' }, gamma)
  check('member recovery wake degrades to read-only without scheduling recovery',
    memberRecoveryStatus.active === true
      && memberRecoveryStatus.wake_ignored === 'recover'
      && memberRecoveryStatus.recovery_started === false
      && (await readUnreadMailbox(stateRoot, teamId, 'gamma')).length === 0)

  beta.status = 'running'
  gamma.status = 'running'
  const t6 = await call('agent_teams_create_task', { subject: 'concurrent claim' })
  beta.status = 'idle'
  gamma.status = 'idle'
  const race = await Promise.allSettled([
    call('agent_teams_claim_task', { task_id: t6.task_id }, beta),
    call('agent_teams_claim_task', { task_id: t6.task_id }, gamma),
  ])
  check('concurrent claims serialize to exactly one owner',
    race.filter(result => result.status === 'fulfilled').length === 1
      && race.filter(result => result.status === 'rejected').length === 1)
  const won = race.find(result => result.status === 'fulfilled').value
  const winner = won.assignee === 'beta' ? beta : gamma
  // A successful member claim is made from a running model turn. Preserve
  // that Harness status edge before unrelated kicks can retry an idle claim.
  winner.status = 'running'
  await call('agent_teams_update_task', { task_id: t6.task_id, status: 'in_progress', attempt_id: won.attempt_id }, winner)
  await call('agent_teams_update_task', {
    task_id: t6.task_id, status: 'completed', output: 'winner', attempt_id: won.attempt_id,
  }, winner)
  let terminalRejected = false
  try {
    await call('agent_teams_update_task', {
      task_id: t6.task_id, status: 'completed', output: 'late overwrite', attempt_id: won.attempt_id,
    }, winner)
  } catch (error) {
    terminalRejected = /immutable/.test(String(error))
  }
  check('terminal output is immutable against late overwrite', terminalRejected)

  beta.status = 'idle'
  const t7 = await call('agent_teams_create_task', { subject: 'captain takeover', assignee: 'beta' })
  const betaTakeoverClaim = await call('agent_teams_claim_task', { task_id: t7.task_id }, beta)
  await call('agent_teams_update_task', {
    task_id: t7.task_id, status: 'in_progress', attempt_id: betaTakeoverClaim.attempt_id,
  }, beta)
  const captainAttempt = await call('agent_teams_reassign_task', {
    task_id: t7.task_id, assignee: 'captain', reason: 'deadline takeover',
  })
  await call('agent_teams_update_task', { task_id: t7.task_id, status: 'in_progress' })
  await call('agent_teams_update_task', { task_id: t7.task_id, status: 'completed', output: 'captain result' })
  let lateTakeoverRejected = false
  try {
    await call('agent_teams_update_task', {
      task_id: t7.task_id, status: 'completed', output: 'late beta', attempt_id: betaTakeoverClaim.attempt_id,
    }, beta)
  } catch {
    lateTakeoverRejected = true
  }
  check('captain takeover owns a fresh attempt and rejects the old member',
    captainAttempt.assignee === 'captain' && captainAttempt.attempt_id !== betaTakeoverClaim.attempt_id
      && captainAttempt.status === 'in_progress'
      && captainAttempt.attempt === betaTakeoverClaim.attempt + 1
      && lateTakeoverRejected && (await task(t7.task_id))?.output === 'captain result')

  // A captain is one execution lane, not an unlimited pseudo-member. Two
  // parallel takeovers previously produced the issue #77 state: both member
  // rows lost their tasks while two captain-owned attempts stayed parked.
  beta.status = 'idle'
  gamma.status = 'idle'
  const t8 = await call('agent_teams_create_task', { subject: 'parallel captain takeover A', assignee: 'beta' })
  const t9 = await call('agent_teams_create_task', { subject: 'parallel captain takeover B', assignee: 'gamma' })
  const betaParallelClaim = await call('agent_teams_claim_task', { task_id: t8.task_id }, beta)
  const gammaParallelClaim = await call('agent_teams_claim_task', { task_id: t9.task_id }, gamma)
  await call('agent_teams_update_task', {
    task_id: t8.task_id, status: 'in_progress', attempt_id: betaParallelClaim.attempt_id,
  }, beta)
  await call('agent_teams_update_task', {
    task_id: t9.task_id, status: 'in_progress', attempt_id: gammaParallelClaim.attempt_id,
  }, gamma)
  const captainTakeoverRace = await Promise.allSettled([
    call('agent_teams_reassign_task', {
      task_id: t8.task_id, assignee: 'captain', reason: 'parallel takeover guard A',
    }),
    call('agent_teams_reassign_task', {
      task_id: t9.task_id, assignee: 'captain', reason: 'parallel takeover guard B',
    }),
  ])
  const raceState = await state()
  check('parallel captain takeovers allow exactly one active captain task',
    captainTakeoverRace.filter(result => result.status === 'fulfilled').length === 1
      && captainTakeoverRace.filter(result => result.status === 'rejected'
        && /captain is busy with/.test(String(result.reason))).length === 1
      && raceState?.tasks.filter(candidate => candidate.assignee === 'captain'
        && (candidate.status === 'claimed' || candidate.status === 'in_progress')).length === 1)

  // If the captain ends the turn without completing that one takeover, it
  // must return to the ordinary member scheduler instead of staying white and
  // ownerless forever in the activity panel.
  publishStatus(captain, 'idle')
  const recoveredParallel = await waitFor('captain takeover tasks to return to assigned members', async () => {
    const afterCaptainIdle = await state()
    const recovered = afterCaptainIdle?.tasks.filter(candidate => (
      candidate.id === t8.task_id || candidate.id === t9.task_id
    )) ?? []
    return recovered.length === 2
      && recovered.every(candidate => (
        (candidate.assignee === 'beta' || candidate.assignee === 'gamma')
          && (candidate.status === 'claimed' || candidate.status === 'in_progress')
      ))
      ? recovered
      : undefined
  })
  check('unfinished captain takeover returns to a member when the captain becomes idle',
    recoveredParallel.length === 2
      && recoveredParallel.every(candidate => candidate.assignee !== 'captain')
      && recoveredParallel.every(candidate => candidate.status === 'claimed' || candidate.status === 'in_progress'))
  for (const recoveredTask of recoveredParallel) {
    const owner = recoveredTask.assignee === 'gamma' ? gamma : beta
    owner.status = 'running'
    const claim = await call('agent_teams_claim_task', { task_id: recoveredTask.id }, owner)
    await call('agent_teams_update_task', {
      task_id: recoveredTask.id, status: 'in_progress', attempt_id: claim.attempt_id,
    }, owner)
    await call('agent_teams_update_task', {
      task_id: recoveredTask.id, status: 'completed', output: 'member recovered captain work', attempt_id: claim.attempt_id,
    }, owner)
  }

  beta.status = 'running'
  gamma.status = 'idle'
  const snapshot = await call('agent_teams_status', {})
  check('activity refines residency through the live Agent registry',
    snapshot.members.find(member => member.name === 'beta')?.activity === 'running'
      && snapshot.members.find(member => member.name === 'gamma')?.activity === 'idle')

  beta.status = 'idle'
  gamma.status = 'idle'
  // Exercise the storage-only ready path: deletion must deny cold resume
  // without materializing the member or spending a model turn.
  liveAgents.delete(gamma.id)
  await call('agent_teams_delete', {})
  const archived = await readArchivedTeam(stateRoot, teamId)
  check('team shutdown archives the complete durable record',
    await readTeam(stateRoot, teamId) === undefined
      && archived !== undefined)
  const archivedSnapshot = (await collectArchivedTeamsActivity(ctx, [{ workspace, stateRoot }]))
    .find(candidate => candidate.teamId === teamId)
  check('archived activity keeps every member after shutdown',
    archivedSnapshot?.members.length === 3
      && ['alpha', 'beta', 'gamma'].every(name => archivedSnapshot.members.some(member => member.name === name))
      && archivedSnapshot.members.every(member => member.activity === 'idle'))
  const expectedArchivedRoutes = new Map([
    ['alpha', 'fake/fake-model'],
    ['beta', 'fake/fake-model'],
    ['gamma', 'fake/fake-model'],
  ])
  check('archived activity projects each member model onto assigned tasks',
    archivedSnapshot?.members.every(member => memberModelRoute(member) === expectedArchivedRoutes.get(member.name))
      && archivedSnapshot.tasks
        .filter(task => expectedArchivedRoutes.has(task.assignee))
        .every(task => task.model === expectedArchivedRoutes.get(task.assignee)))
  check('team shutdown keeps retired members catalog-visible for historical transcripts',
    (await ctx.subagents.listChildren(captain.id))
      .filter(child => child.kind === 'child'
        && child.mode === 'continuable'
        && child.label.startsWith('agent-teams:lifecycle:')).length === 3)
  let coldFollowupRejected = false
  const deliveriesBeforeColdFollowup = deliveries.length
  try {
    await ctx.subagents.followup(captain, gamma.id, [{ type: 'text', text: 'must stay retired' }], {
      source: { kind: 'plugin', plugin: 'verification' }, signal: new AbortController().signal,
    })
  } catch (error) {
    coldFollowupRejected = error?.code === 'NOT_RESUMABLE'
  }
  check('team shutdown blocks storage-only member cold resume',
    coldFollowupRejected && deliveries.length === deliveriesBeforeColdFollowup)
  check('team shutdown leaves unrelated continuable subagents untouched',
    (await ctx.subagents.listChildren(captain.id))
      .some(child => child.id === 'foreign-session' && child.mode === 'continuable'))
  const foreignFollowup = await ctx.subagents.followup(captain, 'foreign-session', [
    { type: 'text', text: 'unrelated work still routes' },
  ], {
    source: { kind: 'plugin', plugin: 'verification' }, signal: new AbortController().signal,
  })
  check('team shutdown leaves unrelated continuable followup untouched',
    typeof foreignFollowup === 'string'
      && deliveries.some(delivery => delivery.childId === 'foreign-session'))

  // The invalid-roster assertion needs role-specific route arguments, so use
  // target-default mode here. Explicit mode intentionally ignores guessed
  // provider/model arguments and is covered by the local selection gate.
  await call('agent_teams_create', {
    name: 'Atomic Approval',
    description: 'invalid route must not partially start',
    approval: 'required',
  })
  await call('agent_teams_add_member', { name: 'valid', role: 'writer', provider: 'fake', model: 'fake-model' })
  await call('agent_teams_add_member', { name: 'invalid', role: 'reviewer', provider: 'fake', model: 'typo-model' })
  await call('agent_teams_create_task', { subject: 'must remain staged', assignee: 'valid' })
  const atomicApprovalReady = await call('agent_teams_edit_plan', { operations: [], submit_for_review: true })
  const atomicWebApproval = await agentTeamsRuntime.prepareWebApproval(
    captain,
    'atomic-approval',
    atomicApprovalReady.plan_revision,
  )
  const childrenBeforeRejectedApproval = children.length
  advertisedModels = ['fake-model']
  let invalidApprovalRejected = false
  try {
    await agentTeamsRuntime.approveStagedTeam(captain, 'atomic-approval', {
      source: 'web',
      token: atomicWebApproval.token,
      expectedPlanRevision: atomicWebApproval.planRevision,
    })
  } catch (error) {
    invalidApprovalRejected = /unknown member model.*typo-model/i.test(String(error?.message ?? error))
  }
  const rejectedApprovalTeam = await readTeam(stateRoot, 'atomic-approval')
  check('invalid roster approval rejects before any member session is created',
    invalidApprovalRejected
      && children.length === childrenBeforeRejectedApproval
      && rejectedApprovalTeam?.phase === 'staged'
      && rejectedApprovalTeam.members.every(member => member.id === '')
      && rejectedApprovalTeam.tasks.every(item => item.status === 'pending'))
  advertisedModels = []
  await call('agent_teams_delete', {})
  await call('agent_teams_create', { name: 'Lifecycle', description: 'second generation' })
  await call('agent_teams_delete', {})
  const replacementArchive = await readArchivedTeam(stateRoot, teamId)
  check('same-name team can be recreated and archived again',
    await readTeam(stateRoot, teamId) === undefined
      && replacementArchive?.description === 'second generation')

  // A resumed parent may be represented by a replacement runtime handle while
  // retaining the same durable Session identity. Team ownership must follow the
  // durable session id, not a transient handle id created around a continuation
  // turn. This is the regression for the observed post-child-start failure where
  // the resumed captain suddenly lost access to its still-active Team.
  const resumeIdentityTeam = await call('agent_teams_create', {
    name: 'Resume Identity', description: 'parent replacement keeps Team access',
  })
  const resumedCaptain = makeAgent('captain-runtime-replacement', captain.id)
  resumedCaptain.session.id = captain.id
  liveAgents.set(resumedCaptain.id, resumedCaptain)
  let resumedStatus
  let resumedStatusError
  try {
    resumedStatus = await call('agent_teams_status', {}, resumedCaptain)
  } catch (error) {
    resumedStatusError = error
  }
  check('resumed captain keeps Team authorization through durable Session.id',
    resumedStatus?.team_id === resumeIdentityTeam.team_id
      && resumedStatusError === undefined)
  liveAgents.delete(resumedCaptain.id)
  await call('agent_teams_delete', {})

  // A delete must wait for a child delivery that already entered the unified
  // gateway. Without the per-child lock, the interrupt marks the fake Agent
  // idle and the archive completes while the underlying follow-up is still
  // blocked, allowing an in-flight model turn to outlive the Team.
  const deleteRaceTeam = await call('agent_teams_create', {
    name: 'Delete Delivery Race',
    description: 'delete waits for an in-flight child delivery',
    profile: 'software-delivery',
  })
  const deleteRaceState = await readTeam(stateRoot, deleteRaceTeam.team_id)
  const deleteRaceMember = deleteRaceState?.members[0]
  let deleteRaceSendError
  let deleteRaceDeleteError
  let deleteRaceSendResult
  let deleteRaceDeleteResult
  if (deleteRaceMember === undefined || deleteRaceMember.id === '') {
    check('delete race fixture has a spawned member', false)
  } else {
    const heldDelivery = holdFollowupFor(deleteRaceMember.id)
    try {
      const sendPromise = call('agent_teams_send_message', {
        to: deleteRaceMember.name,
        content: 'delivery must finish before archive',
      })
      await heldDelivery.entered
      const deletePromise = call('agent_teams_delete', {})
      const deleteSettledBeforeRelease = await Promise.race([
        deletePromise.then(() => true, () => true),
        new Promise(resolve => setTimeout(() => resolve(false), 25)),
      ])
      check('team delete waits for an in-flight child delivery lock', deleteSettledBeforeRelease === false)
      heldDelivery.release()
      try {
        deleteRaceSendResult = await sendPromise
      } catch (error) {
        deleteRaceSendError = error
      }
      try {
        deleteRaceDeleteResult = await deletePromise
      } catch (error) {
        deleteRaceDeleteError = error
      }
      check('in-flight delivery settles before delete archives the Team',
        deleteRaceSendError === undefined
          && deleteRaceDeleteError === undefined
          && deleteRaceSendResult?.delivered === 'wake'
          && deleteRaceDeleteResult?.deleted === true
          && await readArchivedTeam(stateRoot, deleteRaceTeam.team_id) !== undefined)
    } finally {
      heldDelivery.release()
      heldFollowup = undefined
    }
  }

  // Keep the terminal member-turn failure bridge in the lifecycle gate.  The
  // dedicated member-failure suite covers request-error recovery, duplicate
  // turns, stale attempts, and child-idle scheduling; this fixture proves the
  // durable state/mailbox transition also works in the broader lifecycle
  // harness without creating a real Team through the Web tools.
  const failureBridgeTeamId = 'lifecycle-failure-bridge'
  const failureBridgeMember = makeAgent('failure-bridge-member-session', captain.id)
  failureBridgeMember.status = 'idle'
  liveAgents.set(failureBridgeMember.id, failureBridgeMember)
  const bridgeNow = Date.now()
  await createTeamDir(stateRoot, {
    schemaVersion: 2,
    id: failureBridgeTeamId,
    name: 'Lifecycle Failure Bridge',
    description: 'terminal member failure lifecycle regression',
    captainSessionId: captain.id,
    createdAt: bridgeNow,
    taskSeq: 1,
    planRevision: 1,
    phase: 'running',
    approvedAt: bridgeNow,
    approvedPlanRevision: 1,
    approvalSource: 'automatic',
    approvalEvidenceId: `automatic:create:${failureBridgeTeamId}`,
    members: [{
      id: failureBridgeMember.id,
      name: 'bridge-worker',
      role: 'failure bridge worker',
      provider: 'fake',
      model: 'fake-model',
      reasoningMode: 'target-default',
      joinedAt: bridgeNow,
      status: 'working',
    }],
    tasks: [{
      id: 't1',
      subject: 'terminal failure bridge',
      assignee: 'bridge-worker',
      status: 'in_progress',
      dependencies: [],
      revision: 1,
      attempt: 1,
      attemptId: 'bridge-attempt-1',
      kind: 'work',
      createdAt: bridgeNow,
      updatedAt: bridgeNow,
    }],
  })
  const captainBeforeBridge = liveAgents.get(captain.id)
  liveAgents.delete(captain.id)
  let bridgeRecorded = false
  try {
    bridgeRecorded = await failMemberOpenAttempt(
      ctx,
      stateRoot,
      failureBridgeTeamId,
      'bridge-worker',
      { code: 'STREAM_CLOSED', message: 'terminal bridge failure' },
      failureBridgeMember.session,
      {
        captainSessionId: captain.id,
        memberId: failureBridgeMember.id,
        task: { id: 't1', attempt: 1, attemptId: 'bridge-attempt-1' },
      },
    )
  } finally {
    if (captainBeforeBridge !== undefined) liveAgents.set(captain.id, captainBeforeBridge)
  }
  const failureBridgeState = await readTeam(stateRoot, failureBridgeTeamId)
  const failureBridgeMailbox = await readUnreadMailbox(stateRoot, failureBridgeTeamId, 'captain')
  check('lifecycle terminal member failure marks the attempt failed and releases the member',
    bridgeRecorded
      && failureBridgeState?.tasks[0]?.status === 'failed'
      && failureBridgeState.members[0]?.status === 'idle')
  check('lifecycle terminal member failure leaves a durable captain mailbox report',
    failureBridgeMailbox.length === 1
      && failureBridgeMailbox[0]?.from === 'bridge-worker'
      && failureBridgeMailbox[0]?.content.includes('terminal bridge failure'))
  liveAgents.delete(failureBridgeMember.id)
} finally {
  await rm(workspace, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} lifecycle check(s) FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nall lifecycle checks passed')
