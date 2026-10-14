/**
 * The `agent_teams_*` model-facing tools.
 *
 * The captain (the agent that created the team) orchestrates: members are
 * continuable subagents it spawns and wakes. Members share the same tools and
 * drive their own task state, mirroring the Claude Code AgentTeams flow:
 * create team → add members → create tasks with dependencies → claim/assign →
 * work → report → status → delete.
 * @module dsh-agent-teams/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { appendTeamEvent, captainSessionOf } from './events.ts'
import {
  acknowledgeMailbox,
  amendTaskContract,
  appendMailbox,
  assertExpectedPlanRevision,
  archiveTeamDir,
  beginTaskAttempt,
  CAPTAIN_KEY,
  createMessage,
  createTeamDir,
  discardMailboxMessages,
  findTeamByCaptain,
  findTeamByParticipant,
  cancelUnfinishedTask,
  invalidateTaskAttempt,
  markMailboxDelivered,
  readUnreadMailbox,
  recordRetiredMemberIds,
  releaseMailboxDelivery,
  readTeam,
  sanitizeKey,
  transitionError,
  unsatisfiedDependencies,
  withTeamLock,
  writeTeam,
  removeTeamDir,
  validateCreateTask,
  evaluateQualityCompletion,
  planQualityFollowUp,
  resumeTeamState,
  buildCoverageMatrix,
  canDeclareDelivery,
  describeQualityLoop,
  normalizeBlankOptionalTaskFields,
  sanitizeReviewAcceptance,
  sanitizeReviewObjective,
  isValidFindingLine,
  taskKindOf,
} from './state.ts'
import { AGENT_TEAMS_STATE_SCHEMA_VERSION, type ArtifactDigest, type ArtifactSnapshot, type AcceptanceResult, type CommandResult, type ReviewFinding, type ReviewVerdict, type TaskKind } from './types.ts'
import { appendTaskEvidence, auditChangedPaths, integrationReviewBlockers, normalizeWorkspacePath, unsupportedAmendmentArguments } from './quality-gates.ts'
import { captureAttemptAudit, observeAttemptChanges, observeWorkspace } from './workspace-audit.ts'
import { attributedConcurrentPaths, installAttemptEvidence, taskContractHash, workspaceCodeVersion } from './attempt-evidence.ts'
import { contractIdentity } from './audit-contract.ts'
import {
  artifactDrift,
  bindReviewToRevision,
  deliveryArtifactPaths,
  deliveryScopePatterns,
  isQualityKind,
  reviewedTargetOf,
  verdictScopePatterns,
} from './quality-gates.ts'
import type { DeliveryAudit } from './quality-gates.ts'
import { auditTeamWorkspace } from './workspace-audit.ts'
import { readArtifactScope, snapshotWorkspacePaths, workspacePathExists } from './artifacts.ts'
import { agentTeamsSource, restrictableToolNames } from './harness-compat.ts'
import { memberSpawnRelaxableDeny, optionalToolPolicy, requireToolPolicy, resolveMemberToolFilter, type MemberToolFilter, type MemberToolPolicy } from './tool-policies.ts'
import type { ContractAmendmentInput } from './quality-gates.ts'
import {
  deliverToMember,
  failureSummary,
  installMemberDelegationGuard,
  installRetiredMemberGuard,
  installMemberSelectionRuntime,
  memberActivity,
  resolveMemberLlmSelection,
  steerCaptainReport,
  spawnMember,
  validateMemberLlmSelections,
  type MemberRuntimeConfig,
} from './members.ts'
import { TERMINAL_TASK_STATUSES, type TeamMember, type TeamState, type TeamTask } from './types.ts'
import { findMemberRoleTemplate, type MemberPolicySource, type RoleReasoningMode } from './selection-policy.ts'
import { collectCompletedDependencyOutputs, formatDependencyOutputs, installTeamScheduler } from './scheduler.ts'
import { installMailboxAdmission, isCurrentMail, mailboxContent, mailboxPrompt, readCurrentMailbox } from './mailbox.ts'
import type { AgentTeamsSettingsRuntime } from './settings.ts'
import type { DelegationPolicyRuntime } from './routing-policy.ts'
import { listConfiguredProfiles, resolveTeamProfile, type TeamProfileConfig } from './profiles.ts'
import { createSubagentCompatibility, isTemporaryToolAdmission, type SubagentCompatibility } from './subagent-compat.ts'
import { renderStatus, statusFingerprint } from './status-render.ts'
import { automaticTeamName } from './team-name.ts'
import { chatApprovalEvidence } from './approval-evidence.ts'
import { createApprovalCredentialStore } from './approval-credentials.ts'
import { durableSessionId } from './agent-identity.ts'
import { agentTeamsSubagentGateway } from './subagent-gateway.ts'
import { forkLineageNote, leadIdentityOf, leadIdentityOfAsync, nearestLiveLead, sessionLeadsTeam, sessionLeadsTeamAsync } from './lineage.ts'
import { currentUserProfileCommand } from './command.ts'
import { renderInactiveTeamStatus, PROFILE_RECOVERY_GUIDANCE, installInactiveTeamPollingGuard } from './inactive-poll-guard.ts'
import { hasCurrentTurnTemporaryAuthorization } from './temporary-authorization.ts'

export { steerCaptainReport } from './members.ts'

/** Resolved plugin config consumed by the tools. */
export interface ToolsConfig {
  /** State directory name under the captain's workspace. */
  stateDir: string
  /** Member subagent provider name. */
  memberProvider: string
  /** Prompt injected into member personas and assignments. */
  executionPrompt?: string
  /** Plugin fallback route. */
  fallback?: import('./profiles.ts').TeamModelFallbackConfig
  /** Member delegation depth cap. */
  memberMaxDepth?: number
  /** Team size cap (members). */
  maxMembers: number
  /** Live delegation and unbound temporary/custom member defaults. */
  settings: AgentTeamsSettingsRuntime
  /** Durable Team/Native policy installed into captains and member children. */
  delegationPolicy?: DelegationPolicyRuntime
  /** Named team profiles from the active DSH profile. */
  profiles: Record<string, import('./profiles.ts').TeamProfileConfig>
  /** Synchronous test-only observation of profile initialization persistence calls. */
  testObserver?: {
    onInitializeProfileTeamPersistence?: (operation: 'createTeamDir' | 'writeTeam') => void
  }
  /** Owner-declared reusable member tool policies, keyed by policy id (#59). */
  toolPolicies: Record<string, MemberToolPolicy>
}

/** Browser/UI mutations allowed while a plan is waiting for approval. */
export type StagedPlanMutation =
  | {
      action: 'update_member'
      memberName: string
      role?: string | null
      provider: string
      model: string
      reasoningMode?: RoleReasoningMode
      reasoningEffort?: string | null
      executionPrompt?: string | null
      /** Selected tool-policy id; an empty string clears it back to no policy. */
      toolPolicy?: string
    }
  | {
      action: 'update_task'
      taskId: string
      subject?: string
      description?: string | null
      assignee?: string | null
      dependencies?: string[]
      kind?: TaskKind
      round?: number | null
      objective?: string | null
      inScope?: string[] | null
      outOfScope?: string[] | null
      acceptance?: string[] | null
      verify?: string[] | null
      deliverables?: string[] | null
      nonGoals?: string[] | null
      reviewedTaskId?: string | null
      sourceTaskId?: string | null
      sourceFindingIds?: string[] | null
      coverageOf?: string[] | null
    }
  | {
      action: 'add_task'
      subject: string
      description?: string | null
      assignee?: string | null
      dependencies?: string[]
      kind?: TaskKind
      round?: number | null
      objective?: string | null
      inScope?: string[] | null
      outOfScope?: string[] | null
      acceptance?: string[] | null
      verify?: string[] | null
      deliverables?: string[] | null
      nonGoals?: string[] | null
      reviewedTaskId?: string | null
      sourceTaskId?: string | null
      sourceFindingIds?: string[] | null
      coverageOf?: string[] | null
    }
  | { action: 'remove_task'; taskId: string }
  | { action: 'remove_member'; memberName: string }

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

/** Runtime bridge shared by model-facing tools and the Web staging surface. */
export interface AgentTeamsRuntime {
  delegateSubagent: SubagentCompatibility
  updateStagedPlan(captain: Agent, teamId: string, mutation: StagedPlanMutation, options: StagedPlanUpdateOptions, signal?: AbortSignal): Promise<TeamState>
  updateStagedPlanBatch(captain: Agent, teamId: string, mutations: readonly StagedPlanMutation[], options: StagedPlanUpdateOptions, signal?: AbortSignal): Promise<TeamState>
  prepareWebApproval(captain: Agent, teamId: string, expectedPlanRevision: number): Promise<PreparedWebApproval>
  approveStagedTeam(captain: Agent, teamId: string, evidence: ApprovalEvidence, signal?: AbortSignal): Promise<ApprovedTeamResult>
  continueStagedPlanning(captain: Agent, teamId: string): Promise<{ teamId: string; alreadyWaiting: boolean }>
  discardStagedTeam(captain: Agent, teamId: string): Promise<{ teamId: string }>
}

/** The caller agent, or a loud failure for non-agent callers. */
function requireCaptain(exec: ToolRunContext): Agent {
  if (!exec.agent) {
    throw new Error('agent_teams tools require a calling agent (exec.agent was undefined)')
  }
  return exec.agent
}

/** The captain's workspace directory (team state root parent). */
function workspaceOf(agent: Agent): string {
  return agent.session.header.cwd ?? process.cwd()
}

/** Resolved absolute state root. */
function stateRootOf(workspace: string, config: ToolsConfig): string {
  return join(workspace, config.stateDir)
}

/** Process-local lock key scoped by workspace state root and team id. */
function teamLockKey(stateRoot: string, teamId: string): string {
  return `team:${stateRoot}:${teamId}`
}

/**
 * Bind a closing verdict to the revision it judged, using the snapshot taken
 * when its attempt started (if any) to notice that the workspace changed while
 * the gate was being formed. A verdict that ran over a moving workspace binds
 * the drift explicitly instead of claiming the current bytes.
 */
function bindClosingVerdict(workspace: string, team: TeamState, task: TeamTask): void {
  if (task.status !== 'completed') return
  const kind = taskKindOf(task)
  if (kind !== 'review' && kind !== 'requirements' && kind !== 'verification') return
  if ((kind === 'review' || kind === 'requirements') && task.verdict !== 'pass') return
  const scope = verdictScopePatterns(team, task)
  if (scope.length === 0) return
  const read = readArtifactScope(workspace, scope)
  const duringDrift = task.verdictStartSnapshot === undefined
    ? []
    : artifactDrift(task.verdictStartSnapshot.artifacts, read.artifacts)
  const bound = bindReviewToRevision(team, task, {
    artifacts: read.artifacts,
    gaps: read.gaps,
    scope,
    duringDrift,
  })
  task.reviewedTaskId = bound.reviewedTaskId
  task.reviewedAttempt = bound.reviewedAttempt
  task.reviewedArtifacts = bound.reviewedArtifacts
  task.reviewedGaps = bound.reviewedGaps
  task.reviewedScope = bound.reviewedScope
  task.reviewedDuringDrift = bound.reviewedDuringDrift
  task.verdictStartSnapshot = undefined
}

/** Process-local lock key enforcing one active team per captain session. */
function captainLockKey(stateRoot: string, captainId: string): string {
  return `captain:${stateRoot}:${captainId}`
}

/** The team this captain currently leads, or a loud failure. */
async function requireCaptainTeam(ctx: Context, workspace: string, config: ToolsConfig, captain: Agent): Promise<TeamState> {
  const team = await findTeamByCaptain(stateRootOf(workspace, config), durableSessionId(captain), await leadIdentityOfAsync(ctx, captain.session))
  if (team === undefined) {
    throw new Error(`you are not leading any team yet — call agent_teams_create first${forkLineageNote(captain.session)}`)
  }
  return team
}

/** The team this captain or active member currently participates in. */
async function requireParticipantTeam(ctx: Context, workspace: string, config: ToolsConfig, caller: Agent): Promise<TeamState> {
  const team = await findTeamByParticipant(stateRootOf(workspace, config), durableSessionId(caller), await leadIdentityOfAsync(ctx, caller.session))
  if (team === undefined) {
    throw new Error(`you do not lead or belong to any active team yet${forkLineageNote(caller.session)}`)
  }
  return team
}

type ParticipantIdentity =
  | { kind: 'captain'; name: typeof CAPTAIN_KEY }
  | { kind: 'member'; name: string }

/** Re-derive a caller's role from fresh state while holding the team lock. */
async function participantIdentityOf(ctx: Context, team: TeamState, agentId: string): Promise<ParticipantIdentity | undefined> {
  if (await sessionLeadsTeamAsync(ctx, team, agentId)) return { kind: 'captain', name: CAPTAIN_KEY }
  const member = team.members.find((candidate) => candidate.id === agentId && candidate.status !== 'removed')
  return member === undefined ? undefined : { kind: 'member', name: member.name }
}

/** Fresh state for a team that still exists; never falls back to stale lookup data. */
async function requireFreshTeam(stateRoot: string, teamId: string): Promise<TeamState> {
  const fresh = await readTeam(stateRoot, teamId)
  if (fresh === undefined) throw new Error(`team "${teamId}" is no longer active`)
  return fresh
}

/** Fresh state with captain authorization rechecked inside the lock. */
async function requireFreshCaptainTeam(
  ctx: Context,
  stateRoot: string,
  teamId: string,
  captainId: string,
): Promise<TeamState> {
  const fresh = await requireFreshTeam(stateRoot, teamId)
  if (!(await sessionLeadsTeamAsync(ctx, fresh, captainId))) {
    throw new Error(`only the captain of team "${fresh.name}" (session ${fresh.captainSessionId}) or one of its fork descendants may perform this operation`)
  }
  return fresh
}

/** Fresh state and caller identity rechecked inside the lock. */
async function requireFreshParticipant(
  ctx: Context,
  stateRoot: string,
  teamId: string,
  callerId: string,
): Promise<{ team: TeamState; identity: ParticipantIdentity }> {
  const fresh = await requireFreshTeam(stateRoot, teamId)
  const identity = await participantIdentityOf(ctx, fresh, callerId)
  if (identity === undefined) throw new Error(`you are no longer an active participant in team "${fresh.name}"`)
  return { team: fresh, identity }
}

/** Look up one live (non-removed) member by display name. */
function requireMember(team: TeamState, name: string): TeamMember {
  const member = team.members.find((candidate) => candidate.name === name && candidate.status !== 'removed')
  if (member === undefined) {
    throw new Error(`no active member named "${name}" in team "${team.name}"`)
  }
  return member
}

/** Look up one task by id. */
function requireTask(team: TeamState, taskId: string): TeamTask {
  const task = team.tasks.find((candidate) => candidate.id === taskId)
  if (task === undefined) {
    throw new Error(`no task "${taskId}" in team "${team.name}" — use agent_teams_status to list tasks`)
  }
  return task
}

function requireStagedTeam(team: TeamState): void {
  if (team.phase !== 'staged') {
    throw new Error(`team "${team.name}" is already running; its plan can no longer be edited`)
  }
  if (team.halted === true) throw new Error(`team "${team.name}" is halted, not awaiting plan approval`)
}

function requireRunningTeam(team: TeamState): void {
  if (team.phase !== 'running') {
    throw new Error(`team "${team.name}" is staged; approve the plan before executing tasks`)
  }
}

function integrationGateError(taskId: string, reviews: readonly string[]): string {
  return `integration task ${taskId} is blocked until every required review passes: ${reviews.join(', ')} — finish the reviews or replace failed/cancelled reviews with a current independent passing review. Quality admission does not authorize deployment or release.`
}

function trimmedOptional(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed === '' ? undefined : trimmed
}

function trimmedStringList(value: readonly string[] | null | undefined): string[] | undefined {
  if (value === undefined || value === null) return undefined
  return [...new Set(value.map((item) => item.trim()).filter(Boolean))]
}

function applyOptionalList(
  task: TeamTask,
  key: 'inScope' | 'outOfScope' | 'acceptance' | 'verify' | 'deliverables' | 'nonGoals' | 'sourceFindingIds' | 'coverageOf',
  value: readonly string[] | null | undefined,
): void {
  if (value === undefined) return
  const normalized = trimmedStringList(value)
  if (normalized === undefined || normalized.length === 0) delete task[key]
  else task[key] = normalized
}

function applyOptionalString(
  task: TeamTask,
  key: 'description' | 'objective' | 'reviewedTaskId' | 'sourceTaskId',
  value: string | null | undefined,
): void {
  if (value === undefined) return
  const normalized = trimmedOptional(value)
  if (normalized === undefined) delete task[key]
  else task[key] = normalized
}

function stagedTaskValidationError(team: TeamState, task: TeamTask): string | undefined {
  // Contract validation should retain dependency/review references while the
  // staged graph's separate pass owns cross-task write-scope serialization.
  const otherTasks = team.tasks
    .filter((candidate) => candidate !== task)
    .map((candidate) => (
      taskKindOf(candidate) === 'implementation' || taskKindOf(candidate) === 'repair'
        ? { ...candidate, kind: 'work' as const }
        : candidate
    ))
  const gate = validateCreateTask({ ...team, tasks: otherTasks }, {
    subject: task.subject,
    description: task.description,
    dependencies: task.dependencies,
    assignee: task.assignee,
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
  })
  return gate.ok ? undefined : gate.error ?? `task "${task.id}" has an invalid contract`
}

/**
 * Resolve one member's selected tool policy into the persisted policy id and
 * the immutable effective filter (#59).
 *
 * An unknown id fails here — before the member is written and before any child
 * is created — so a typo can never persist a half-configured member or leave a
 * resumable orphan behind. A member without a policy resolves to `{}`: the
 * previous behavior and record shape stay untouched.
 * @param config - resolved plugin config (declared policies + depth cap).
 * @param captain - the live captain, whose registry view names the host tools.
 * @param policyId - the selected policy id, or undefined for no policy.
 * @returns the member fields to persist (`toolPolicy` + `toolFilter`), or `{}`.
 */
function memberToolSelection(
  config: ToolsConfig,
  captain: Agent,
  policyId: string | undefined,
): Pick<TeamMember, 'toolPolicy' | 'toolFilter'> {
  if (policyId === undefined) return {}
  const policy = requireToolPolicy(config.toolPolicies, policyId)
  return {
    toolPolicy: policyId,
    toolFilter: resolveMemberToolFilter(policy, {
      maxDepth: config.memberMaxDepth,
      knownTools: restrictableToolNames(captain),
    }),
  }
}

/**
 * Deny names the lenient spawn retry may drop for one member.
 *
 * A member without a policy keeps the built-in #163/#164 recovery path. A
 * policy member may only relax built-in entries the owner did not declare
 * itself (`memberSpawnRelaxableDeny`), and a selected policy id this
 * deployment no longer declares relaxes nothing: the member then fails loud
 * instead of spawning under a different filter.
 * @param config - resolved plugin config.
 * @param member - the member being spawned.
 * @returns the relaxable deny names, or undefined for the legacy default.
 */
function memberRelaxableDeny(config: ToolsConfig, member: TeamMember): readonly string[] | undefined {
  if (member.toolPolicy === undefined) return undefined
  return memberSpawnRelaxableDeny(optionalToolPolicy(config.toolPolicies, member.toolPolicy), true)
}

/** Validate references and cycles before a staged graph can be saved or run. */
function validateStagedGraph(team: TeamState, requireRunnable: boolean): void {
  const members = team.members.filter((member) => member.status !== 'removed')
  if (requireRunnable && members.length === 0) throw new Error('add at least one member before approving the plan')
  if (requireRunnable && team.tasks.length === 0) throw new Error('add at least one task before approving the plan')
  const memberNames = new Set(members.map((member) => member.name))
  const taskIds = new Set(team.tasks.map((task) => task.id))
  for (const task of team.tasks) {
    if (task.subject.trim() === '') throw new Error(`task "${task.id}" must have a subject`)
    if (task.assignee !== undefined && task.assignee !== CAPTAIN_KEY && !memberNames.has(task.assignee)) {
      throw new Error(`task "${task.id}" assignee "${task.assignee}" is not an active member`)
    }
    for (const dependency of task.dependencies) {
      if (dependency === task.id) throw new Error(`task "${task.id}" cannot depend on itself`)
      if (!taskIds.has(dependency)) throw new Error(`task "${task.id}" depends on unknown task "${dependency}"`)
    }
    if (requireRunnable || task.kind !== 'work') {
      const contractError = stagedTaskValidationError(team, task)
      if (contractError !== undefined) throw new Error(`task "${task.id}" contract is invalid: ${contractError}`)
    }
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byId = new Map(team.tasks.map((task) => [task.id, task]))
  const visit = (taskId: string): void => {
    if (visiting.has(taskId)) throw new Error(`task dependency graph contains a cycle at "${taskId}"`)
    if (visited.has(taskId)) return
    visiting.add(taskId)
    for (const dependency of byId.get(taskId)?.dependencies ?? []) visit(dependency)
    visiting.delete(taskId)
    visited.add(taskId)
  }
  for (const task of team.tasks) visit(task.id)
}

function memberOpenTask(team: TeamState, memberName: string, exceptTaskId?: string): TeamTask | undefined {
  return team.tasks.find(task => task.id !== exceptTaskId
    && task.assignee === memberName
    && (task.status === 'claimed' || task.status === 'in_progress'))
}

/** A temporary route is a current-turn exception, never a durable work queue. */
function requireTemporaryMemberAdmission(team: TeamState, assignee: string | undefined, captain: Agent): void {
  if (assignee === undefined || assignee === CAPTAIN_KEY) return
  const member = requireMember(team, assignee)
  if (member.temporaryAdmission === true && !hasCurrentTurnTemporaryAuthorization(captain)) {
    throw new Error(`member "${member.name}" uses a temporary route; authorize this turn with /agent-teams --temporary <goal> before assigning new work`)
  }
}

/** Captain work is immediate, not a durable scheduler lane: allow one unfinished takeover at a time. */
function captainOpenTask(team: TeamState, exceptTaskId?: string): TeamTask | undefined {
  return team.tasks.find(task => task.id !== exceptTaskId
    && task.assignee === CAPTAIN_KEY
    && (task.status === 'claimed' || task.status === 'in_progress' || task.reassigning === true))
}

async function waitForMemberIdle(ctx: Context, member: TeamMember, signal: AbortSignal): Promise<void> {
  if (member.id === '') return
  const live = ctx.agents.get(member.id as SessionId)
  if (live === undefined) return
  if (signal.aborted) throw signal.reason
  let onAbort!: () => void
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason ?? new Error('task reassignment was cancelled'))
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    await Promise.race([live.whenIdle(), aborted])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

/** Stop every currently-resident member activation for one halted team.
 *
 * Interrupt requests only cancel the member's current model turn and retain its
 * activation. Draining the selected direct children is the stronger lifecycle
 * boundary: it waits for the activation handles to release, so a child cannot
 * keep executing after the captain-chat Stop control has reported success.
 */
/**
 * The live Agent the host admits member operations from.
 *
 * Harness continuable delivery is authorized against the member's durable
 * direct parent (`subagents.authorizeLineage`), which is the session that
 * spawned it — the team's recorded captain. A captain acting from its own fork
 * therefore commands members *through* that session:
 *
 * - while the recorded captain is resident, its Agent is used directly;
 * - while it is cold, this resolves it through the public session controller
 *   (`workspaceRegistry.create` + `sessionController.create` with the existing
 *   session id — attach/resume only: no prompt, no model request, and the
 *   durable `captainSessionId` is never rewritten);
 * - when the composition exposes neither service, or the resume fails, the
 *   operation fails with an explicit bounded error instead of migrating team
 *   ownership to a session the host would reject at delivery time.
 *
 * @param ctx - the plugin context (injects `agents`).
 * @param team - current team state.
 * @param caller - the captain-side session performing the operation.
 * @returns the caller itself, or the live recorded captain session.
 */
async function memberOperationParent(ctx: Context, team: TeamState, caller: Agent): Promise<Agent> {
  if (caller.id === team.captainSessionId) return caller
  const resident = ctx.agents.get(team.captainSessionId as SessionId)
  if (resident !== undefined) return resident
  const resumed = await resumeLeadAnchor(ctx, team, caller)
  if (resumed !== undefined) return resumed
  throw new Error(`member operations require the live captain session ${team.captainSessionId} that owns team "${team.name}"; this session is its fork and ${resumeUnavailableReason(ctx, team)}`)
}

/**
 * Best-effort live anchor for scheduler calls: the recorded captain when
 * resident, the resumed one when this composition can attach it, and
 * `undefined` otherwise (the scheduler then keeps its existing
 * registry-only behavior). Never throws, so mutating tools stay usable on
 * compositions without a session controller.
 * @param ctx - the plugin context (injects `agents`).
 * @param team - the team whose recorded captain is the delivery parent.
 * @param caller - the captain-side session performing the operation.
 * @returns the anchor agent when one is live, else undefined.
 */
async function liveLeadAnchorAgent(ctx: Context, team: Pick<TeamState, 'captainSessionId' | 'name'>, caller: Agent): Promise<Agent | undefined> {
  if (caller.id === team.captainSessionId) return caller
  const resident = ctx.agents.get(team.captainSessionId as SessionId)
  if (resident !== undefined) return resident
  return resumeLeadAnchor(ctx, team as TeamState, caller)
}

/** Why the recorded captain could not be resumed, for one bounded error message. */
function resumeUnavailableReason(ctx: Context, team: TeamState): string {
  const services = optionalTeamServices(ctx)
  if (services.controller === undefined || services.registry === undefined) {
    return 'this composition exposes no session controller to resume it, so add_member, member delivery and member drain are unavailable from the fork'
  }
  return `resuming it through the session controller failed (its workspace is "${team.name}"'s workspace)`
}

/** Public optional services used only to attach the recorded captain session. */
function optionalTeamServices(ctx: Context): {
  controller?: { create?: (request: { sessionId: string; workspaceId: string; agentPreset?: string }) => Promise<unknown> }
  registry?: { create?: (path: string, title?: string) => Promise<{ id: string }> }
} {
  const get = (ctx as unknown as { get?: (name: string) => unknown }).get
  if (typeof get !== 'function') return {}
  const read = (name: string): unknown => {
    try { return get.call(ctx, name) } catch { return undefined }
  }
  return {
    controller: read('sessionController') as { create?: (request: { sessionId: string; workspaceId: string; agentPreset?: string }) => Promise<unknown> } | undefined,
    registry: read('workspaceRegistry') as { create?: (path: string, title?: string) => Promise<{ id: string }> } | undefined,
  }
}

/**
 * Attach the team's recorded captain session in this process without sending a
 * prompt: the Harness controller's create-with-existing-id path resumes the
 * session and leaves every durable field (including `captainSessionId`)
 * untouched.
 * @returns the resumed Agent, or undefined when this composition cannot resume it.
 */
async function resumeLeadAnchor(ctx: Context, team: TeamState, caller: Agent): Promise<Agent | undefined> {
  const { controller, registry } = optionalTeamServices(ctx)
  if (controller?.create === undefined || registry?.create === undefined) return undefined
  const cwd = caller.session.header.cwd ?? process.cwd()
  try {
    const workspace = await registry.create(cwd, cwd)
    await controller.create({ sessionId: team.captainSessionId, workspaceId: workspace.id })
    return ctx.agents.get(team.captainSessionId as SessionId)
  } catch (error: unknown) {
    ctx.logger.warn(`agent-teams: could not resume the recorded captain session ${team.captainSessionId}: ${String(error)}`)
    return undefined
  }
}

async function stopTeamMemberActivations(
  ctx: Context,
  captain: Agent,
  members: readonly TeamMember[],
  signal?: AbortSignal,
): Promise<void> {
  // Removed is a durable authorization state, not proof that the host has
  // released the continuable activation. Include it so a failed archive can
  // be retried without leaving an already-revoked child running.
  const activeMembers = members.filter((member) => member.id !== '')
  const memberIds = activeMembers.map((member) => member.id as SessionId)
  if (memberIds.length === 0) return

  const gateway = agentTeamsSubagentGateway(ctx)
  // Keep interrupt and the stronger drain boundary in one per-child lock.
  // A message already in the child lock finishes first; queued work cannot
  // slip between interrupt and drain for the same child.
  const fallbackSignal = signal ?? new AbortController().signal
  try {
    await gateway.interruptAndDrain(captain, memberIds, async () => {
      // Pre-RC.1 hosts do not expose a drain operation. The gateway already
      // owns every child lock here, so wait directly without reacquiring it.
      const results = await Promise.allSettled(activeMembers.map((member) => (
        waitForMemberIdle(ctx, member, fallbackSignal)
      )))
      const failed = results.find((result) => result.status === 'rejected')
      if (failed?.status === 'rejected') throw failed.reason
    })
  } catch (error: unknown) {
    // Do not claim the browser action stopped work when the runtime could not
    // release all selected child activations. The HTTP route surfaces this
    // failure instead of returning a false successful stop.
    ctx.logger.warn(`agent-teams: failed to drain halted members: ${String(error)}`)
    throw error
  }
}

export async function haltTeamWork(input: {
  ctx: Context
  stateRoot: string
  teamId: string
  captain: Agent
  signal?: AbortSignal
}): Promise<{ teamName: string; captainSessionId: string; cancelledTasks: number; alreadyHalted: boolean }> {
  const captainId = durableSessionId(input.captain)
  const halted = await withTeamLock(teamLockKey(input.stateRoot, input.teamId), async () => {
    const fresh = await requireFreshCaptainTeam(input.ctx, input.stateRoot, input.teamId, captainId)
    if (fresh.halted === true) {
      return {
        teamName: fresh.name,
        captainSessionId: fresh.captainSessionId,
        cancelledTasks: fresh.tasks.filter((task) => task.status === 'cancelled').length,
        alreadyHalted: true,
        members: fresh.members.filter((member) => member.id !== '' && member.status !== 'removed').map((member) => ({ ...member })),
      }
    }
    const now = Date.now()
    let cancelledTasks = 0
    for (const task of fresh.tasks) {
      if (TERMINAL_TASK_STATUSES.includes(task.status)) continue
      cancelUnfinishedTask(task, 'Stopped from the captain chat.')
      cancelledTasks += 1
    }
    for (const member of fresh.members) {
      if (member.status === 'removed') continue
      member.status = 'idle'
    }
    fresh.halted = true
    fresh.haltedAt = now
    await writeTeam(input.stateRoot, fresh)
    appendTeamEvent(input.ctx, captainSessionOf(input.ctx, fresh.captainSessionId, input.captain.session), 'agent-teams/team-halted', {
      teamId: fresh.id,
      cancelledTasks,
    })
    return {
      teamName: fresh.name,
      captainSessionId: fresh.captainSessionId,
      cancelledTasks,
      alreadyHalted: false,
      members: fresh.members.filter((member) => member.id !== '' && member.status !== 'removed').map((member) => ({ ...member })),
    }
  })
  // Persist the stop boundary first, then abort the Captain before draining
  // children. Otherwise its current model turn can observe `halted`, call
  // resume, and race the still-running HTTP stop request.
  input.captain.cancel({ kind: 'user' }, { keepInbox: true })
  // Members are children of the recorded captain session, so the parent-bound
  // drain must run as that session when a fork requested the stop.
  const haltAnchor = input.captain.id === halted.captainSessionId
    ? input.captain
    : input.ctx.agents.get(halted.captainSessionId as SessionId)
  if (haltAnchor !== input.captain) haltAnchor?.cancel({ kind: 'user' }, { keepInbox: true })
  try {
    if (haltAnchor === undefined) {
      input.ctx.logger.warn(`agent-teams: captain session ${halted.captainSessionId} is not live; member activations of "${halted.teamName}" were not drained from this session`)
    } else {
      await stopTeamMemberActivations(input.ctx, haltAnchor, halted.members, input.signal)
    }
  } finally {
    // Child settlement can start another anchor turn, including on a failed
    // drain. Close both execution boundaries without awaiting the caller's own
    // tool turn, or removing queued user input and persistent mailbox entries.
    input.captain.cancel({ kind: 'user' }, { keepInbox: true })
    if (haltAnchor !== input.captain) haltAnchor?.cancel({ kind: 'user' }, { keepInbox: true })
  }
  return {
    teamName: halted.teamName,
    captainSessionId: halted.captainSessionId,
    cancelledTasks: halted.cancelledTasks,
    alreadyHalted: halted.alreadyHalted,
  }
}

/** Stable control context delivered when the Web plan approval commits. */
export function stagedPlanApprovedContext(teamName: string): string {
  return [
    `The user approved the staged AgentTeams plan "${teamName}" from the pre-run review UI.`,
    'Approval has committed; the scheduler owns dispatch of the approved team. Do not approve again, recreate the roster, or send messages merely to start assigned tasks.',
    'Acknowledge the approval and handle any reports or user work already pending. Yield when waiting for members is the remaining action; their reports will wake you automatically.',
  ].join('\n')
}

/** Wake a captain after a browser approval without changing durable state. */
export function notifyStagedPlanApproved(captain: Pick<Agent, 'steer'>, teamName: string): boolean {
  try {
    captain.steer(createUserMessage({
      content: [{ type: 'text', text: stagedPlanApprovedContext(teamName) }],
      source: agentTeamsSource({ kind: 'agent-teams' }),
    }))
    return true
  } catch {
    return false
  }
}

/** Context queued after the human rejects a staged plan. */
export function stagedPlanDiscardContext(teamName: string): string {
  return [
    `The user discarded the staged AgentTeams plan "${teamName}" from the pre-run review UI.`,
    'That decision is final for this draft: it has been archived, no members were created, and no tasks may run.',
    'Do not call agent_teams_create, agent_teams_approve, or recreate a replacement team merely because the old team is no longer active.',
    'Wait for a later explicit user request. If the next user message is unrelated to AgentTeams, answer it normally and do not start a team.',
  ].join('\n')
}

/** Model-facing continuation that turns the review UI back into a conversation. */
export function stagedPlanFeedbackContext(teamName: string): string {
  return [
    `The user selected "Return to chat and revise" for the staged AgentTeams plan "${teamName}".`,
    'The existing staged plan is still the only draft. Do not create a replacement team, approve it, spawn members, edit the plan, or start work in this turn.',
    'Ask the user one concise, concrete question about what they want changed, then stop and wait for their answer.',
    'After the user answers, revise this same staged roster and DAG with one atomic agent_teams_edit_plan call, summarize the changes, and ask the user to review the updated plan again.',
  ].join('\n')
}

/**
 * Register every `agent_teams_*` tool into the shared tools registry.
 * @param ctx - the plugin context (injects `tools`).
 * @param config - resolved tool config.
 */
export function registerAgentTeamsTools(ctx: Context, config: ToolsConfig): AgentTeamsRuntime {
  installInactiveTeamPollingGuard(ctx, config)
  installAttemptEvidence(ctx, config.stateDir)
  installRetiredMemberGuard(ctx, config.stateDir)
  installMemberDelegationGuard(ctx, config.stateDir, config.memberMaxDepth ?? 0)
  installMailboxAdmission(ctx, config.stateDir)
  const scheduler = installTeamScheduler(ctx, { stateDir: config.stateDir, executionPrompt: config.executionPrompt, dispatch: dispatchMember })
  const auditStatePrefix = `${normalizeWorkspacePath(config.stateDir) ?? config.stateDir}/`
  let memberSelections!: ReturnType<typeof installMemberSelectionRuntime>
  const statusFingerprints = new Map<string, string>()
  const maxStatusFingerprints = 256
  const approvalCredentials = createApprovalCredentialStore()

  async function currentCodeVersion(workspace: string): Promise<string> {
    const observed = await observeWorkspace(workspace)
    if (observed.status === 'failed') throw new Error(`quality version observation failed: ${observed.error}`)
    return observed.status === 'not-git' ? 'not-git' : workspaceCodeVersion({ ...observed.snapshot,
      files: new Map([...observed.snapshot.files].filter(([path]) => !path.startsWith(auditStatePrefix))) })
  }

  async function startQualityAttempt(workspace: string, team: TeamState, task: TeamTask): Promise<void> {
    if (['implementation', 'repair'].includes(taskKindOf(task))) {
      task.workspaceAudit = await captureAttemptAudit(workspace, team.id, task, auditStatePrefix)
    }
    if (taskKindOf(task) === 'review') {
      const target = team.tasks.find(item => item.id === task.reviewedTaskId)
      if (!target?.attemptId || target.status !== 'completed') throw new Error(`review ${task.id} requires a completed current target attempt`)
      if (!task.assignee || task.assignee === target.assignee) throw new Error('review must be performed by an independent owner')
      task.reviewBasis = { schemaVersion: 1, reviewedTaskId: target.id, targetAttemptId: target.attemptId,
        targetContract: contractIdentity(target), codeVersion: await currentCodeVersion(workspace), reviewer: task.assignee }
      task.reviewedAttempt = target.attempt
    }
    if (taskKindOf(task) === 'integration') {
      task.reviewCodeVersion = await currentCodeVersion(workspace)
      const blockers = integrationReviewBlockers(team.tasks, task, task.reviewCodeVersion, team.reviewPolicy?.requiredReviewers)
      if (blockers.length) throw new Error(integrationGateError(task.id, blockers))
    }
  }

  async function dispatchMember(captain: Agent, teamId: string, memberName: string, text: string, signal: AbortSignal, mode: 'queue' | 'steer', attemptId?: string): Promise<boolean> {
    const root = stateRootOf(workspaceOf(captain), config)
    // Record why a member never started. The scheduler treats a failed dispatch as
    // "not now" and retries, so without this the captain only ever sees an
    // unexplained `unspawned` member and no diagnostic reaches any surface.
    const recordSpawnError = async (reason: string): Promise<void> => {
      try {
        await withTeamLock(teamLockKey(root, teamId), async () => {
          const fresh = await requireFreshCaptainTeam(ctx, root, teamId, captain.id)
          const failed = fresh.members.find(item => item.name === memberName && item.status !== 'removed')
          if (failed === undefined || failed.id !== '') return
          failed.spawnError = reason
          await writeTeam(root, fresh)
        })
      } catch (error: unknown) {
        ctx.logger.warn(`agent-teams: could not record the member start failure for ${memberName}: ${String(error)}`)
      }
    }
    let orphan: TeamMember | undefined
    try {
      return await withTeamLock(teamLockKey(root, teamId), async () => {
        const team = await readTeam(root, teamId)
        if (team === undefined || !(await sessionLeadsTeamAsync(ctx, team, captain.id)) || team.halted === true || team.phase === 'staged') return false
        const member = team.members.find(item => item.name === memberName && item.status !== 'removed')
        if (member === undefined || member.stopping === true || team.tasks.some(task => task.reassigning === true && task.assignee === memberName)) return false
        if (attemptId !== undefined && !team.tasks.some(task => task.attemptId === attemptId && task.assignee === memberName && (task.status === 'claimed' || task.status === 'in_progress'))) return false
        const parent = await memberOperationParent(ctx, team, captain)
        if (member.id !== '') return deliverToMember(ctx, parent, member.id, text, config.stateDir, signal, mode)
        const selection = await resolveMemberLlmSelection(ctx, captain, {
          provider: member.provider, model: member.model, reasoningMode: member.reasoningMode, reasoningEffort: member.reasoningEffort, fallback: member.fallback,
        }, signal)
        await spawnMember(ctx, memberRuntime(config), memberSelections, selection, parent, team, member, config.stateDir, signal, text, member.toolFilter, memberRelaxableDeny(config, member))
        delete member.spawnError
        orphan = { ...member }
        await writeTeam(root, team)
        orphan = undefined
        return true
      })
    } catch (error: unknown) {
      if (orphan !== undefined) {
        await recordRetiredMemberIds(root, [orphan.id])
        await stopTeamMemberActivations(ctx, captain, [orphan])
      }
      ctx.logger.warn(`agent-teams: member dispatch failed for ${memberName}: ${String(error)}`)
      await recordSpawnError(failureSummary({ code: 'SPAWN_FAILED', message: error instanceof Error ? error.message : String(error) }))
      return false
    }
  }

  const updateStagedPlanBatch: AgentTeamsRuntime['updateStagedPlanBatch'] = async (captain, teamId, mutations, options, signal) => {
    if (options === undefined) throw new Error('staged plan update requires revision-aware options')
    if (mutations.length === 0 && !(options.origin === 'captain' && options.submitForReview)) {
      throw new Error('at least one staged plan operation is required')
    }
    const workspace = workspaceOf(captain)
    const stateRoot = stateRootOf(workspace, config)
    const captainId = durableSessionId(captain)
    return withTeamLock(teamLockKey(stateRoot, teamId), async () => {
      const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captainId)
      requireStagedTeam(fresh)
      if (options.origin === 'web') {
        if (fresh.planReviewState !== 'ready_for_review') {
          throw new Error(`team "${fresh.name}" is not ready for Web plan editing`)
        }
        assertExpectedPlanRevision(fresh, options.expectedPlanRevision)
      } else {
        fresh.planReviewState = 'building'
        delete fresh.planReadyAt
      }
      for (const mutation of mutations) {
        if (mutation.action === 'update_member') {
          const member = requireMember(fresh, mutation.memberName)
          if (options.origin === 'captain') requireTemporaryMemberAdmission(fresh, member.name, captain)
          if (member.id !== '') throw new Error(`staged member "${member.name}" was already spawned`)
          const reasoningMode = mutation.reasoningMode ?? member.reasoningMode ?? (() => { throw new Error(`staged member "${member.name}" is missing reasoningMode`) })()
          const reasoningEffort = mutation.reasoningEffort !== undefined
            ? trimmedOptional(mutation.reasoningEffort)
            : reasoningMode === 'explicit' && member.reasoningMode === 'explicit'
              ? member.reasoningEffort
              : undefined
          const selection = await resolveMemberLlmSelection(ctx, captain, {
            provider: mutation.provider,
            model: mutation.model,
            reasoningMode,
            ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
            fallback: member.fallback,
          }, signal)
          if (member.provider !== selection.provider || member.model !== selection.model
            || member.reasoningMode !== selection.reasoningMode || member.reasoningEffort !== selection.reasoningEffort) {
            member.modelPolicySource = 'explicit'
          }
          member.role = trimmedOptional(mutation.role)
          member.provider = selection.provider
          member.model = selection.model
          member.reasoningMode = selection.reasoningMode
          member.reasoningEffort = selection.reasoningEffort
          member.executionPrompt = trimmedOptional(mutation.executionPrompt)
          // The roster editor replaces route/prompt fields; the tool policy is
          // only touched when the mutation names one, so a plan revision cannot
          // silently widen a member's tool set.
          if (mutation.toolPolicy !== undefined) {
            const selected = memberToolSelection(config, captain, trimmedOptional(mutation.toolPolicy))
            member.toolPolicy = selected.toolPolicy
            member.toolFilter = selected.toolFilter
          }
        } else if (mutation.action === 'update_task') {
          const task = requireTask(fresh, mutation.taskId)
          if (task.status !== 'pending' || (task.attempt ?? 0) !== 0) {
            throw new Error(`task "${task.id}" has already started and cannot be edited`)
          }
          if (mutation.subject !== undefined) {
            const subject = mutation.subject.trim()
            if (subject === '') throw new Error('task subject must not be empty')
            task.subject = subject
          }
          applyOptionalString(task, 'description', mutation.description)
          if (mutation.assignee !== undefined) task.assignee = trimmedOptional(mutation.assignee)
          if (mutation.dependencies !== undefined) task.dependencies = trimmedStringList(mutation.dependencies) ?? []
          if (mutation.kind !== undefined) task.kind = mutation.kind
          if (mutation.round !== undefined) {
            if (mutation.round === null) delete task.round
            else task.round = mutation.round
          }
          applyOptionalString(task, 'objective', mutation.objective)
          applyOptionalList(task, 'inScope', mutation.inScope)
          applyOptionalList(task, 'outOfScope', mutation.outOfScope)
          applyOptionalList(task, 'acceptance', mutation.acceptance)
          applyOptionalList(task, 'verify', mutation.verify)
          applyOptionalList(task, 'deliverables', mutation.deliverables)
          applyOptionalList(task, 'nonGoals', mutation.nonGoals)
          applyOptionalString(task, 'reviewedTaskId', mutation.reviewedTaskId)
          applyOptionalString(task, 'sourceTaskId', mutation.sourceTaskId)
          applyOptionalList(task, 'sourceFindingIds', mutation.sourceFindingIds)
          applyOptionalList(task, 'coverageOf', mutation.coverageOf)
          if (options.origin === 'captain') requireTemporaryMemberAdmission(fresh, task.assignee, captain)
          if (fresh.members.some(member => member.name === task.assignee && member.temporaryAdmission === true)) task.temporaryAdmission = true
          else delete task.temporaryAdmission
          task.updatedAt = Date.now()
        } else if (mutation.action === 'add_task') {
          const subject = mutation.subject.trim()
          if (subject === '') throw new Error('task subject must not be empty')
          fresh.taskSeq += 1
          const now = Date.now()
          const task: TeamTask = {
            id: `t${fresh.taskSeq}`,
            subject,
            status: 'pending',
            dependencies: trimmedStringList(mutation.dependencies) ?? [],
            revision: 1,
            attempt: 0,
            kind: mutation.kind ?? 'work',
            createdAt: now,
            updatedAt: now,
          }
          applyOptionalString(task, 'description', mutation.description)
          if (mutation.assignee !== undefined) task.assignee = trimmedOptional(mutation.assignee)
          if (mutation.round !== undefined && mutation.round !== null) task.round = mutation.round
          applyOptionalString(task, 'objective', mutation.objective)
          applyOptionalList(task, 'inScope', mutation.inScope)
          applyOptionalList(task, 'outOfScope', mutation.outOfScope)
          applyOptionalList(task, 'acceptance', mutation.acceptance)
          applyOptionalList(task, 'verify', mutation.verify)
          applyOptionalList(task, 'deliverables', mutation.deliverables)
          applyOptionalList(task, 'nonGoals', mutation.nonGoals)
          applyOptionalString(task, 'reviewedTaskId', mutation.reviewedTaskId)
          applyOptionalString(task, 'sourceTaskId', mutation.sourceTaskId)
          applyOptionalList(task, 'sourceFindingIds', mutation.sourceFindingIds)
          applyOptionalList(task, 'coverageOf', mutation.coverageOf)
          if (options.origin === 'captain') requireTemporaryMemberAdmission(fresh, task.assignee, captain)
          if (fresh.members.some(member => member.name === task.assignee && member.temporaryAdmission === true)) task.temporaryAdmission = true
          fresh.tasks.push(task)
        } else if (mutation.action === 'remove_task') {
          const task = requireTask(fresh, mutation.taskId)
          const dependent = fresh.tasks.find((candidate) => candidate.dependencies.includes(task.id))
          if (dependent !== undefined) {
            throw new Error(`task "${task.id}" is still required by "${dependent.id}"; update that dependency before removing the task`)
          }
          fresh.tasks = fresh.tasks.filter((candidate) => candidate.id !== task.id)
        } else {
          const member = requireMember(fresh, mutation.memberName)
          if (member.id !== '') throw new Error(`staged member "${member.name}" was already spawned`)
          const owned = fresh.tasks.filter((task) => task.assignee === member.name)
          if (owned.length > 0) {
            throw new Error(`member "${member.name}" still owns planned tasks: ${owned.map((task) => task.id).join(', ')}; update or remove those tasks first`)
          }
          fresh.members = fresh.members.filter((candidate) => candidate !== member)
        }
      }
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
      return writeTeam(stateRoot, fresh)
    })
  }

  const updateStagedPlan: AgentTeamsRuntime['updateStagedPlan'] = async (captain, teamId, mutation, options, signal) => (
    updateStagedPlanBatch(captain, teamId, [mutation], options, signal)
  )

  const prepareWebApproval: AgentTeamsRuntime['prepareWebApproval'] = async (captain, teamId, expectedPlanRevision) => {
    const workspace = workspaceOf(captain)
    const stateRoot = stateRootOf(workspace, config)
    const captainId = durableSessionId(captain)
    return withTeamLock(teamLockKey(stateRoot, teamId), async () => {
      const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captainId)
      requireStagedTeam(fresh)
      if (fresh.planReviewState !== 'ready_for_review') {
        throw new Error(`team "${fresh.name}" is not ready for approval`)
      }
      assertExpectedPlanRevision(fresh, expectedPlanRevision)
      validateStagedGraph(fresh, true)
      return approvalCredentials.prepare({
        workspace,
        captainSessionId: captainId,
        teamId: fresh.id,
        planRevision: fresh.planRevision,
      })
    })
  }

  const approveStagedTeam: AgentTeamsRuntime['approveStagedTeam'] = async (captain, teamId, evidence, signal) => {
    if (evidence === undefined) throw new Error('trusted approval evidence is required')
    const workspace = workspaceOf(captain)
    const stateRoot = stateRootOf(workspace, config)
    const runSignal = signal ?? new AbortController().signal
    const captainId = durableSessionId(captain)
    const spawned: TeamMember[] = []
    let admittedParent: Agent | undefined
    const approved = await withTeamLock(teamLockKey(stateRoot, teamId), async () => {
      const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captain.id)
      requireStagedTeam(fresh)
      if (fresh.planReviewState !== 'ready_for_review') {
        throw new Error(`team "${fresh.name}" is not ready for approval`)
      }
      assertExpectedPlanRevision(fresh, evidence.expectedPlanRevision)
      const receipt = evidence.source === 'web'
        ? approvalCredentials.consume({
            workspace,
            captainSessionId: captainId,
            teamId: fresh.id,
            planRevision: fresh.planRevision,
            token: evidence.token,
          })
        : undefined
      // A staged removal has no child session to retain in history. Drop those
      // placeholders before transitioning to the stricter running shape.
      fresh.members = fresh.members.filter((member) => member.status !== 'removed')
      validateStagedGraph(fresh, true)
      try {
        const selections = new Map<TeamMember, Awaited<ReturnType<typeof resolveMemberLlmSelection>>>()
        for (const member of fresh.members) {
          if (member.id !== '') continue
          const selection = await resolveMemberLlmSelection(ctx, captain, {
            provider: member.provider,
            model: member.model,
            reasoningMode: member.reasoningMode ?? (() => { throw new Error(`staged member "${member.name}" is missing reasoningMode`) })(),
            ...member.reasoningMode === 'explicit' && member.reasoningEffort !== undefined
              ? { reasoningEffort: member.reasoningEffort }
              : {},
            fallback: member.fallback,
          }, runSignal)
          selections.set(member, selection)
          member.provider = selection.provider
          member.model = selection.model
          member.reasoningMode = selection.reasoningMode
          member.reasoningEffort = selection.reasoningEffort
        }
        // This is the approval commit barrier: resolve and validate the whole
        // final roster before spawning even the first durable child.
        await validateMemberLlmSelections(ctx, [...selections.values()], runSignal)
        const parent = await memberOperationParent(ctx, fresh, captain)
        admittedParent = parent
        for (const [member, selection] of selections) {
          await spawnMember(
            ctx,
            memberRuntime(config),
            memberSelections,
            selection,
            parent,
            fresh,
            member,
            config.stateDir,
            runSignal,
            undefined,
            member.toolFilter,
            memberRelaxableDeny(config, member),
          )
          spawned.push(member)
        }
        if (fresh.members.some((member) => member.id === '')) {
          throw new Error('one or more staged members could not be spawned')
        }
        fresh.phase = 'running'
        delete fresh.planReviewState
        fresh.approvedAt = Date.now()
        fresh.approvedPlanRevision = fresh.planRevision
        fresh.approvalSource = evidence.source
        const approvalEvidenceId = evidence.source === 'web'
          ? `web:receipt:${receipt?.receiptId ?? ''}`
          : evidence.evidenceId
        fresh.approvalEvidenceId = approvalEvidenceId
        const persisted = await writeTeam(stateRoot, fresh)
        return {
          teamId: persisted.id,
          members: persisted.members.length,
          tasks: persisted.tasks.length,
          planRevision: persisted.planRevision,
          approvalSource: evidence.source,
          approvalEvidenceId,
        }
      } catch (error: unknown) {
        const gateway = agentTeamsSubagentGateway(ctx)
        await Promise.all(spawned.map(async (member) => {
          if (member.id === '') return
          await gateway.retireAndInterrupt(admittedParent!, member.id as SessionId, () => (
            recordRetiredMemberIds(stateRoot, [member.id]).catch(() => undefined)
          ))
        }))
        throw error
      }
    }).catch(async (error: unknown) => {
      // Child settlement reads Team state. Drain only after releasing its lock,
      // and under the same original parent admitted for the partial spawn.
      if (admittedParent !== undefined && spawned.length > 0) {
        await stopTeamMemberActivations(ctx, admittedParent, spawned, runSignal)
      }
      throw error
    })
    try {
      captain.inject(createUserMessage({
        content: [{
          type: 'text',
          text: `AgentTeams approval committed: team=${approved.teamId}; source=${approved.approvalSource}; planRevision=${approved.planRevision}; evidence=${approved.approvalEvidenceId}.`,
        }],
        source: agentTeamsSource({ kind: 'agent-teams' }),
      }))
    } catch {
      ctx.logger.warn(`agent-teams: post-approval context injection failed for "${teamId}"; the running Team remains committed`)
    }
    try {
      await scheduler.kickTeam(workspace, teamId, admittedParent)
    } catch {
      // Approval is already durably committed. A transient wake-up failure is
      // recoverable by the next status/member lifecycle kick and must not make
      // the UI report that an already-running team failed to approve.
      ctx.logger.warn(`agent-teams: post-approval kick failed for "${teamId}"; recovery remains available`)
    }
    return approved
  }

  const continueStagedPlanning: AgentTeamsRuntime['continueStagedPlanning'] = async (captain, teamId) => {
    const workspace = workspaceOf(captain)
    const stateRoot = stateRootOf(workspace, config)
    const captainId = durableSessionId(captain)
    const prepared = await withTeamLock(teamLockKey(stateRoot, teamId), async () => {
      const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captain.id)
      requireStagedTeam(fresh)
      if (fresh.planReviewState === 'awaiting_feedback') {
        return { teamName: fresh.name, alreadyWaiting: true }
      }
      if (fresh.planReviewState !== 'ready_for_review') {
        throw new Error(`team "${fresh.name}" is not ready for feedback`)
      }
      fresh.planReviewState = 'awaiting_feedback'
      await writeTeam(stateRoot, fresh)
      return { teamName: fresh.name, alreadyWaiting: false }
    })
    if (prepared.alreadyWaiting) return { teamId, alreadyWaiting: true }

    // End any planning turn that is still producing tool calls. A plugin
    // follow-up submitted after cancellation is queued as the next turn by the
    // Harness Agent contract, so it cannot race ahead and recreate the team.
    captain.cancel({ kind: 'user' }, { keepInbox: true })
    try {
      captain.followup(createUserMessage({
        content: [{ type: 'text', text: stagedPlanFeedbackContext(prepared.teamName) }],
        source: agentTeamsSource({ kind: 'agent-teams' }),
      }))
    } catch (error: unknown) {
      // Do not leave the durable UI in a false waiting state when the live
      // Captain disappeared between lookup and delivery.
      await withTeamLock(teamLockKey(stateRoot, teamId), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captain.id)
        requireStagedTeam(fresh)
        if (fresh.planReviewState === 'awaiting_feedback') {
          fresh.planReviewState = 'ready_for_review'
          await writeTeam(stateRoot, fresh)
        }
      })
      throw error
    }
    return { teamId, alreadyWaiting: false }
  }

  const discardStagedTeam: AgentTeamsRuntime['discardStagedTeam'] = async (captain, teamId) => {
    const workspace = workspaceOf(captain)
    const stateRoot = stateRootOf(workspace, config)
    const captainId = durableSessionId(captain)
    const discarded = await withTeamLock(teamLockKey(stateRoot, teamId), async () => {
      const fresh = await requireFreshCaptainTeam(ctx, stateRoot, teamId, captain.id)
      requireStagedTeam(fresh)
      appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/plan-discarded', {
        teamId: fresh.id,
      })
      // A staged plan owns no child sessions. Archiving releases the captain
      // immediately while retaining the rejected graph for later inspection.
      await archiveTeamDir(stateRoot, fresh.id)
      return { teamId: fresh.id, teamName: fresh.name }
    })
    // Preserve this control fact for the next genuine user turn, then abort the
    // still-running Captain turn. Without both operations a late model step can
    // observe the missing active team and incorrectly create it again.
    try {
      captain.inject(createUserMessage({
        content: [{ type: 'text', text: stagedPlanDiscardContext(discarded.teamName) }],
        source: agentTeamsSource({ kind: 'agent-teams' }),
      }))
    } catch (error: unknown) {
      // The archive is already authoritative. Cancellation still prevents a
      // late step from recreating work; failure to park extra context is only a
      // live-delivery warning and must not turn a successful discard into 409.
      ctx.logger.warn(`agent-teams: failed to inject discard context for "${discarded.teamId}": ${String(error)}`)
    }
    captain.cancel({ kind: 'user' }, { keepInbox: true })
    return { teamId: discarded.teamId }
  }

  const runtime: AgentTeamsRuntime = {
    delegateSubagent: createSubagentCompatibility(ctx, config),
    updateStagedPlan,
    updateStagedPlanBatch,
    prepareWebApproval,
    approveStagedTeam,
    continueStagedPlanning,
    discardStagedTeam,
  }

  const configuredProfileNames = listConfiguredProfiles(config.profiles).map((entry) => entry.name)
  const profileDescription = configuredProfileNames.length === 0
    ? 'No Profiles were configured at startup. A newly saved Profile may be selected by its exact name; otherwise omit this optional property.'
    : `Optional exact configured Profile name. Profiles available at startup: ${configuredProfileNames.join(', ')}. Newly saved Profiles may also be selected by their exact name. Omit this property when no configured Profile is requested.`

  ctx.tools.register(defineTool({
    name: 'agent_teams_create',
    description: 'Create a team from the trusted saved defaultProfile or a current direct-user /agent-teams --profile command. Without a binding, ask the user to save/select one; model profile/plan arguments do not authorize it. Default to approval=automatic; omit name to generate it and create captain-planned tasks yourself. Use approval=required only when the user explicitly asks to review the plan before startup. Seed profiles expand template tasks. Authorized temporary calls use subagent, not direct ad-hoc create.',
    parameters: {
      name: { type: 'string', description: 'Optional Team name. Omit it to generate a privacy-safe name from the description.' },
      description: { type: 'string', description: 'Team purpose / the goal the team will work on.' },
      profile: { type: 'string', description: profileDescription },
      plan: {
        type: 'object', additionalProperties: false,
        description: 'Reserved for internal temporary compatibility, not direct model creation. Ordinary creation uses the trusted Profile and rejects inline roster/DAG replacement. Current direct-user temporary authorization permits subagent, not this property. Use create_task for quality-gated work.',
        properties: {
          members: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            name: { type: 'string', required: true }, role: { type: 'string' }, provider: { type: 'string' }, model: { type: 'string' },
            reasoning_mode: { type: 'string', enum: ['target-default', 'route-aware', 'explicit'] }, reasoning_effort: { type: 'string' },
            tool_policy: { type: 'string', description: 'Optional owner-declared tool-policy id.' },
          } } },
          tasks: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
            id: { type: 'string', required: true }, subject: { type: 'string', required: true }, description: { type: 'string' }, assignee: { type: 'string' },
            dependencies: { type: 'array', items: { type: 'string' } },
          } } },
        },
      },
      approval: {
        type: 'string',
        enum: ['required', 'automatic'],
        description: 'required stages the plan for explicit user review; automatic starts immediately. Defaults to automatic for API compatibility.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          team_id: { type: 'string', required: true },
          team_name: { type: 'string', required: true },
          captain_session_id: { type: 'string', required: true },
          state_dir: { type: 'string', required: true },
          phase: { type: 'string', required: true },
          profile: { type: 'string' },
          task_planning: { type: 'string' },
          members: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { member_name: { type: 'string', required: true }, member_id: { type: 'string', required: true }, member_role: { type: 'string' }, provider: { type: 'string', required: true }, model: { type: 'string', required: true }, reasoning_effort: { type: 'string' }, tool_policy: { type: 'string' }, status: { type: 'string', required: true } } } },
          tasks: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { task_id: { type: 'string', required: true }, seed_id: { type: 'string', required: true }, subject: { type: 'string', required: true }, status: { type: 'string', required: true }, kind: { type: 'string' }, assignee: { type: 'string' }, dependencies: { type: 'array', items: { type: 'string' }, required: true } } } },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: value.phase === 'staged'
          ? `Team "${value.team_name}" plan created under ${value.state_dir}. It is staged: finish the roster and DAG, then wait for the user to edit and approve it. Do not start or approve it yourself.`
          : `Team "${value.team_name}" created (id ${value.team_id}) under ${value.state_dir}. You are the captain.`,
      }],
      // The conversation card folds this durable result, and the card cannot
      // reproduce the host's key cleaning for every name (issue #203). Publish
      // the canonical identity instead of letting a client re-derive it.
      presentationMeta: (_args, value) => ({
        team_id: value.team_id,
        team_name: value.team_name,
        captain_session_id: value.captain_session_id,
        phase: value.phase,
        ...value.members === undefined ? {} : {
          members: value.members.map(member => ({
            id: member.member_id,
            name: member.member_name,
            role: member.member_role ?? '',
            status: member.status,
          })),
        },
      }),
    },
    async execute(args, exec) {
      const captain = requireCaptain(exec)
      const captainId = durableSessionId(captain)
      const temporaryCreation = isTemporaryToolAdmission(exec.callId)
      const workspace = workspaceOf(captain)
      const stateRoot = stateRootOf(workspace, config)
      const explicitName = trimmedOptional(args.name)
      const staged = args.approval === 'required'
      const normalizedProfileName = args.profile?.trim()
      const requestedProfile = normalizedProfileName === '' ? undefined : normalizedProfileName
      // Capture one operation snapshot before any lock/await.  A settings save
      // may publish a new volatile map while this create waits for a Team lock.
      const profiles = structuredClone(config.profiles)
      const settings = config.settings.get()
      const commandProfile = currentUserProfileCommand(captain, () => profiles)
      const boundProfile = commandProfile ?? settings.defaultProfile
      if (!temporaryCreation && boundProfile === undefined) {
        throw new Error(`ordinary Team creation requires a current direct-user Profile command or saved default Profile. ${PROFILE_RECOVERY_GUIDANCE} 不要通过反复查询状态等待团队自行出现。`)
      }
      if (!temporaryCreation && boundProfile !== undefined && requestedProfile !== undefined && requestedProfile !== boundProfile) {
        throw new Error(`this Team is bound to Profile "${boundProfile}" by the current user command or saved default`)
      }
      if (!temporaryCreation && boundProfile !== undefined && args.plan !== undefined) {
        throw new Error(`this Team is bound to Profile "${boundProfile}"; inline plans cannot replace it`)
      }
      const profileName = temporaryCreation ? undefined : boundProfile
      if (profileName !== undefined && args.plan !== undefined) throw new Error('choose either a configured profile or an inline plan')
      const inlinePlan: TeamProfileConfig | undefined = args.plan === undefined ? undefined : {
        taskPlanning: 'seed',
        members: args.plan.members.map(member => ({
          name: member.name,
          role: member.role,
          provider: trimmedOptional(member.provider),
          model: trimmedOptional(member.model),
          reasoning_mode: member.reasoning_mode ?? 'target-default',
          reasoning_effort: member.reasoning_effort,
          tool_policy: trimmedOptional(member.tool_policy),
        })),
        tasks: args.plan.tasks.map(task => ({
          id: task.id,
          subject: task.subject,
          description: trimmedOptional(task.description),
          assignee: trimmedOptional(task.assignee),
          dependencies: task.dependencies,
        })),
      }
      const created = await withTeamLock(captainLockKey(stateRoot, captainId), async () => {
        const current = await findTeamByParticipant(stateRoot, captainId, await leadIdentityOfAsync(ctx, captain.session))
        if (current !== undefined) {
          const leads = await sessionLeadsTeamAsync(ctx, current, captain.id)
          const relationship = leads ? 'lead' : 'belong to'
          const guidance = leads
            ? 'Use agent_teams_status and continue the existing team. Do not delete and recreate it merely to continue work. End it only when the user explicitly wants a separate new team.'
            : 'Continue your assigned member work and report to your captain; do not create a separate team.'
          throw new Error(`you already ${relationship} team "${current.name}" (id ${current.id}). ${guidance}`)
        }
        for (let attempt = 0; attempt < 16; attempt += 1) {
          const teamName = explicitName ?? automaticTeamName(args.description, randomBytes(3).toString('hex'))
          const teamId = sanitizeKey(teamName)
          const result = await withTeamLock(teamLockKey(stateRoot, teamId), async () => {
            const existing = await readTeam(stateRoot, teamId)
            if (existing !== undefined) return { collision: true as const }
            if (temporaryCreation) {
              const now = Date.now()
              const state: TeamState = { schemaVersion: AGENT_TEAMS_STATE_SCHEMA_VERSION, name: teamName, id: teamId, description: args.description, captainSessionId: captainId, createdAt: now, members: [], tasks: [], taskSeq: 0, planRevision: 1, phase: 'running', approvedAt: now, approvedPlanRevision: 1, approvalSource: 'automatic', approvalEvidenceId: `automatic:create:${teamId}` }
              await createTeamDir(stateRoot, state)
              return { committed: true as const, state }
            }
            return initializeProfileTeam({
              ctx,
              config,
              memberSelections,
              captain,
              exec,
              stateRoot,
              teamName,
              teamId,
              profileName: profileName ?? 'inline-plan',
              profiles,
              inlinePlan,
              description: args.description,
              staged,
            })
          })
          if (!('collision' in result)) return result
          if (explicitName !== undefined) {
            throw new Error(`team id "${teamId}" is taken by another captain — pick a different team name`)
          }
        }
        throw new Error('could not allocate a unique automatic Team name after 16 attempts')
      })
      if (created.committed) {
        if (created.state.phase === 'running') {
        try {
          await scheduler.kickTeam(workspace, created.state.id, await liveLeadAnchorAgent(ctx, created.state, captain))
        } catch (error: unknown) {
          ctx.logger.warn(`agent-teams: post-create kick failed for "${created.state.id}": ${String(error)}`)
        }
        }
        try {
          appendTeamEvent(ctx, captain.session, 'agent-teams/team-created', {
            teamId: created.state.id,
            captainSessionId: captainId,
            name: created.state.name,
            ...explicitName === undefined ? { generated: true } : {},
            ...created.state.description !== undefined ? { description: created.state.description } : {},
            ...created.state.profile?.name === undefined ? {} : { profile: created.state.profile.name },
          })
          for (const member of created.state.members) {
            appendTeamEvent(ctx, captain.session, 'agent-teams/member-added', {
              teamId: created.state.id,
              memberId: member.id,
              name: member.name,
              ...member.role === undefined ? {} : { role: member.role },
            })
          }
          for (const task of created.state.tasks) {
            appendTeamEvent(ctx, captain.session, 'agent-teams/task-created', {
              teamId: created.state.id,
              taskId: task.id,
              subject: task.subject,
              dependencies: task.dependencies,
              ...task.assignee === undefined ? {} : { assignee: task.assignee },
            })
          }
        } catch (error: unknown) {
          ctx.logger.warn(`agent-teams: post-create events failed for "${created.state.id}": ${String(error)}`)
        }
      }
      const persisted = await readTeam(stateRoot, created.state.id).catch(() => undefined)
      const snapshot = persisted ?? created.state
      if (snapshot.profile === undefined) {
        return {
          team_id: snapshot.id,
          team_name: snapshot.name,
          captain_session_id: snapshot.captainSessionId,
          state_dir: join(stateRoot, snapshot.id),
          phase: snapshot.phase,
        }
      }
      return {
        team_id: snapshot.id,
        team_name: snapshot.name,
        captain_session_id: snapshot.captainSessionId,
        state_dir: join(stateRoot, snapshot.id),
        phase: snapshot.phase,
        profile: snapshot.profile.name,
        task_planning: snapshot.profile.taskPlanning ?? 'seed',
        members: snapshot.members.map((member) => ({
          member_name: member.name,
          member_id: member.id,
          ...member.role === undefined ? {} : { member_role: member.role },
          provider: member.provider ?? '',
          model: member.model ?? '',
          ...member.reasoningEffort === undefined ? {} : { reasoning_effort: member.reasoningEffort },
          ...member.toolPolicy === undefined ? {} : { tool_policy: member.toolPolicy },
          status: member.status,
        })),
        tasks: snapshot.tasks.map((task) => ({
          task_id: task.id,
          seed_id: task.profileSeedId ?? '',
          subject: task.subject,
          status: task.status,
          ...task.kind === undefined ? {} : { kind: task.kind },
          ...task.assignee === undefined ? {} : { assignee: task.assignee },
          dependencies: task.dependencies,
        })),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_edit_plan',
    description: 'Atomically revise the current staged AgentTeams plan without spawning members or scheduling tasks. This tool is only for a plan waiting for approval; never call it after the Team is running. Submit dependent edits in order (update downstream dependencies or assignees, then remove tasks, then remove unused members). Task edits can replace the complete quality contract, including inScope, deliverables, acceptance, and verify. Never inspect or edit .agent-teams state files or plugin source code to revise a plan.',
    parameters: {
      operations: {
        type: 'array',
        required: true,
        description: 'One atomic, ordered batch of staged-plan edits. If any operation is invalid, none of the edits are saved.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: {
              type: 'string',
              required: true,
              enum: ['update_member', 'update_task', 'add_task', 'remove_task', 'remove_member'],
            },
            member_name: { type: 'string', description: 'Member name for update_member or remove_member.' },
            task_id: { type: 'string', description: 'Task id for update_task or remove_task.' },
            subject: { type: 'string', description: 'Required for add_task; optional replacement for update_task.' },
            description: { type: 'string', description: 'Optional task description.' },
            assignee: { type: 'string', description: 'Optional task assignee; an empty string moves it to the shared pool.' },
            dependencies: { type: 'array', items: { type: 'string' }, description: 'Complete replacement dependency list for a task.' },
            kind: { type: 'string', enum: ['work', 'requirements', 'implementation', 'verification', 'review', 'repair', 'integration'], description: 'Optional task kind for add_task or update_task.' },
            round: { type: 'number', description: 'Optional quality-loop round.' },
            objective: { type: 'string', description: 'Optional quality-task objective.' },
            inScope: { type: 'array', items: { type: 'string' }, description: 'Complete replacement write scope. Non-empty for implementation/repair. Workspace-relative POSIX exact files or directories ending in /.' },
            outOfScope: { type: 'array', items: { type: 'string' }, description: 'Complete replacement excluded paths. Exact files or directories ending in /; exclusions override inScope.' },
            acceptance: { type: 'array', items: { type: 'string' }, description: 'Complete replacement acceptance contract.' },
            verify: { type: 'array', items: { type: 'string' }, description: 'Complete replacement verification commands.' },
            deliverables: { type: 'array', items: { type: 'string' }, description: 'Complete replacement deliverable paths. Implementation/repair deliverables must be covered by inScope.' },
            nonGoals: { type: 'array', items: { type: 'string' }, description: 'Complete replacement non-goals.' },
            reviewedTaskId: { type: 'string', description: 'Reviewed task id for review tasks.' },
            sourceTaskId: { type: 'string', description: 'Source task id for repair tasks.' },
            sourceFindingIds: { type: 'array', items: { type: 'string' }, description: 'Finding ids closed by a repair task.' },
            coverageOf: { type: 'array', items: { type: 'string' }, description: 'Goal items covered by the task.' },
            role: { type: 'string', description: 'Optional member role.' },
            provider: { type: 'string', description: 'Optional member provider; defaults to the current staged route.' },
            model: { type: 'string', description: 'Optional member model; defaults to the current staged route.' },
            reasoning_mode: { type: 'string', enum: ['target-default', 'route-aware', 'explicit'], description: 'Optional role reasoning policy; defaults to the member\'s saved policy.' },
            reasoning_effort: { type: 'string', description: 'Optional member reasoning effort.' },
            execution_prompt: { type: 'string', description: 'Optional member-specific execution prompt.' },
            tool_policy: { type: 'string', description: 'Optional owner-declared tool-policy id for this member; an empty string clears it back to the unchanged default tool set.' },
          },
        },
      },
      submit_for_review: { type: 'boolean', description: 'Validate the complete graph and atomically mark it ready for user review.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          team_id: { type: 'string', required: true },
          members: { type: 'number' },
          tasks: { type: 'number' },
          dependencies: { type: 'number' },
          roster: { type: 'array', items: { type: 'string' } },
          graph: { type: 'array', items: { type: 'string' } },
          plan_revision: { type: 'number' },
          review_state: { type: 'string' },
          message: { type: 'string' },
          next_step: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.status === 'already_running'
          ? `${value.message}\n${value.next_step}`
          : `Staged plan updated atomically (${value.members} members, ${value.tasks} tasks, ${value.dependencies} dependencies). No members were spawned and no tasks were scheduled.\n${value.graph?.join('\n') ?? ''}`,
      }],
    },
    async execute(args, exec) {
      const captain = requireCaptain(exec)
      const workspace = workspaceOf(captain)
      const team = await requireCaptainTeam(ctx, workspace, config, captain)
      if (team.phase !== 'staged') {
        return {
          status: 'already_running',
          team_id: team.id,
          message: `Team "${team.name}" is already running; its approved plan is immutable. No changes were made.`,
          next_step: 'Use agent_teams_create_task for additional future work, agent_teams_send_message to guide an active member, agent_teams_reassign_task to change ownership, or agent_teams_status to inspect progress. Do not retry agent_teams_edit_plan for this Team.',
        }
      }
      requireStagedTeam(team)
      if (args.operations.length === 0 && args.submit_for_review !== true) {
        throw new Error('at least one staged plan operation is required')
      }

      const mutations: StagedPlanMutation[] = args.operations.map((operation, index) => {
        const label = `operation ${index + 1} (${operation.action})`
        if (operation.action === 'update_member') {
          const memberName = operation.member_name?.trim() ?? ''
          if (memberName === '') throw new Error(`${label} requires member_name`)
          const member = requireMember(team, memberName)
          const reasoningMode = operation.reasoning_mode ?? member.reasoningMode ?? (() => { throw new Error(`staged member "${member.name}" is missing reasoningMode`) })()
          return {
            action: 'update_member',
            memberName,
            role: operation.role ?? member.role,
            provider: operation.provider?.trim() || member.provider || '',
            model: operation.model?.trim() || member.model || '',
            reasoningMode,
            ...operation.reasoning_effort !== undefined
              ? { reasoningEffort: operation.reasoning_effort }
              : {},
            executionPrompt: operation.execution_prompt ?? member.executionPrompt,
            // Omitted means "keep the current policy": a route/prompt revision
            // must not silently change what the member may do.
            ...operation.tool_policy === undefined ? {} : { toolPolicy: operation.tool_policy },
          }
        }
        if (operation.action === 'update_task') {
          const taskId = operation.task_id?.trim() ?? ''
          if (taskId === '') throw new Error(`${label} requires task_id`)
          const task = requireTask(team, taskId)
          return {
            action: 'update_task',
            taskId,
            subject: operation.subject ?? task.subject,
            description: operation.description ?? task.description,
            assignee: operation.assignee ?? task.assignee,
            dependencies: operation.dependencies ?? task.dependencies,
            kind: operation.kind ?? task.kind,
            round: operation.round ?? task.round,
            objective: operation.objective ?? task.objective,
            inScope: operation.inScope ?? task.inScope,
            outOfScope: operation.outOfScope ?? task.outOfScope,
            acceptance: operation.acceptance ?? task.acceptance,
            verify: operation.verify ?? task.verify,
            deliverables: operation.deliverables ?? task.deliverables,
            nonGoals: operation.nonGoals ?? task.nonGoals,
            reviewedTaskId: operation.reviewedTaskId ?? task.reviewedTaskId,
            sourceTaskId: operation.sourceTaskId ?? task.sourceTaskId,
            sourceFindingIds: operation.sourceFindingIds ?? task.sourceFindingIds,
            coverageOf: operation.coverageOf ?? task.coverageOf,
          }
        }
        if (operation.action === 'add_task') {
          const subject = operation.subject?.trim() ?? ''
          if (subject === '') throw new Error(`${label} requires a non-empty subject`)
          return {
            action: 'add_task',
            subject,
            description: operation.description,
            assignee: operation.assignee,
            dependencies: operation.dependencies ?? [],
            kind: operation.kind,
            round: operation.round,
            objective: operation.objective,
            inScope: operation.inScope,
            outOfScope: operation.outOfScope,
            acceptance: operation.acceptance,
            verify: operation.verify,
            deliverables: operation.deliverables,
            nonGoals: operation.nonGoals,
            reviewedTaskId: operation.reviewedTaskId,
            sourceTaskId: operation.sourceTaskId,
            sourceFindingIds: operation.sourceFindingIds,
            coverageOf: operation.coverageOf,
          }
        }
        if (operation.action === 'remove_task') {
          const taskId = operation.task_id?.trim() ?? ''
          if (taskId === '') throw new Error(`${label} requires task_id`)
          return { action: 'remove_task', taskId }
        }
        const memberName = operation.member_name?.trim() ?? ''
        if (memberName === '') throw new Error(`${label} requires member_name`)
        return { action: 'remove_member', memberName }
      })
      const updated = await updateStagedPlanBatch(captain, team.id, mutations, {
        origin: 'captain',
        submitForReview: args.submit_for_review === true,
      }, exec.signal)
      return {
        status: 'staged',
        team_id: updated.id,
        members: updated.members.length,
        tasks: updated.tasks.length,
        dependencies: updated.tasks.reduce((sum, task) => sum + task.dependencies.length, 0),
        roster: updated.members.map((member) => `${member.name} (${member.role || 'member'}; ${member.provider ?? ''}/${member.model ?? ''})`),
        graph: updated.tasks.map((task) => `${task.id}: ${task.subject} -> ${task.assignee || 'shared'}${task.dependencies.length === 0 ? '' : `; depends on ${task.dependencies.join(', ')}`}`),
        plan_revision: updated.planRevision,
        review_state: updated.planReviewState,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_approve',
    description: 'Approve and start a staged team plan. Call this only after agent_teams_status has confirmed active=true and phase=staged for this captain, and only in response to explicit user approval in a new user turn; generic phrases such as “继续” or “确认” alone do not establish a staged plan. Never call it during the turn that created or edited the plan. The Web Approve & Run button uses the same runtime directly. If no Team exists, return the inactive guidance and do not create or approve anything.',
    parameters: {
      confirmation: { type: 'string', required: true, description: 'The user\'s explicit approval statement.' },
      expected_plan_revision: { type: 'number', required: true, description: 'Exact positive plan revision shown to the user.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          team_id: { type: 'string', required: true },
          members: { type: 'number', required: true },
          tasks: { type: 'number', required: true },
          message: { type: 'string' },
          next_step: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.status !== 'running'
          ? `${value.message}\n${value.next_step}`
          : `Team ${value.team_id} approved and running (${value.members} members, ${value.tasks} tasks).`,
      }],
    },
    async execute(args, exec) {
      if (args.confirmation.trim() === '') throw new Error('explicit user approval text is required')
      const captain = requireCaptain(exec)
      const captainId = durableSessionId(captain)
      const workspace = workspaceOf(captain)
      const team = await findTeamByCaptain(stateRootOf(workspace, config), captainId, await leadIdentityOfAsync(ctx, captain.session))
      if (team === undefined) {
        return {
          status: 'inactive',
          team_id: '',
          members: 0,
          tasks: 0,
          message: 'No staged AgentTeams plan exists for this session; approval was ignored.',
          next_step: 'If the user wants AgentTeams, call agent_teams_create first; otherwise continue normally.',
        }
      }
      if (team.phase !== 'staged' || team.planReviewState !== 'ready_for_review' || team.planReadyAt === undefined) {
        return {
          status: 'not_ready',
          team_id: team.id,
          members: 0,
          tasks: 0,
          message: 'The AgentTeams plan is not ready for approval; no changes were made.',
          next_step: 'Finish the staged roster and graph, then submit it for review before asking for approval.',
        }
      }
      if (!Number.isSafeInteger(args.expected_plan_revision) || args.expected_plan_revision < 1
        || args.expected_plan_revision !== team.planRevision) {
        return {
          status: 'stale_plan',
          team_id: team.id,
          members: 0,
          tasks: 0,
          message: `The requested plan revision is stale; current revision is ${team.planRevision}. No changes were made.`,
          next_step: 'Present the current staged plan and wait for explicit approval of that revision.',
        }
      }
      let trusted
      try {
        const captainSession = captain.session as typeof captain.session & { readonly events?: readonly unknown[] }
        const captainEvents = typeof captainSession.snapshotEvents === 'function'
          ? captainSession.snapshotEvents()
          : captainSession.events ?? []
        trusted = chatApprovalEvidence(captainEvents as unknown as Parameters<typeof chatApprovalEvidence>[0], {
          rootCallId: exec.rootCallId,
          confirmation: args.confirmation,
          planReadyAt: team.planReadyAt,
        })
      } catch {
        return {
          status: 'approval_required',
          team_id: team.id,
          members: 0,
          tasks: 0,
          message: 'Trusted explicit approval evidence was not found; no changes were made.',
          next_step: 'Present the plan and wait for a new direct user message that explicitly approves the AgentTeams plan.',
        }
      }
      try {
        const approved = await approveStagedTeam(captain, team.id, {
          source: 'chat',
          eventSeq: trusted.eventSeq,
          evidenceId: trusted.evidenceId,
          expectedPlanRevision: args.expected_plan_revision,
        }, exec.signal)
        return { status: 'running', team_id: approved.teamId, members: approved.members, tasks: approved.tasks }
      } catch (error: unknown) {
        const message = String(error instanceof Error ? error.message : error)
        if (/stale plan revision/i.test(message)) {
          return {
            status: 'stale_plan',
            team_id: team.id,
            members: 0,
            tasks: 0,
            message: 'The staged plan changed before approval could commit; no running state was written.',
            next_step: 'Read the current plan revision, present it, and wait for explicit approval again.',
          }
        }
        if (/not ready for approval/i.test(message)) {
          return {
            status: 'not_ready',
            team_id: team.id,
            members: 0,
            tasks: 0,
            message: 'The AgentTeams plan is no longer ready for approval; no changes were made.',
            next_step: 'Finish and submit the current staged plan for review.',
          }
        }
        throw error
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_add_member',
    description: 'Add a durable continuable member. Ordinary members require an exact or numbered frozen current-Team role, or role_template naming that exact role for a custom name; role descriptions do not bind roles. Unbound members require current direct-user temporary authorization. Explicit provider/model/reasoning settings win within an admitted role or temporary call; authorized unbound members use saved temporary defaults, or the captain route when none is saved. explicit requires provider/model/reasoning_effort. Staged teams add an editable row without spawning; approval starts it. Running teams start the member immediately.',
    parameters: {
      name: { type: 'string', required: true, description: 'Unique member name inside the team.' },
      role: { type: 'string', description: 'Role of the member (e.g. researcher, engineer, reviewer).' },
      role_template: { type: 'string', description: 'Optional exact name of an active frozen current-Team role member whose model/reasoning/prompt this custom member should inherit. Omit only for exact/numbered role names or currently user-authorized temporary members; never guess a template name.' },
      provider: { type: 'string', description: 'Optional LLM provider route. Use only when the user explicitly requests a different provider; requires model.' },
      model: { type: 'string', description: 'Optional model override within an admitted role or temporary call. Omit to inherit the frozen role or authorized temporary default; without that default an authorized unbound member uses the captain route.' },
      reasoning_mode: { type: 'string', enum: ['target-default', 'route-aware', 'explicit'], description: 'Optional role reasoning policy. Omit to inherit a matched frozen role or authorized temporary default. explicit requires provider/model/reasoning_effort.' },
      reasoning_effort: { type: 'string', description: 'Required with explicit reasoning_mode; otherwise omit.' },
      executionPrompt: { type: 'string', description: 'Optional member-specific execution prompt. Omit to inherit the matching base role prompt. It remains editable while staged.' },
      tool_policy: { type: 'string', description: 'Optional id of a tool policy declared by the deployment owner (config toolPolicies). It restricts which global tools this member sees and may invoke: a policy allow-list also keeps the four coordination tools, and captain-only tools can never be reopened. Omit to inherit the matched role\'s frozen policy; authorized unbound temporary members keep the default tool set.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          member_name: { type: 'string', required: true },
          member_id: { type: 'string', required: true },
          provider: { type: 'string', required: true },
          model: { type: 'string', required: true },
          reasoning_effort: { type: 'string' },
          tool_policy: { type: 'string' },
          status: { type: 'string', required: true },
          phase: { type: 'string', required: true },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: (value.phase === 'staged'
          ? `Member "${value.member_name}" added to the staged roster (${value.provider}/${value.model}); no child was spawned.`
          : `Member "${value.member_name}" added (session ${value.member_id || 'starts with first ready task'}, ${value.provider}/${value.model}${value.reasoning_effort === undefined ? '' : `, reasoning ${value.reasoning_effort}`}, status ${value.status}).`)
          + (value.tool_policy === undefined ? '' : ` Tool policy "${value.tool_policy}" applies to this member.`),
      }],
    },
    async execute(args, exec) {
      const captain = requireCaptain(exec)
      const captainId = durableSessionId(captain)
      const workspace = workspaceOf(captain)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireCaptainTeam(ctx, workspace, config, captain)
      const created = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id)
        const memberName = args.name.trim()
        if (memberName === '') throw new Error('member name must not be empty')
        const memberKey = sanitizeKey(memberName)
        if (memberKey === CAPTAIN_KEY) {
          throw new Error(`member name "${args.name}" is reserved for the captain`)
        }
        if (fresh.members.some((candidate) => sanitizeKey(candidate.name) === memberKey)) {
          throw new Error(`member name "${args.name}" has already been used in team "${fresh.name}"`)
        }
        if (fresh.members.filter((candidate) => candidate.status !== 'removed').length >= config.maxMembers) {
          throw new Error(`team "${fresh.name}" is at its member cap (${config.maxMembers})`)
        }
        // `target-default` is the model-facing default-shaped value: some
        // callers echo it even when they supplied no role policy at all. Keep
        // that payload eligible for numbered-role inheritance. A real route,
        // effort, or non-default reasoning mode remains an explicit override.
        const explicitSelection = trimmedOptional(args.provider) !== undefined
          || trimmedOptional(args.model) !== undefined
          || trimmedOptional(args.reasoning_effort) !== undefined
          || (args.reasoning_mode !== undefined && args.reasoning_mode !== 'target-default')
        let modelPolicySource: MemberPolicySource = explicitSelection ? 'explicit' : 'captain'
        let roleSelection: {
          provider?: string
          model?: string
          reasoningMode: RoleReasoningMode
          reasoningEffort?: string
          fallback?: { provider: string; model: string }
        } = {
          provider: args.provider,
          model: args.model,
          reasoningMode: args.reasoning_mode ?? 'target-default',
          reasoningEffort: args.reasoning_effort,
          fallback: config.fallback,
        }
        const templateMatch = findMemberRoleTemplate({
          memberName,
          role: args.role,
          templateName: args.role_template,
          members: fresh.members.filter((candidate) => candidate.status !== 'removed' && candidate.temporaryAdmission !== true),
        })
        if (args.role_template !== undefined && templateMatch.kind === 'none') {
          throw new Error(`unknown current-Team role_template "${args.role_template}"; use an exact active member name or omit role_template for an independent custom member`)
        }
        if (templateMatch.kind === 'none' && !isTemporaryToolAdmission(exec.callId) && !hasCurrentTurnTemporaryAuthorization(captain)) {
          throw new Error('new members must bind an exact current-Team role_template or numbered role; temporary custom members require /agent-teams --temporary <goal> in this turn')
        }
        // Role responsibilities are independent of the model route, so a
        // matched base role also seeds the prompt when the route is explicit.
        const inheritedExecutionPrompt = templateMatch.kind === 'matched' ? templateMatch.template.executionPrompt : undefined
        if (!explicitSelection) {
          if (templateMatch.kind === 'ambiguous') {
            const names = templateMatch.templates.map((template) => template.name).join(', ')
            throw new Error(`member name "${memberName}" matches multiple role templates (${names}); provide an explicit provider, model, and reasoning policy`)
          }
          if (templateMatch.kind === 'matched') {
            modelPolicySource = 'role-template'
            const template = templateMatch.template
            roleSelection = {
              provider: template.provider,
              model: template.model,
              reasoningMode: template.reasoningMode,
              // Only explicit effort is a policy input. A materialized effort
              // on target-default/route-aware is intentionally not promoted.
              reasoningEffort: template.reasoningMode === 'explicit' ? template.reasoningEffort : undefined,
              fallback: template.fallback ?? config.fallback,
            }
          } else {
            const temporaryPolicy = config.settings?.get().temporaryMember
            if (temporaryPolicy !== undefined) {
              roleSelection = { ...temporaryPolicy, fallback: config.fallback }
              modelPolicySource = 'temporary'
            }
          }
        }
        const selection = await resolveMemberLlmSelection(ctx, captain, roleSelection, exec.signal)
        await validateMemberLlmSelections(ctx, [selection], exec.signal)
        const toolPolicy = trimmedOptional(args.tool_policy)
        const toolSelection = toolPolicy === undefined && templateMatch.kind === 'matched'
          ? { toolPolicy: templateMatch.template.toolPolicy, toolFilter: structuredClone(templateMatch.template.toolFilter) }
          : memberToolSelection(config, captain, toolPolicy)
        const member: TeamMember = {
          id: '',
          name: memberName,
          role: args.role,
          provider: selection.provider,
          model: selection.model,
          reasoningMode: selection.reasoningMode,
          reasoningEffort: selection.reasoningEffort,
          modelPolicySource,
          ...templateMatch.kind === 'none' ? { temporaryAdmission: true as const } : {},
          executionPrompt: trimmedOptional(args.executionPrompt) ?? inheritedExecutionPrompt,
          ...selection.fallback === undefined ? {} : { fallback: selection.fallback },
          ...toolSelection,
          joinedAt: Date.now(),
          status: 'idle',
        }
        markStagedPlanBuilding(fresh)
        if (fresh.phase !== 'staged') {
          await spawnMember(
            ctx,
            memberRuntime(config),
            memberSelections,
            selection,
            await memberOperationParent(ctx, fresh, captain),
            fresh,
            member,
            config.stateDir,
            exec.signal,
            undefined,
            member.toolFilter,
            memberRelaxableDeny(config, member),
          )
        }
        fresh.members.push(member)
        try {
          await writeTeam(stateRoot, fresh)
        } catch (error: unknown) {
          // The continuable child is already live, but the durable team record
          // never saw it. Retire the orphan so it disappears from subagent
          // listings and cannot be resumed, then surface the write failure.
          if (member.id !== '') {
            const gateway = agentTeamsSubagentGateway(ctx)
            await gateway.retireAndInterrupt(await memberOperationParent(ctx, fresh, captain), member.id as SessionId, () => (
              recordRetiredMemberIds(stateRoot, [member.id]).catch(() => undefined)
            ))
          }
          throw error
        }
        appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/member-added', {
          teamId: fresh.id,
          memberId: member.id,
          name: member.name,
          ...member.role !== undefined ? { role: member.role } : {},
        })
        return {
          member_name: member.name,
          member_id: member.id,
          provider: selection.provider,
          model: selection.model,
          ...selection.reasoningEffort === undefined
            ? {}
            : { reasoning_effort: selection.reasoningEffort },
          ...member.toolPolicy === undefined ? {} : { tool_policy: member.toolPolicy },
          status: member.status,
          phase: fresh.phase,
        }
      })
      await scheduler.kickMember(workspace, team.id, created.member_name, await liveLeadAnchorAgent(ctx, team, captain))
      const latest = (await readTeam(stateRoot, team.id))?.members.find(member => member.name === created.member_name)
      return latest === undefined ? created : { ...created, member_id: latest.id, status: latest.status }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_remove_member',
    description: 'Remove a member safely: fence its current attempts and mailbox, drain its live turn, then return unfinished owned tasks to the shared pending pool and mark it removed. A drain failure leaves the fenced member active for retry.',
    parameters: {
      name: { type: 'string', required: true, description: 'Name of the member to remove.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          member_name: { type: 'string', required: true },
          status: { type: 'string', required: true },
          requeued_tasks: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: `Member "${value.member_name}" removed (status ${value.status}); requeued tasks: ${value.requeued_tasks.join(', ') || 'none'}.`,
      }],
    },
    async execute(args, exec) {
      const captain = requireCaptain(exec)
      const captainId = durableSessionId(captain)
      const workspace = workspaceOf(captain)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireCaptainTeam(ctx, workspace, config, captain)
      const revoked = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captainId)
        const member = requireMember(fresh, args.name)
        markStagedPlanBuilding(fresh)
        const requeued: string[] = []
        if (fresh.phase === 'staged') {
          fresh.members = fresh.members.filter(candidate => candidate !== member)
          for (const task of fresh.tasks) {
            if (task.assignee !== member.name) continue
            delete task.assignee
            task.updatedAt = Date.now()
            requeued.push(task.id)
          }
          await writeTeam(stateRoot, fresh)
          appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/member-removed', {
            teamId: fresh.id,
            memberId: member.id,
          })
          return { member: { ...member, status: 'removed' as const }, requeued, immediate: true as const }
        }
        for (const task of fresh.tasks) {
          if (task.assignee !== member.name || task.status === 'completed') continue
          // Close both task and member admission before drain. If the host
          // rejects drain, this durable fence remains and no new generation
          // can be published over a still-live child.
          invalidateTaskAttempt(task, undefined, true)
          requeued.push(task.id)
        }
        member.stopping = true
        await discardMailboxMessages(
          stateRoot,
          fresh.id,
          member.name,
          (await readUnreadMailbox(stateRoot, fresh.id, member.name)).map(message => message.id),
        )
        await writeTeam(stateRoot, fresh)
        appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/member-removed', {
          teamId: fresh.id,
          memberId: member.id,
        })
        return { member: { ...member }, requeued, immediate: false as const }
      })
      if (revoked.member.id !== '') {
        await recordRetiredMemberIds(stateRoot, [revoked.member.id])
        await stopTeamMemberActivations(ctx, await memberOperationParent(ctx, team, captain), [revoked.member], exec.signal)
      }
      if (!revoked.immediate) await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captainId)
        const member = requireMember(fresh, revoked.member.name)
        if (member.id !== revoked.member.id || member.stopping !== true) {
          throw new Error(`member "${member.name}" changed while removal was draining`)
        }
        member.status = 'removed'
        delete member.stopping
        for (const task of fresh.tasks) {
          if (revoked.requeued.includes(task.id)) task.reassigning = false
        }
        await writeTeam(stateRoot, fresh)
      })
      await scheduler.kickTeam(workspace, team.id, await liveLeadAnchorAgent(ctx, team, captain))
      return {
        member_name: revoked.member.name,
        status: revoked.member.status,
        requeued_tasks: revoked.requeued,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_create_task',
    description: 'Create a task in your team\'s task list. Every call must include a non-empty subject, including verification and review tasks. Tasks can depend on other tasks (dependencies): a task is only claimable once every dependency is completed. Use an active member name for member work, assignee="captain" for captain-owned work, or omit assignee for the shared pool; an empty assignee is also normalized to the shared pool. A member still claims its assigned task before working.',
    parameters: {
      subject: { type: 'string', required: true, description: 'Required non-empty title for this task. Never omit it, including for verification or review tasks.' },
      description: { type: 'string', description: 'What needs to be done, in detail.' },
      dependencies: {
        type: 'array',
        items: { type: 'string' },
        description: 'Task ids this task depends on (must be completed before this task can be claimed).',
      },
      assignee: { type: 'string', description: 'Optional active member name, "captain" for captain-owned work, or empty/omitted for the shared pool.' },
      kind: {
        type: 'string',
        enum: ['work', 'requirements', 'implementation', 'verification', 'review', 'repair', 'integration'],
        description: 'Task kind. Defaults to work (legacy, no quality gates). Quality kinds require a contract.',
      },
      round: { type: 'number', description: '1-based review / requirements / repair round.' },
      objective: { type: 'string', description: 'Required non-empty objective for quality kinds.' },
      inScope: { type: 'array', items: { type: 'string' }, description: 'Required non-empty array for implementation/repair. Authorized workspace-relative POSIX exact files or directories ending in /, e.g. server/src/modules/summary-report/. Description and deliverables do not replace this field.' },
      outOfScope: { type: 'array', items: { type: 'string' }, description: 'Excluded workspace-relative POSIX exact files or directories ending in /, e.g. client/. These exclusions override inScope.' },
      acceptance: { type: 'array', items: { type: 'string' }, description: 'Acceptance criteria. Required for quality kinds.' },
      verify: { type: 'array', items: { type: 'string' }, description: 'Verification commands. Required for implementation/repair.' },
      deliverables: { type: 'array', items: { type: 'string' }, description: 'For implementation/repair, concrete workspace-relative POSIX artifact paths covered by inScope and not outOfScope. Put prose outcomes in acceptance or description.' },
      nonGoals: { type: 'array', items: { type: 'string' }, description: 'Explicit non-goals.' },
      reviewedTaskId: { type: 'string', description: 'Task being reviewed. Required for kind=review.' },
      sourceTaskId: { type: 'string', description: 'Source implementation/artifact. Required for kind=repair.' },
      sourceFindingIds: { type: 'array', items: { type: 'string' }, description: 'Finding ids this repair must close.' },
      coverageOf: { type: 'array', items: { type: 'string' }, description: 'User-constraint / goal items this task covers.' },
      resume: { type: 'boolean', description: 'If true, clear halted in the same lock before creating the task.' },
      resumeReason: { type: 'string', description: 'Required non-empty reason when resume=true.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          task_id: { type: 'string', required: true },
          subject: { type: 'string', required: true },
          status: { type: 'string', required: true },
          assignee: { type: 'string' },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: `Task "${value.subject}" created as ${value.task_id} (status ${value.status}${value.assignee ? `, assigned to ${value.assignee}` : ''}).`,
      }],
    },
    async execute(args, exec) {
      const captain = requireCaptain(exec)
      const captainId = durableSessionId(captain)
      const workspace = workspaceOf(captain)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireCaptainTeam(ctx, workspace, config, captain)
      const input = normalizeBlankOptionalTaskFields(args)
      // Blank ownership is the model-facing spelling of the shared task pool.
      const assignee = trimmedOptional(input.assignee)
      const created = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id)
        const gate = validateCreateTask(fresh, {
          subject: input.subject,
          description: input.description,
          dependencies: input.dependencies,
          assignee,
          kind: input.kind as TaskKind | undefined,
          round: input.round,
          objective: input.objective,
          inScope: input.inScope,
          outOfScope: input.outOfScope,
          acceptance: input.acceptance,
          verify: input.verify,
          deliverables: input.deliverables,
          nonGoals: input.nonGoals,
          reviewedTaskId: input.reviewedTaskId,
          sourceTaskId: input.sourceTaskId,
          sourceFindingIds: input.sourceFindingIds,
          coverageOf: input.coverageOf,
          resume: input.resume,
          resumeReason: input.resumeReason,
        })
        if (!gate.ok) throw new Error(gate.error ?? 'create_task rejected by quality gates')
        if (fresh.halted === true) {
          const resumed = resumeTeamState(fresh, args.resumeReason ?? '')
          if (resumed.status !== 'resumed' || resumed.team === undefined) {
            throw new Error(resumed.error ?? 'team is halted; call agent_teams_resume or pass resume=true with resumeReason')
          }
          fresh.halted = false
          fresh.haltedAt = undefined
          appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/team-resumed', {
            teamId: fresh.id,
            reason: args.resumeReason ?? '',
          })
        }
        const dependencies = input.dependencies ?? []
        for (const dependency of dependencies) {
          if (!fresh.tasks.some((task) => task.id === dependency)) {
            throw new Error(`dependency "${dependency}" does not exist in team "${fresh.name}"`)
          }
        }
        if (!isTemporaryToolAdmission(exec.callId)) requireTemporaryMemberAdmission(fresh, assignee, captain)
        const kind = gate.kind ?? 'work'
        const objective = kind === 'review' || kind === 'requirements'
          ? sanitizeReviewObjective(gate.task?.objective)
          : gate.task?.objective
        const acceptance = kind === 'review' || kind === 'requirements'
          ? sanitizeReviewAcceptance(input.acceptance)
          : input.acceptance
        const task: TeamTask = {
          id: `t${fresh.taskSeq + 1}`,
          subject: input.subject,
          description: input.description,
          status: 'pending',
          assignee,
          ...assignee !== undefined && assignee !== CAPTAIN_KEY && requireMember(fresh, assignee).temporaryAdmission === true
            ? { temporaryAdmission: true as const } : {},
          dependencies,
          revision: 1,
          attempt: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          kind,
          ...input.round === undefined ? {} : { round: input.round },
          ...objective === undefined ? {} : { objective },
          ...input.inScope === undefined ? {} : { inScope: input.inScope },
          ...input.outOfScope === undefined ? {} : { outOfScope: input.outOfScope },
          ...acceptance === undefined ? {} : { acceptance },
          ...input.verify === undefined ? {} : { verify: input.verify },
          ...input.deliverables === undefined ? {} : { deliverables: input.deliverables },
          ...input.nonGoals === undefined ? {} : { nonGoals: input.nonGoals },
          ...gate.task?.reviewedTaskId === undefined ? {} : { reviewedTaskId: gate.task.reviewedTaskId },
          ...gate.task?.sourceTaskId === undefined ? {} : { sourceTaskId: gate.task.sourceTaskId },
          ...input.sourceFindingIds === undefined ? {} : { sourceFindingIds: input.sourceFindingIds },
          ...input.coverageOf === undefined ? {} : { coverageOf: input.coverageOf },
        }
        markStagedPlanBuilding(fresh)
        fresh.taskSeq += 1
        fresh.tasks.push(task)
        await writeTeam(stateRoot, fresh)
        appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/task-created', {
          teamId: fresh.id,
          taskId: task.id,
          subject: task.subject,
          dependencies: task.dependencies,
          ...task.assignee !== undefined ? { assignee: task.assignee } : {},
          ...task.kind === undefined ? {} : { kind: task.kind },
          ...task.round === undefined ? {} : { round: task.round },
        })
        return {
          task_id: task.id,
          subject: task.subject,
          status: task.status,
          ...task.assignee !== undefined ? { assignee: task.assignee } : {},
        }
      })
      await scheduler.kickTeam(workspace, team.id, await liveLeadAnchorAgent(ctx, team, captain))
      return created
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_reassign_task',
    description: 'Atomically retry, reassign, or let the captain take over one ready unfinished/failed task. The old attempt is revoked before its member is interrupted, so late updates cannot overwrite the new owner. A captain can own only one unfinished takeover; ownership spans turns until completion, failure, or explicit reassignment.',
    parameters: {
      task_id: { type: 'string', required: true, description: 'Task to retry/reassign.' },
      assignee: { type: 'string', required: true, description: 'Active member name, or "captain" for captain takeover.' },
      reason: { type: 'string', description: 'Why the task is being retried or reassigned.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          task_id: { type: 'string', required: true },
          previous_assignee: { type: 'string', required: true },
          assignee: { type: 'string', required: true },
          status: { type: 'string', required: true },
          attempt: { type: 'number', required: true },
          attempt_id: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Task ${value.task_id} reassigned ${value.previous_assignee || 'unassigned'} → ${value.assignee} (attempt ${value.attempt}, status ${value.status}${value.attempt_id ? `, attempt_id ${value.attempt_id}` : ''}).`,
      }],
    },
    async execute(args, exec) {
      const captain = requireCaptain(exec)
      const captainId = durableSessionId(captain)
      const workspace = workspaceOf(captain)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireCaptainTeam(ctx, workspace, config, captain)
      const target = args.assignee.trim()
      if (target === '') throw new Error('reassignment assignee must not be empty')

      const revoked = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captainId)
        requireRunningTeam(fresh)
        const task = requireTask(fresh, args.task_id)
        if (task.status === 'completed') throw new Error(`completed task ${task.id} is immutable and cannot be reassigned`)
        const targetMember = target === CAPTAIN_KEY ? undefined : requireMember(fresh, target)
        requireTemporaryMemberAdmission(fresh, target, captain)
        if (target === CAPTAIN_KEY) {
          const busy = captainOpenTask(fresh, task.id)
          if (busy !== undefined) {
            throw new Error(`captain is busy with ${busy.id}; complete or reassign it before taking over ${task.id}`)
          }
          const pending = unsatisfiedDependencies(fresh.tasks, task.dependencies)
          if (pending.length > 0) {
            throw new Error(`task ${task.id} is blocked by unfinished dependencies: ${pending.join(', ')} — complete them before captain takeover`)
          }
          const reviewGate = integrationReviewBlockers(fresh.tasks, task,
            taskKindOf(task) === 'integration' ? await currentCodeVersion(workspace) : undefined,
            fresh.reviewPolicy?.requiredReviewers)
          if (reviewGate.length > 0) throw new Error(integrationGateError(task.id, reviewGate))
        } else if (targetMember !== undefined) {
          const busy = memberOpenTask(fresh, targetMember.name, task.id)
          if (busy !== undefined) {
            throw new Error(`member "${targetMember.name}" is busy with ${busy.id}; finish or reassign it first`)
          }
        }
        if (task.reassigning === true) {
          const previousMember = task.handoffFromMemberId === undefined
            ? undefined
            : fresh.members.find(member => member.id === task.handoffFromMemberId
              && member.status !== 'removed'
              && member.stopping === true)
          if (task.assignee !== target
            || task.status !== 'pending'
            || task.attemptId !== undefined
            || task.handoffId === undefined
            || previousMember === undefined) {
            throw new Error(`task ${task.id} has a different or stale reassignment handoff; refusing to replace its active fence`)
          }
          // A failed drain leaves this exact durable handoff fenced.  Retrying
          // the same public reassignment is safe: it must quiesce the recorded
          // old member before the existing generation can be released.
          return {
            previousAssignee: previousMember.name,
            previousMember: { ...previousMember },
            handoffId: task.handoffId,
          }
        }
        const previousAssignee = task.assignee ?? ''
        const previousMember = (task.status !== 'claimed' && task.status !== 'in_progress')
          || task.assignee === undefined || task.assignee === CAPTAIN_KEY
          ? undefined
          : fresh.members.find(member => member.name === task.assignee && member.status !== 'removed')
        invalidateTaskAttempt(task, target, true)
        if (targetMember?.temporaryAdmission === true) task.temporaryAdmission = true
        else delete task.temporaryAdmission
        if (previousMember !== undefined) {
          previousMember.stopping = true
          task.handoffFromMemberId = previousMember.id
          await discardMailboxMessages(
            stateRoot,
            fresh.id,
            previousMember.name,
            (await readUnreadMailbox(stateRoot, fresh.id, previousMember.name)).map(message => message.id),
          )
        }
        await writeTeam(stateRoot, fresh)
        return {
          previousAssignee,
          previousMember: previousMember === undefined ? undefined : { ...previousMember },
          handoffId: task.handoffId,
        }
      })

      let quiescenceError: unknown
      if (revoked.previousMember !== undefined) {
        try {
          await stopTeamMemberActivations(ctx, await memberOperationParent(ctx, team, captain), [revoked.previousMember], exec.signal)
        } catch (error: unknown) {
          quiescenceError = error
        }
      }

      await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id)
        const task = requireTask(fresh, args.task_id)
        if (task.handoffId !== revoked.handoffId || task.assignee !== target || task.reassigning !== true) {
          throw new Error(`task ${task.id} changed during reassignment; refusing to overwrite the newer state`)
        }
        task.reassigning = quiescenceError !== undefined
        if (quiescenceError === undefined) {
          const previous = fresh.members.find(member => member.id === revoked.previousMember?.id)
          if (previous !== undefined) delete previous.stopping
          delete task.handoffFromMemberId
        }
        if (quiescenceError === undefined && target === CAPTAIN_KEY) {
          beginTaskAttempt(task, CAPTAIN_KEY)
          // The captain is already in the turn that requested takeover; there
          // is no later member claim handshake to move claimed -> in_progress.
          task.status = 'in_progress'
          await startQualityAttempt(workspace, fresh, task)
          task.updatedAt = Date.now()
        }
        await writeTeam(stateRoot, fresh)
        appendTeamEvent(ctx, captain.session, 'agent-teams/task-updated', {
          teamId: fresh.id,
          taskId: task.id,
          status: task.status,
          assignee: task.assignee,
          ...args.reason === undefined ? {} : { output: `Reassigned: ${args.reason}` },
        })
      })
      if (quiescenceError !== undefined) throw quiescenceError
      if (target !== CAPTAIN_KEY) await scheduler.kickMember(workspace, team.id, target, await liveLeadAnchorAgent(ctx, team, captain))
      const current = await readTeam(stateRoot, team.id)
      const task = current === undefined ? undefined : requireTask(current, args.task_id)
      if (task === undefined) throw new Error(`team "${team.name}" ended during reassignment`)
      return {
        task_id: task.id,
        previous_assignee: revoked.previousAssignee,
        assignee: task.assignee ?? '',
        status: task.status,
        attempt: task.attempt ?? 0,
        ...task.attemptId === undefined ? {} : { attempt_id: task.attemptId },
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_claim_task',
    description: 'Claim one ready task for a member (or yourself). A member cannot own a second unfinished task. The returned attempt_id is required for that member\'s updates and becomes stale after retry/reassignment. Captain-owned tasks are claimed by omitting assignee; take over member-owned work with reassign_task(assignee="captain") first.',
    parameters: {
      task_id: { type: 'string', required: true, description: 'The task id to claim.' },
      assignee: { type: 'string', description: 'Captain only: a real active member name. Do not pass "captain". To claim an existing captain-owned task, omit assignee; to take over member-owned work, first call agent_teams_reassign_task with assignee="captain".' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          task_id: { type: 'string', required: true },
          status: { type: 'string', required: true },
          assignee: { type: 'string', required: true },
          attempt: { type: 'number', required: true },
          attempt_id: { type: 'string' },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: `Task ${value.task_id} claimed by ${value.assignee} (attempt ${value.attempt}${value.attempt_id ? `, attempt_id ${value.attempt_id}` : ''}, status ${value.status}).`,
      }],
    },
    async execute(args, exec) {
      const caller = requireCaptain(exec)
      const workspace = workspaceOf(caller)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireParticipantTeam(ctx, workspace, config, caller)
      return withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const { team: fresh, identity } = await requireFreshParticipant(ctx, stateRoot, team.id, durableSessionId(caller))
        requireRunningTeam(fresh)
        const task = requireTask(fresh, args.task_id)
        if (task.reassigning === true) {
          throw new Error(`task ${task.id} is being reassigned; wait for the handoff to finish`)
        }
        let assignee = task.assignee
        if (identity.kind === 'captain') {
          const requestedAssignee = trimmedOptional(args.assignee)
          if (requestedAssignee !== undefined) {
            if (requestedAssignee === CAPTAIN_KEY) {
              throw new Error('claim_task.assignee accepts only real active member names, not "captain". To claim an existing captain-owned task, omit assignee. To take over a member-owned task, first call agent_teams_reassign_task with assignee="captain".')
            }
            requireMember(fresh, requestedAssignee)
            assignee = requestedAssignee
          }
        } else {
          const requestedAssignee = args.assignee
          if (requestedAssignee !== undefined
            && requestedAssignee.trim() !== ''
            && requestedAssignee !== identity.name) {
            throw new Error('members cannot set assignee when claiming a task')
          }
          if (assignee !== undefined && assignee !== identity.name) {
            throw new Error(`task ${task.id} is assigned to "${assignee}", not you`)
          }
          assignee = identity.name
        }
        // Authorization must happen before the idempotent return: another
        // member must not receive a false success for somebody else's task.
        if (task.status === 'claimed' || task.status === 'in_progress') {
          if (assignee === undefined || task.assignee !== assignee) {
            throw new Error(`task ${task.id} is already claimed by "${task.assignee ?? 'nobody'}"`)
          }
          return {
            task_id: task.id,
            status: task.status,
            assignee,
            attempt: task.attempt ?? 0,
            ...task.attemptId === undefined ? {} : { attempt_id: task.attemptId },
          }
        }
        const pending = unsatisfiedDependencies(fresh.tasks, task.dependencies)
        if (pending.length > 0) {
          throw new Error(`task ${task.id} is blocked by unfinished dependencies: ${pending.join(', ')} — complete them first`)
        }
        const reviewGate = integrationReviewBlockers(fresh.tasks, task,
          taskKindOf(task) === 'integration' ? await currentCodeVersion(workspace) : undefined,
          fresh.reviewPolicy?.requiredReviewers)
        if (reviewGate.length > 0) throw new Error(integrationGateError(task.id, reviewGate))
        const transition = transitionError(task.status, 'claimed')
        if (transition !== undefined) throw new Error(transition)
        if (assignee === undefined) {
          throw new Error('claiming an unassigned task needs an assignee (claim on behalf of a member)')
        }
        const busy = memberOpenTask(fresh, assignee, task.id)
        if (busy !== undefined) {
          throw new Error(`member "${assignee}" is busy with ${busy.id}; finish or reassign it first`)
        }
        if (assignee !== CAPTAIN_KEY) {
          const member = requireMember(fresh, assignee)
          if (member.temporaryAdmission === true) {
            if (task.temporaryAdmission !== true && !hasCurrentTurnTemporaryAuthorization(caller)) {
              throw new Error(`member "${member.name}" is temporary and cannot claim new work after the authorization turn`)
            }
            task.temporaryAdmission = true
          }
        }
        const attemptId = beginTaskAttempt(task, assignee)
        await writeTeam(stateRoot, fresh)
        appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, caller.session), 'agent-teams/task-updated', {
          teamId: fresh.id,
          taskId: task.id,
          status: task.status,
          assignee: task.assignee,
        })
        return {
          task_id: task.id,
          status: task.status,
          assignee: task.assignee ?? '',
          attempt: task.attempt ?? 0,
          attempt_id: attemptId,
        }
      })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_update_task',
    description: 'Update a task status/output. Members must supply the current attempt_id returned by claim_task; stale attempts are rejected after takeover/reassignment. Terminal results are immutable, but their owner or captain may append attributed acceptanceResults, commandsRun, or evidence_note without changing the result.',
    parameters: {
      task_id: { type: 'string', required: true, description: 'The task id to update.' },
      status: {
        type: 'string',
        enum: ['in_progress', 'completed', 'failed', 'cancelled'],
        description: 'New status (in_progress, completed, failed, cancelled).',
      },
      output: { type: 'string', description: 'Result summary; set when completing or failing.' },
      evidence_note: { type: 'string', description: 'Append-only observation for a terminal task; does not reopen or change its result.' },
      attempt_id: { type: 'string', description: 'Current execution capability returned by claim_task (required for members when present on the task).' },
      verdict: {
        type: 'string',
        enum: ['pass', 'needs_revision', 'reject'],
        description: 'Required for completing requirements/review. needs_revision and reject must fail the task.',
      },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            severity: { type: 'string', enum: ['low', 'medium', 'high', 'blocker'], required: true },
            problem: { type: 'string', required: true },
            requiredFix: { type: 'string', required: true },
            file: { type: 'string' },
            line: { type: 'number' },
            resolved: { type: 'boolean' },
          },
        },
        description: 'Structured review findings. Required when verdict is needs_revision or reject; each item needs id, severity, problem, and requiredFix.',
      },
      changedPaths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Workspace-relative POSIX paths changed by this implementation/repair.',
      },
      noChangesReason: {
        type: 'string',
        description: 'Required when an implementation/repair reports changedPaths:[] and has no declared deliverables.',
      },
      acceptanceResults: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            criterion: { type: 'string', required: true },
            status: { type: 'string', enum: ['passed', 'failed'], required: true },
            evidence: { type: 'string' },
          },
        },
        description: 'Acceptance evidence: {criterion, status:"passed"|"failed", evidence?}. Supply one item per acceptance criterion and copy its criterion text exactly; paraphrased items do not count.',
      },
      commandsRun: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            command: { type: 'string', required: true },
            status: { type: 'string', enum: ['passed', 'failed'], required: true },
            exitCode: { type: 'number' },
            evidence: { type: 'string' },
          },
        },
        description: 'Verification evidence: {command, status:"passed"|"failed", exitCode?, evidence?}. Supply one item per verify command and copy its command text exactly; paraphrased items do not count.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          task_id: { type: 'string', required: true },
          status: { type: 'string', required: true },
          output: { type: 'string' },
          attempt: { type: 'number', required: true },
          attempt_id: { type: 'string' },
          evidence_count: { type: 'number' },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: `Task ${value.task_id} attempt ${value.attempt} → ${value.status}${value.output !== undefined ? `\nOutput: ${value.output}` : ''}${value.evidence_count === undefined ? '' : `\nSupplemental evidence records: ${value.evidence_count}. Original result unchanged.`}`,
      }],
    },
    async execute(args, exec) {
      const caller = requireCaptain(exec)
      const workspace = workspaceOf(caller)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireParticipantTeam(ctx, workspace, config, caller)
      let followUpMessage: import('./types.ts').TeamMessage | undefined
      const updated = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const { team: fresh, identity } = await requireFreshParticipant(ctx, stateRoot, team.id, durableSessionId(caller))
        requireRunningTeam(fresh)
        const task = requireTask(fresh, args.task_id)
        const terminal = TERMINAL_TASK_STATUSES.includes(task.status)
        const pendingCancellation = identity.kind === 'captain' && args.status === 'cancelled'
          && task.status === 'pending' && task.reassigning !== true
        if (identity.kind === 'captain' && !terminal && !pendingCancellation
          && task.assignee !== undefined
          && task.assignee !== CAPTAIN_KEY) {
          throw new Error(`task ${task.id} is owned by member "${task.assignee}"; call agent_teams_reassign_task with assignee="captain" before takeover`)
        }
        if (identity.kind === 'member') {
          if (task.assignee !== identity.name) {
            throw new Error(`task ${task.id} is assigned to "${task.assignee ?? 'nobody'}", not you`)
          }
          if (task.attemptId !== undefined && args.attempt_id !== task.attemptId) {
            throw new Error(`stale attempt for task ${task.id}: expected the current attempt_id; stop work and request fresh assignment`)
          }
        }
        if (terminal) {
          const appended = appendTaskEvidence(task, {
            ...args,
            findings: parseFindings(args.findings),
            changedPaths: normalizeBlankOptionalTaskFields(args).changedPaths,
            acceptanceResults: parseAcceptanceResults(args.acceptanceResults),
            commandsRun: parseCommandResults(args.commandsRun),
          }, identity.name)
          if (appended) await writeTeam(stateRoot, fresh)
          return {
            task_id: task.id,
            status: task.status,
            attempt: task.attempt ?? 0,
            evidence_count: task.supplementalEvidence?.length ?? 0,
            ...task.attemptId === undefined ? {} : { attempt_id: task.attemptId },
            ...task.output !== undefined ? { output: task.output } : {},
          }
        }
        if (args.evidence_note?.trim()) throw new Error('evidence_note is only valid for terminal tasks')
        const input = normalizeBlankOptionalTaskFields(args)
        const findings = parseFindings(input.findings)
        const acceptanceResults = parseAcceptanceResults(args.acceptanceResults)
        const commandsRun = parseCommandResults(args.commandsRun)
        if (args.status === 'completed' && taskKindOf(task) === 'integration') {
          const version = await currentCodeVersion(workspace)
          const blockers = integrationReviewBlockers(fresh.tasks, task, version, fresh.reviewPolicy?.requiredReviewers)
          if (blockers.length) throw new Error(integrationGateError(task.id, blockers))
          task.reviewCodeVersion = version
        }
        if (args.status === 'completed' && taskKindOf(task) === 'review') {
          const target = fresh.tasks.find(item => item.id === task.reviewedTaskId)
          const basis = task.reviewBasis
          if (!basis || !target || target.attemptId !== basis.targetAttemptId || contractIdentity(target) !== basis.targetContract
            || basis.reviewer !== task.assignee || task.assignee === target.assignee || basis.codeVersion !== await currentCodeVersion(workspace)) {
            throw new Error('review target/attempt/contract/code changed or its review basis is missing; start a fresh independent review')
          }
        }
        const gate = evaluateQualityCompletion(task, {
          status: args.status,
          output: args.output,
          verdict: args.verdict as ReviewVerdict | undefined,
          findings,
          changedPaths: input.changedPaths,
          noChangesReason: args.noChangesReason,
          acceptanceResults,
          commandsRun,
        })
        if (!gate.ok) throw new Error(gate.error ?? 'update_task rejected by quality gates')
        const effectiveChangedPaths = input.changedPaths ?? task.changedPaths
        if (args.status === 'completed' && ['implementation', 'repair'].includes(taskKindOf(task)) && effectiveChangedPaths !== undefined) {
          const observed = await observeAttemptChanges(workspace, fresh.id, task, auditStatePrefix)
          const actual = observed.actual
          const audit = auditChangedPaths({
            task,
            reported: effectiveChangedPaths,
            actual,
            otherObservedPaths: observed.status === 'observed' ? attributedConcurrentPaths(task, fresh.tasks, observed.current) : [],
            isDirectory: (path) => {
              const normalized = normalizeWorkspacePath(path)
              try { return normalized !== undefined && statSync(join(workspace, normalized)).isDirectory() } catch { return false }
            },
          })
          if (audit !== undefined) throw new Error(audit)
          if (observed.status === 'observed') task.workspaceAudit!.completed = observed.current
        }
        if (args.status !== undefined) {
          const transition = transitionError(task.status, args.status)
          if (transition !== undefined) throw new Error(transition)
          if (args.status === 'in_progress' && task.status !== 'in_progress') {
            await startQualityAttempt(workspace, fresh, task)
          }
          task.status = args.status
        }
        if (args.output !== undefined) task.output = args.output
        if (args.verdict !== undefined) task.verdict = args.verdict as ReviewVerdict
        if (findings !== undefined) task.findings = findings
        if (input.changedPaths !== undefined) task.changedPaths = input.changedPaths
        if (args.noChangesReason !== undefined) task.noChangesReason = args.noChangesReason.trim() || undefined
        if (acceptanceResults !== undefined) task.acceptanceResults = acceptanceResults
        if (commandsRun !== undefined) task.commandsRun = commandsRun
        if (acceptanceResults !== undefined || commandsRun !== undefined) task.completionEvidenceSource = 'member-report'
        if (args.status === 'completed' && taskKindOf(task) !== 'work') {
          task.completionReportBasis = { schemaVersion: 1, source: 'member-report', attemptId: task.attemptId!,
            contractHash: taskContractHash(task), codeVersion: await currentCodeVersion(workspace), at: Date.now() }
        }
        // A passing gate is evidence about a revision: record which one, so a
        // later edit cannot leave the team advertising an unreviewed revision.
        bindClosingVerdict(workspace, fresh, task)
        task.updatedAt = Date.now()
        const priorDependencies = new Map(fresh.tasks.map(item => [item.id, [...item.dependencies]]))
        const followUp = (task.status === 'failed' && isQualityKind(taskKindOf(task)))
          ? applyQualityFollowUp(
            fresh,
            task,
            (paths) => snapshotWorkspacePaths(workspace, paths),
            (path) => workspacePathExists(workspace, path),
          )
          : undefined
        let followUpSummary: string | undefined
        if ((followUp?.created.length ?? 0) > 0) {
          const rewired = fresh.tasks.filter(item => priorDependencies.has(item.id) && JSON.stringify(priorDependencies.get(item.id)) !== JSON.stringify(item.dependencies))
          followUpSummary = `Automatic quality follow-up for ${task.id}: ${followUp!.created.map(item => `${item.id} (${item.kind}, owner=${item.assignee ?? 'unassigned'}, deps=${item.dependencies.join(',') || 'none'})`).join('; ')}.${rewired.length ? ` Updated dependencies: ${rewired.map(item => `${item.id} -> ${item.dependencies.join(',')}`).join('; ')}.` : ''} Use these tasks; do not create duplicate repair/review work.${followUp!.excludedFindings === undefined ? '' : ` Findings on default-excluded paths were not turned into a contract and stay with the user: ${followUp!.excludedFindings.join(', ')}.`}`
          followUpMessage = createMessage(CAPTAIN_KEY, CAPTAIN_KEY, followUpSummary)
        }
        if (followUp?.escalated === true) {
          await appendMailbox(stateRoot, fresh.id, CAPTAIN_KEY, createMessage(
            CAPTAIN_KEY,
            CAPTAIN_KEY,
            `Quality-gate loop escalated after ${task.id} (${task.kind ?? 'review'} verdict=${task.verdict}). Automatic repair/review stopped.${followUp.reason === undefined ? '' : ` Reason: ${followUp.reason}.`}${followUp.excludedFindings === undefined ? '' : ` Findings left for the user (default-excluded paths, not a member's to edit): ${followUp.excludedFindings.join(', ')}.`}`,
          ))
        }
        await writeTeam(stateRoot, fresh)
        if (followUpMessage !== undefined) await appendMailbox(stateRoot, fresh.id, CAPTAIN_KEY, followUpMessage)
        appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, caller.session), 'agent-teams/task-updated', {
          teamId: fresh.id,
          taskId: task.id,
          status: task.status,
          ...task.assignee !== undefined ? { assignee: task.assignee } : {},
          ...task.output !== undefined ? { output: task.output } : {},
          ...task.verdict === undefined ? {} : { verdict: task.verdict },
          ...task.round === undefined ? {} : { round: task.round },
        })
        for (const created of followUp?.created ?? []) {
          appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, caller.session), 'agent-teams/task-created', {
            teamId: fresh.id,
            taskId: created.id,
            subject: created.subject,
            dependencies: created.dependencies,
            ...created.assignee === undefined ? {} : { assignee: created.assignee },
            ...created.kind === undefined ? {} : { kind: created.kind },
            ...created.round === undefined ? {} : { round: created.round },
          })
        }
        return {
          task_id: task.id,
          status: task.status,
          attempt: task.attempt ?? 0,
          ...task.attemptId === undefined ? {} : { attempt_id: task.attemptId },
          ...task.output !== undefined ? { output: task.output } : {},
        }
      })
      if (followUpMessage !== undefined) {
        const captain = nearestLiveLead(ctx, team)
        if (captain !== undefined && steerCaptainReport(captain, CAPTAIN_KEY, followUpMessage.content, mailboxPrompt(team.id, CAPTAIN_KEY, [followUpMessage]))) {
          await withTeamLock(teamLockKey(stateRoot, team.id), () => markMailboxDelivered(stateRoot, team.id, CAPTAIN_KEY, [followUpMessage!.id]))
        }
      }
      await scheduler.kickTeam(workspace, team.id, await liveLeadAnchorAgent(ctx, team, caller))
      return updated
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_amend_task',
    description: 'Captain-only controlled contract amendment for one non-terminal quality task. Replace a wrong objective, acceptance, verify, inScope, or outOfScope only when the current contract makes honest completion impossible. Every amendment records the previous values and reason; lists are full replacements. A task is frozen after a passing review or requirements judgment.',
    parameters: {
      task_id: { type: 'string', required: true, description: 'Task whose contract is being amended.' },
      reason: { type: 'string', required: true, description: 'Why the current contract is wrong; stored in the revision ledger.' },
      objective: { type: 'string', description: 'Replacement objective.' },
      acceptance: { type: 'array', items: { type: 'string' }, description: 'Replacement acceptance criteria.' },
      verify: { type: 'array', items: { type: 'string' }, description: 'Replacement verification commands.' },
      inScope: { type: 'array', items: { type: 'string' }, description: 'Replacement authorized scope. Non-empty for implementation/repair. Workspace-relative POSIX exact files or directories ending in /.' },
      outOfScope: { type: 'array', items: { type: 'string' }, description: 'Replacement excluded workspace-relative POSIX exact files or directories ending in /; exclusions override inScope.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          task_id: { type: 'string', required: true },
          status: { type: 'string', required: true },
          revised_fields: { type: 'string', required: true },
          revision_count: { type: 'number', required: true },
          contract: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `Task ${value.task_id} contract amended (${value.revised_fields}); ${value.revision_count} revision(s) on record.` }],
    },
    async execute(args, exec) {
      const unsupported = unsupportedAmendmentArguments(args as Record<string, unknown>)
      if (unsupported !== undefined) throw new Error(unsupported)
      const captain = requireCaptain(exec)
      const captainId = durableSessionId(captain)
      const workspace = workspaceOf(captain)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireCaptainTeam(ctx, workspace, config, captain)
      const amended = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id)
        const task = requireTask(fresh, args.task_id)
        requireTemporaryMemberAdmission(fresh, task.assignee, captain)
        const result = amendTaskContract(fresh, task, normalizeBlankOptionalTaskFields({
          ...args.objective === undefined ? {} : { objective: args.objective },
          ...args.acceptance === undefined ? {} : { acceptance: args.acceptance },
          ...args.verify === undefined ? {} : { verify: args.verify },
          ...args.inScope === undefined ? {} : { inScope: args.inScope },
          ...args.outOfScope === undefined ? {} : { outOfScope: args.outOfScope },
        }), CAPTAIN_KEY, args.reason)
        if (!result.ok || result.task === undefined) throw new Error(result.error ?? 'amend_task rejected by quality gates')
        Object.assign(task, result.task)
        await writeTeam(stateRoot, fresh)
        return {
          taskId: task.id,
          status: task.status,
          fields: result.revision?.fields ?? [],
          revisionCount: task.revisions?.length ?? 0,
          contract: {
            ...task.objective === undefined ? {} : { objective: task.objective },
            ...task.acceptance === undefined ? {} : { acceptance: task.acceptance },
            ...task.verify === undefined ? {} : { verify: task.verify },
            ...task.inScope === undefined ? {} : { inScope: task.inScope },
            ...task.outOfScope === undefined ? {} : { outOfScope: task.outOfScope },
          },
        }
      })
      appendTeamEvent(ctx, captainSessionOf(ctx, team.captainSessionId, captain.session), 'agent-teams/task-amended', {
        teamId: team.id,
        taskId: amended.taskId,
        fields: amended.fields,
        reason: args.reason,
      })
      return {
        task_id: amended.taskId,
        status: amended.status,
        revised_fields: amended.fields.join(', '),
        revision_count: amended.revisionCount,
        contract: JSON.stringify(amended.contract),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_send_message',
    description: 'Send a message to the captain or to a teammate. Messages go straight into the recipient\'s mailbox; when the captain agent is online the plugin also schedules live delivery (member recipients get the message as their next turn; a running captain sees it at the nearest model step). No relay is involved: teammates talk to each other directly, exactly like the Claude Code AgentTeams mailbox model.',
    parameters: {
      source_task_id: { type: 'string', description: 'Sender task paired with source_attempt_id for a member report.' },
      source_attempt_id: { type: 'string', description: 'Current source execution capability paired with source_task_id.' },
      to: { type: 'string', required: true, description: 'Recipient: "captain" or a member name.' },
      content: { type: 'string', required: true, description: 'The message text.' },
      from: { type: 'string', description: 'Sender (defaults to the caller: the captain, or the calling member).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          message_id: { type: 'string', required: true },
          from: { type: 'string', required: true },
          to: { type: 'string', required: true },
          delivered: { type: 'string', required: true, description: 'live (accepted by the live captain), wake (member recipient woken), or mailbox (durable inbox only).' },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: `Message ${value.message_id} ${value.from} → ${value.to} delivered via ${value.delivered}.`,
      }],
    },
    async execute(args, exec) {
      const caller = requireCaptain(exec)
      const workspace = workspaceOf(caller)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireParticipantTeam(ctx, workspace, config, caller)
      const to = args.to.trim()
      const prepared = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const { team: fresh, identity } = await requireFreshParticipant(ctx, stateRoot, team.id, caller.id)
        const from = identity.name
        // `from` may only be the caller's own identity: impersonating another
        // member (or the captain) would poison the mailbox and event records.
        if (args.from !== undefined && args.from !== from) {
          throw new Error(`agent_teams_send_message: "from" must be your own identity ("${from}"), not "${args.from}"`)
        }
        const sourceTaskId = args.source_task_id?.trim() || undefined
        const sourceAttemptId = args.source_attempt_id?.trim() || undefined
        if ((sourceTaskId === undefined) !== (sourceAttemptId === undefined)) {
          throw new Error('send_message requires source_task_id and source_attempt_id together')
        }
        const source = sourceTaskId === undefined
          ? identity.kind === 'member' ? memberOpenTask(fresh, identity.name) : undefined
          : requireTask(fresh, sourceTaskId)
        if (sourceTaskId !== undefined && (source?.assignee !== identity.name || source.attemptId !== sourceAttemptId)) {
          throw new Error('stale or foreign source attempt; stop sending results from the revoked task')
        }
        const sourceFields = source?.attemptId === undefined ? {} : {
          sourceTaskId: source.id,
          sourceAttemptId: source.attemptId,
          sourceTaskStatus: source.status,
        }
        if (to === CAPTAIN_KEY) {
          const message = { ...createMessage(from, CAPTAIN_KEY, args.content), ...sourceFields, deliveryClaimedAt: Date.now() }
          await appendMailbox(stateRoot, fresh.id, CAPTAIN_KEY, message)
          appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, caller.session), 'agent-teams/message-sent', {
            teamId: fresh.id,
            messageId: message.id,
            from,
            to: CAPTAIN_KEY,
            content: args.content,
            ts: message.ts,
          })
          return { kind: 'captain' as const, fresh, identity, message, from }
        }
        if (fresh.halted === true) {
          throw new Error(`team "${fresh.name}" is halted; call agent_teams_resume before waking a member`)
        }
        const recipient = requireMember(fresh, to)
        const owned = memberOpenTask(fresh, recipient.name)
        if (recipient.temporaryAdmission === true && owned === undefined && !hasCurrentTurnTemporaryAuthorization(caller)) {
          throw new Error(`member "${recipient.name}" is temporary; only an open assigned task may be messaged after the authorization turn`)
        }
        const message = {
          ...createMessage(from, recipient.name, args.content),
          ...sourceFields,
          deliveryClaimedAt: Date.now(),
          ...(owned?.attemptId === undefined ? {} : { taskId: owned.id, attemptId: owned.attemptId }),
        }
        await appendMailbox(stateRoot, fresh.id, recipient.name, message)
        appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, caller.session), 'agent-teams/message-sent', {
          teamId: fresh.id,
          messageId: message.id,
          from,
          to: recipient.name,
          content: args.content,
          ts: message.ts,
        })
        return { kind: 'member' as const, fresh, identity, message, from, recipient }
      })

      // Resolve a live lead only after releasing the state lock: the recorded
      // captain while resident, otherwise the nearest live fork descendant, so
      // a human working in a fork still receives member reports. The plugin
      // mailbox is already durable if no lead session is live.
      const captain = nearestLiveLead(ctx, prepared.fresh)
      if (prepared.kind === 'captain') {
        let delivered: 'live' | 'mailbox' = 'mailbox'
        if (captain !== undefined && prepared.identity.kind === 'member') {
          delivered = steerCaptainReport(
            captain,
            prepared.from,
            args.content,
            mailboxPrompt(prepared.fresh.id, CAPTAIN_KEY, [prepared.message]),
          ) ? 'live' : 'mailbox'
        }
        if (delivered === 'live') {
          await withTeamLock(teamLockKey(stateRoot, prepared.fresh.id), () => (
            markMailboxDelivered(stateRoot, prepared.fresh.id, CAPTAIN_KEY, [prepared.message.id])
          ))
        } else {
          await withTeamLock(teamLockKey(stateRoot, prepared.fresh.id), () => (
            releaseMailboxDelivery(stateRoot, prepared.fresh.id, CAPTAIN_KEY, [prepared.message.id])
          ))
        }
        return { message_id: prepared.message.id, from: prepared.from, to: CAPTAIN_KEY, delivered }
      }
      let delivered: 'wake' | 'mailbox' = 'mailbox'
      if (captain !== undefined) {
        const text = mailboxPrompt(prepared.fresh.id, prepared.recipient.name, [prepared.message])
        const accepted = await dispatchMember(
          captain,
          prepared.fresh.id,
          prepared.recipient.name,
          text,
          exec.signal,
          'steer',
          prepared.message.attemptId,
        )
        delivered = accepted ? 'wake' : 'mailbox'
        if (accepted) {
          await withTeamLock(teamLockKey(stateRoot, prepared.fresh.id), () => (
            markMailboxDelivered(stateRoot, prepared.fresh.id, prepared.recipient.name, [prepared.message.id])
          ))
        }
      }
      if (delivered === 'mailbox') {
        await withTeamLock(teamLockKey(stateRoot, prepared.fresh.id), () => (
          releaseMailboxDelivery(stateRoot, prepared.fresh.id, prepared.recipient.name, [prepared.message.id])
        ))
      }
      return {
        message_id: prepared.message.id,
        from: prepared.from,
        to: prepared.recipient.name,
        delivered,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_status',
    description: 'Read Team status. Summary omits task outputs and stable route details; use detail="full" for complete task reports or provider/model evidence. Read-only by default; set acknowledge=true only after processing the displayed mailbox entries. Do not busy-poll. Use wake="recover" only for a captain after restart or clearly stuck ready work/mail. Captains see all mail; members see their own inbox. No active Team returns a clean probe.',
    parameters: {
      detail: {
        type: 'string',
        enum: ['summary', 'full'],
        description: 'summary (default) or full for complete task outputs and stable route/profile details.',
      },
      wake: {
        type: 'string',
        enum: ['recover'],
        description: 'Captain-only recovery wake after restart or clearly stuck ready work/mail; omit for read-only status.',
      },
      acknowledge: {
        type: 'boolean',
        description: 'Explicitly consume the displayed unread mailbox entries after processing them; omitted/false is read-only.',
      },
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (args, value) => [{
        type: 'text',
        text: (value as { active?: unknown }).active === false
          ? renderInactiveTeamStatus(config)
          : renderStatus(value, args.detail === 'full' ? 'full' : 'summary'),
      }],
    },
    async execute(args, exec) {
      const caller = requireCaptain(exec)
      const callerId = durableSessionId(caller)
      const workspace = workspaceOf(caller)
      const stateRoot = stateRootOf(workspace, config)
      const located = await findTeamByParticipant(stateRoot, callerId, await leadIdentityOfAsync(ctx, caller.session))
      if (located === undefined) return { active: false }
      const leads = await sessionLeadsTeamAsync(ctx, located, callerId)
      const memberWakeIgnored = args.wake === 'recover' && !leads
      if (leads && args.wake === 'recover') {
        await scheduler.kickTeam(workspace, located.id, await memberOperationParent(ctx, located, caller))
      }
      const { team, identity } = await withTeamLock(
        teamLockKey(stateRoot, located.id),
        () => requireFreshParticipant(ctx, stateRoot, located.id, caller.id),
      )
      const activity = memberActivity(ctx, team.members.map((member) => member.id))
      const audit = auditTeamWorkspace(workspace, team)
      const members = team.members
        .filter((member) => member.status !== 'removed')
        .map((member) => ({
          name: member.name,
          role: member.role ?? '',
          provider: member.provider ?? '',
          model: member.model ?? '',
          reasoning_effort: member.reasoningEffort ?? '',
          tool_policy: member.toolPolicy ?? '',
          ...member.spawnError === undefined ? {} : { spawn_error: member.spawnError },
          status: member.status,
          activity: member.id !== '' ? (activity.get(member.id) ?? 'unknown') : 'unspawned',
        }))
      const tasks = team.tasks.map((task) => ({
        id: task.id,
        subject: task.subject,
        status: task.status,
        assignee: task.assignee ?? '',
        dependencies: task.dependencies,
        attempt: task.attempt ?? 0,
        attempt_id: task.attemptId ?? '',
        reassigning: task.reassigning === true,
        kind: taskKindOf(task),
        ...task.round === undefined ? {} : { round: task.round },
        ...task.verdict === undefined ? {} : { verdict: task.verdict },
        ...task.supplementalEvidence === undefined ? {} : { supplemental_evidence: JSON.stringify(task.supplementalEvidence) },
        ...task.findingSourceTaskIds === undefined ? {} : { fixes: task.findingSourceTaskIds.join(',') },
        findings_open: (task.findings ?? []).filter((finding) => finding.resolved !== true).length,
        evidence_source: task.completionEvidenceSource ?? 'unverified',
        audit_status: task.workspaceAudit?.status ?? 'missing',
        executor_observations: (task.executorEvidence ?? []).filter(row => row.attemptId === task.attemptId && row.contractHash === taskContractHash(task)).length,
        ...args.detail === 'full' ? {
          reported_commands: (task.commandsRun ?? []).map(row => ({ ...row })),
          executor_evidence: (task.executorEvidence ?? []).map(row => ({ ...row })),
          ...task.completionReportBasis === undefined ? {} : { report_basis: { ...task.completionReportBasis } },
          ...task.reviewBasis === undefined ? {} : { review_basis: { ...task.reviewBasis } },
        } : {},
        ...task.profileSeedId === undefined ? {} : { seed_id: task.profileSeedId },
        ...task.output !== undefined ? { output: task.output } : {},
      }))
      const mailboxWarnings: string[] = []
      let mailboxWarningCount = 0
      const mailboxMessageIds = new Map<string, string[]>()
      const reportMalformed = (agentKey: string) => (lineNumber: number): void => {
        mailboxWarningCount += 1
        if (mailboxWarnings.length < 10) {
          mailboxWarnings.push(`${agentKey} mailbox line ${lineNumber}`)
        }
      }
      const captainInbox = identity.kind === 'captain'
        ? await readUnreadMailbox(stateRoot, team.id, CAPTAIN_KEY, reportMalformed(CAPTAIN_KEY))
        : []
      if (identity.kind === 'captain') mailboxMessageIds.set(CAPTAIN_KEY, captainInbox.map(message => message.id))
      const memberInboxes: Record<string, { count: number; latest: string }> = {}
      const visibleMembers = identity.kind === 'captain'
        ? members
        : members.filter((member) => member.name === identity.name)
      for (const member of visibleMembers) {
        const messages = await readUnreadMailbox(
          stateRoot,
          team.id,
          member.name,
          reportMalformed(member.name),
        )
        mailboxMessageIds.set(member.name, messages.map(message => message.id))
        if (messages.length > 0) {
          memberInboxes[member.name] = {
            count: messages.length,
            latest: messages[messages.length - 1]?.content.slice(0, 200) ?? '',
          }
        }
      }
      const coverage = buildCoverageMatrix(
        [...new Set(team.tasks.flatMap((item) => item.coverageOf ?? []))],
        team.tasks,
      ).map((row) => ({
        goal_item: row.goal_item,
        task_ids: [...row.task_ids],
        status: row.status,
        ...row.evidence === undefined ? {} : { evidence: row.evidence },
      }))
      const deliveryCheck = canDeclareDelivery(team, audit)
      const delivery = {
        ok: deliveryCheck.ok,
        blockers: [...deliveryCheck.blockers],
        warnings: [...deliveryCheck.warnings],
      }
      const loop = describeQualityLoop(team, audit)
      const result = {
        active: true,
        team_id: team.id,
        team_name: team.name,
        description: team.description ?? '',
        phase: team.phase,
        halted: loop.halted,
        escalated: loop.escalated,
        loop_state: loop.state,
        loop_summary: loop.summary,
        deliverable: loop.deliverable,
        coverage,
        delivery,
        ...team.profile === undefined ? {} : {
          profile: {
            name: team.profile.name,
            ...team.profile.protocol === undefined
              ? {}
              : { protocol: team.profile.protocol },
            ...team.profile.taskPlanning === undefined ? {} : { task_planning: team.profile.taskPlanning },
          },
        },
        viewer: identity.name,
        members,
        tasks,
        captain_inbox: captainInbox.slice(-10).map((message) => ({
          from: message.from,
          content: message.content,
          ts: message.ts,
        })),
        member_inboxes: memberInboxes,
        mailbox_warnings: mailboxWarnings,
        mailbox_warning_count: mailboxWarningCount,
      }
      const statusKey = `${stateRoot}\u0000${team.id}\u0000${identity.name}`
      const fingerprint = statusFingerprint(result)
      const previousFingerprint = statusFingerprints.get(statusKey)
      statusFingerprints.set(statusKey, fingerprint)
      if (statusFingerprints.size > maxStatusFingerprints) {
        const oldestKey = statusFingerprints.keys().next().value
        if (oldestKey !== undefined) statusFingerprints.delete(oldestKey)
      }
      const acknowledged = args.acknowledge === true
        ? mailboxMessageIds.get(identity.kind === 'captain' ? CAPTAIN_KEY : identity.name) ?? []
        : []
      if (acknowledged.length > 0) {
        await withTeamLock(teamLockKey(stateRoot, team.id), () => (
          acknowledgeMailbox(stateRoot, team.id, identity.kind === 'captain' ? CAPTAIN_KEY : identity.name, acknowledged)
        ))
      }
      return {
        ...result,
        ...(memberWakeIgnored
          ? {
              wake_ignored: 'recover',
              recovery_started: false,
            }
          : {}),
        status_summary_unchanged: args.detail !== 'full' && previousFingerprint === fingerprint,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_resume',
    description: 'Explicitly resume a halted team. Requires a non-empty reason. Does not recreate cancelled tasks; only still-pending work is scheduled.',
    parameters: {
      reason: { type: 'string', required: true, description: 'Why the team is being resumed.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true },
          team_id: { type: 'string', required: true },
          reason: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.status === 'already_running'
          ? `Team ${value.team_id} is already running.`
          : `Team ${value.team_id} resumed (${value.reason}).`,
      }],
    },
    async execute(args, exec) {
      const captain = requireCaptain(exec)
      const captainId = durableSessionId(captain)
      const workspace = workspaceOf(captain)
      const stateRoot = stateRootOf(workspace, config)
      const team = await requireCaptainTeam(ctx, workspace, config, captain)
      const result = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id)
        const resumed = resumeTeamState(fresh, args.reason)
        if (resumed.status === 'rejected') throw new Error(resumed.error ?? 'resume rejected')
        if (resumed.status === 'resumed') {
          fresh.halted = false
          fresh.haltedAt = undefined
          await writeTeam(stateRoot, fresh)
          appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/team-resumed', {
            teamId: fresh.id,
            reason: args.reason,
          })
        }
        return {
          status: resumed.status,
          team_id: fresh.id,
          reason: args.reason,
        }
      })
      if (result.status === 'resumed') await scheduler.kickTeam(workspace, team.id, await liveLeadAnchorAgent(ctx, team, captain))
      return result
    },
  }))

  ctx.tools.register(defineTool({
    name: 'agent_teams_delete',
    description: 'End and archive your team after every member drains. A drain failure leaves the active Team fenced and unarchived for retry. This operation is idempotent when the caller has no active team.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          deleted: { type: 'boolean', required: true },
          team_name: { type: 'string', required: true },
        },
      },
      render: (args, value) => [{
        type: 'text',
        text: value.deleted ? `Team "${value.team_name}" deleted.` : 'No active Team; nothing to delete.',
      }],
    },
    async execute(_args, exec) {
      const captain = requireCaptain(exec)
      const captainId = durableSessionId(captain)
      const workspace = workspaceOf(captain)
      const stateRoot = stateRootOf(workspace, config)
      const team = await findTeamByCaptain(stateRoot, captainId, await leadIdentityOfAsync(ctx, captain.session))
      if (team === undefined) return { deleted: false, team_name: '' }
      const members = await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id)
        // Include previously removed members so deleting a pre-fix team also
        // retires durable catalog entries left behind by remove_member.
        const roster = fresh.members.map(member => ({ ...member }))
        for (const member of fresh.members) {
          await discardMailboxMessages(
            stateRoot,
            fresh.id,
            member.name,
            (await readUnreadMailbox(stateRoot, fresh.id, member.name)).map(message => message.id),
          )
          if (member.status === 'removed') continue
          member.status = 'removed'
          for (const task of fresh.tasks) {
            if (task.assignee === member.name && !TERMINAL_TASK_STATUSES.includes(task.status)) invalidateTaskAttempt(task)
          }
        }
        await writeTeam(stateRoot, fresh)
        return roster
      })
      // Retire before draining so any delivery queued behind this operation is
      // denied. interruptAndDrain holds each child lock through recursive host
      // cleanup; a drain rejection intentionally leaves the live Team fenced.
      await recordRetiredMemberIds(stateRoot, members.map(member => member.id))
      await stopTeamMemberActivations(ctx, await memberOperationParent(ctx, team, captain), members, exec.signal)
      await withTeamLock(teamLockKey(stateRoot, team.id), async () => {
        const fresh = await requireFreshCaptainTeam(ctx, stateRoot, team.id, captain.id)
        appendTeamEvent(ctx, captainSessionOf(ctx, fresh.captainSessionId, captain.session), 'agent-teams/team-deleted', {
          teamId: fresh.id,
        })
        // Archive, not delete: tasks (with their dependency graph) and the
        // mailboxes stay on disk for later review and dependency rebuilds.
        await archiveTeamDir(stateRoot, fresh.id)
      })
      return { deleted: true, team_name: team.name }
    },
  }))
  // Do this after every `agent_teams_*` registration. Existing continuable
  // members are hydrated synchronously and their policy must see the whole
  // tool registry, rather than an early partial registry during HMR.
  memberSelections = installMemberSelectionRuntime(
    ctx,
    config.stateDir,
    config.delegationPolicy,
    (workspace, teamId, memberName) => scheduler.kickMember(workspace, teamId, memberName),
  )
  return runtime
}

async function initializeProfileTeam(input: {
  ctx: Context
  config: ToolsConfig
  memberSelections: ReturnType<typeof installMemberSelectionRuntime>
  captain: Agent
  exec: ToolRunContext
  stateRoot: string
  teamName: string
  teamId: string
  profileName: string
  profiles: Readonly<Record<string, TeamProfileConfig>>
  inlinePlan?: TeamProfileConfig
  description?: string
  staged: boolean
}): Promise<{ committed: true; state: TeamState }> {
  const profile = resolveTeamProfile(input.inlinePlan === undefined ? input.profiles : { [input.profileName]: input.inlinePlan }, input.profileName, input.config.maxMembers)
  if (profile.taskPlanning === 'seed' && profile.tasks.length === 0) {
    throw new Error(`Profile "${profile.name}" is a fixed seed plan with no tasks; add its seed tasks before creating a Team`)
  }
  const selections: Awaited<ReturnType<typeof resolveMemberLlmSelection>>[] = []
  for (const template of profile.members) {
    selections.push(await resolveMemberLlmSelection(input.ctx, input.captain, {
      provider: template.provider,
      model: template.model,
      reasoningMode: template.reasoningMode,
      reasoningEffort: template.reasoningEffort,
      fallback: template.fallback ?? profile.fallback ?? input.config.fallback,
    }, input.exec.signal))
  }
  await validateMemberLlmSelections(input.ctx, selections, input.exec.signal)
  const now = Date.now()
  const seedToActual = new Map(profile.tasks.map((template, index) => [template.id, `t${index + 1}`] as const))
  const draft: TeamState = {
    schemaVersion: AGENT_TEAMS_STATE_SCHEMA_VERSION,
    name: input.teamName,
    id: input.teamId,
    description: input.description,
    profile: {
      name: profile.name,
      ...profile.description === undefined ? {} : { description: profile.description },
      ...profile.protocol === undefined ? {} : { protocol: profile.protocol },
      ...profile.executionPrompt === undefined ? {} : { executionPrompt: profile.executionPrompt },
      ...profile.fallback === undefined ? {} : { fallback: profile.fallback },
      taskPlanning: profile.taskPlanning,
      ...profile.reviewPolicy === undefined ? {} : { reviewPolicy: profile.reviewPolicy },
    },
    ...profile.reviewPolicy === undefined ? {} : { reviewPolicy: profile.reviewPolicy },
    captainSessionId: durableSessionId(input.captain),
    createdAt: now,
    planRevision: 1,
    phase: input.staged ? 'staged' as const : 'running' as const,
    ...input.staged
      ? { planReviewState: 'building' as const }
      : {
          approvedAt: now,
          approvedPlanRevision: 1,
          approvalSource: 'automatic' as const,
          approvalEvidenceId: `automatic:create:${input.teamId}`,
        },
    members: profile.members.map((template, index) => {
      const selection = selections[index]!
      // A profile member selects a policy by id; an unknown id fails here,
      // before the team directory and any child session exist (#59).
      const toolSelection = memberToolSelection(input.config, input.captain, template.toolPolicy)
      return {
        id: '',
        name: template.name,
        role: template.role,
        provider: selection.provider,
        model: selection.model,
        reasoningMode: selection.reasoningMode,
        reasoningEffort: selection.reasoningEffort,
        modelPolicySource: input.inlinePlan === undefined
          ? 'profile'
          : template.provider === undefined && template.model === undefined && template.reasoningMode === 'target-default' && template.reasoningEffort === undefined
            ? 'captain'
            : 'explicit',
        executionPrompt: template.executionPrompt ?? profile.executionPrompt ?? input.config.executionPrompt,
        ...selection.fallback === undefined ? {} : { fallback: selection.fallback },
        ...toolSelection,
        joinedAt: now,
        status: 'idle' as const,
      }
    }),
    tasks: profile.tasks.map((template, index) => ({
      id: `t${index + 1}`,
      profileSeedId: template.id,
      subject: template.subject,
      description: template.description,
      status: 'pending' as const,
      assignee: template.assignee,
      dependencies: template.dependencies.map((dependency) => seedToActual.get(dependency) ?? dependency),
      revision: 1,
      attempt: 0,
      kind: 'work' as const,
      createdAt: now,
      updatedAt: now,
    })),
    taskSeq: profile.tasks.length,
  }
  // Roster creation is durable planning only. The scheduler starts each
  // member with its first actual task once its dependencies are satisfied.
  if (input.inlinePlan !== undefined) delete draft.profile
  input.config.testObserver?.onInitializeProfileTeamPersistence?.('createTeamDir')
  await createTeamDir(input.stateRoot, draft)
  return { committed: true, state: draft }
}

function parseFindings(value: unknown): ReviewFinding[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('findings must be an array')
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`findings[${index}] must be an object`)
    }
    const raw = item as Record<string, unknown>
    if (typeof raw['id'] !== 'string' || raw['id'].trim() === '') throw new Error(`findings[${index}].id is required`)
    if (raw['severity'] !== 'low' && raw['severity'] !== 'medium' && raw['severity'] !== 'high' && raw['severity'] !== 'blocker') {
      throw new Error(`findings[${index}].severity is invalid`)
    }
    if (typeof raw['problem'] !== 'string' || raw['problem'].trim() === '') throw new Error(`findings[${index}].problem is required`)
    if (typeof raw['requiredFix'] !== 'string' || raw['requiredFix'].trim() === '') throw new Error(`findings[${index}].requiredFix is required`)
    return {
      id: raw['id'].trim(),
      severity: raw['severity'],
      problem: raw['problem'],
      requiredFix: raw['requiredFix'],
      ...typeof raw['file'] === 'string' && raw['file'].trim() !== '' ? { file: raw['file'] } : {},
      // Only a contract-valid line is persisted. A model that materializes
      // "no line number" as -1 (or sends a non-integer) must not write a record
      // the durable validator rejects on the next read, which used to brick the
      // entire team (issue #188). The predicate is shared with
      // `isReviewFinding`, so the two sides cannot drift apart again.
      ...isValidFindingLine(raw['line']) ? { line: raw['line'] } : {},
      ...typeof raw['resolved'] === 'boolean' ? { resolved: raw['resolved'] } : {},
    }
  })
}

function parseAcceptanceResults(value: unknown): AcceptanceResult[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('acceptanceResults must be an array')
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`acceptanceResults[${index}] must be an object`)
    }
    const raw = item as Record<string, unknown>
    if (typeof raw['criterion'] !== 'string' || raw['criterion'].trim() === '') {
      throw new Error(`acceptanceResults[${index}].criterion is required`)
    }
    if (raw['status'] !== 'passed' && raw['status'] !== 'failed') {
      throw new Error(`acceptanceResults[${index}].status must be passed or failed`)
    }
    return {
      criterion: raw['criterion'],
      status: raw['status'],
      ...typeof raw['evidence'] === 'string' ? { evidence: raw['evidence'] } : {},
    }
  })
}

function parseCommandResults(value: unknown): CommandResult[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error('commandsRun must be an array')
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`commandsRun[${index}] must be an object`)
    }
    const raw = item as Record<string, unknown>
    if (typeof raw['command'] !== 'string' || raw['command'].trim() === '') {
      throw new Error(`commandsRun[${index}].command is required`)
    }
    if (raw['status'] !== 'passed' && raw['status'] !== 'failed') {
      throw new Error(`commandsRun[${index}].status must be passed or failed`)
    }
    return {
      command: raw['command'],
      status: raw['status'],
      ...typeof raw['exitCode'] === 'number' ? { exitCode: raw['exitCode'] } : {},
      ...typeof raw['evidence'] === 'string' ? { evidence: raw['evidence'] } : {},
    }
  })
}

export function applyQualityFollowUp(
  team: TeamState,
  closed: TeamTask,
  snapshotPaths?: (paths: readonly string[]) => ArtifactSnapshot,
  pathExists?: (path: string) => boolean,
): { created: TeamTask[]; escalated: boolean; reason?: string; excludedFindings?: string[] } {
  const planned = planQualityFollowUp(team, closed, pathExists === undefined ? {} : { pathExists })
  if (planned.escalated === true) team.escalated = true
  const created: TeamTask[] = []
  const existing = [...team.tasks]
  const now = Date.now()
  const idBySubject = new Map<string, string>()
  for (const draft of planned.created) {
    team.taskSeq += 1
    const id = `t${team.taskSeq}`
    if (draft.id !== undefined) idBySubject.set(draft.id, id)
    if (draft.subject !== undefined) idBySubject.set(draft.subject, id)
    const dependencies = (draft.dependencies ?? []).map((dependency) => {
      if (team.tasks.some((item) => item.id === dependency)) return dependency
      return idBySubject.get(dependency) ?? dependency
    })
    // Record the workspace the generated work order was derived from, so a
    // later round that changes a cited file can mark it stale instead of
    // letting a member read a frozen snapshot as authoritative (issue #174).
    const contractSnapshot = draft.contractPaths === undefined || draft.contractPaths.length === 0 || snapshotPaths === undefined
      ? undefined
      : snapshotPaths(draft.contractPaths)
    const next: TeamTask = {
      id,
      subject: draft.subject ?? `${draft.kind}-round-${draft.round ?? 1}`,
      status: 'pending',
      assignee: draft.assignee,
      dependencies,
      revision: 1,
      attempt: 0,
      createdAt: now,
      updatedAt: now,
      kind: draft.kind,
      ...draft.description === undefined ? {} : { description: draft.description },
      ...draft.round === undefined ? {} : { round: draft.round },
      ...draft.objective === undefined ? {} : { objective: draft.objective },
      ...draft.inScope === undefined ? {} : { inScope: draft.inScope },
      ...draft.outOfScope === undefined ? {} : { outOfScope: draft.outOfScope },
      ...draft.acceptance === undefined ? {} : { acceptance: draft.acceptance },
      ...draft.verify === undefined ? {} : { verify: draft.verify },
      ...draft.sourceTaskId === undefined ? {} : { sourceTaskId: draft.sourceTaskId },
      ...draft.sourceFindingIds === undefined ? {} : { sourceFindingIds: draft.sourceFindingIds },
      ...draft.findingSourceTaskIds === undefined ? {} : { findingSourceTaskIds: draft.findingSourceTaskIds },
      ...draft.reviewedTaskId === undefined ? {} : { reviewedTaskId: idBySubject.get(draft.reviewedTaskId) ?? draft.reviewedTaskId },
      ...contractSnapshot === undefined ? {} : { contractSnapshot },
    }
    // Only host-generated continuation for the same admitted owner inherits the grant.
    const admissionSource = draft.kind === 'repair'
      ? existing.find(task => task.id === draft.sourceTaskId && (closed.reviewedTaskId ?? closed.sourceTaskId ?? reviewedTargetOf(team, closed)?.id) === task.id)
      : closed
    if (existing.includes(closed) && admissionSource?.temporaryAdmission === true
      && admissionSource.assignee === next.assignee
      && team.members.some(member => member.name === next.assignee && member.status !== 'removed' && member.temporaryAdmission === true)) {
      next.temporaryAdmission = true
    }
    team.tasks.push(next)
    created.push(next)
  }
  // A staged full delivery plan may already contain downstream integration
  // work that points at the first requirements/review gate. When that gate
  // opens an automatic revision loop, move only still-pending downstream
  // edges to the new terminal gate so the approved plan can continue after
  // the repair instead of waiting forever on an intentionally failed task.
  const replacement = created.at(-1)
  if (replacement !== undefined) {
    for (const task of existing) {
      if (task.status !== 'pending' || !task.dependencies.includes(closed.id)) continue
      task.dependencies = task.dependencies.map((dependency) => (
        dependency === closed.id ? replacement.id : dependency
      ))
      task.updatedAt = now
    }
  }
  return {
    created,
    escalated: planned.escalated === true,
    ...planned.reason === undefined ? {} : { reason: planned.reason },
    ...planned.excludedFindings === undefined ? {} : { excludedFindings: planned.excludedFindings },
  }
}

/** Build the `memberRuntime` config handed to member helpers. */
function memberRuntime(config: ToolsConfig): MemberRuntimeConfig {
  return {
    provider: config.memberProvider,
    maxDepth: config.memberMaxDepth,
    executionPrompt: config.executionPrompt,
    fallback: config.fallback,
  }
}

function markStagedPlanBuilding(team: TeamState): void {
  if (team.phase !== 'staged') return
  team.planReviewState = 'building'
  delete team.planReadyAt
}
