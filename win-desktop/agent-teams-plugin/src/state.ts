/**
 * Team state persistence and pure team-logic rules.
 *
 * State lives on disk under `<workspace>/<stateDir>/<teamId>/`:
 * - `team.json` — the durable {@link TeamState} record
 * - `inbox/<agentKey>.jsonl` — one JSONL mailbox per agent (`captain` or a
 *   member name), mirroring the Claude Code AgentTeams mailbox layout
 *
 * All mutations run through an in-process per-team queue so read-modify-write
 * stays serial; `fs/promises` is used directly because the plugin owns this
 * bookkeeping (host-plane state, like session persistence) and the abstract
 * `fs` service offers no directory deletion.
 * @module dsh-agent-teams/state
 */

import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, open, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { AGENT_TEAMS_STATE_SCHEMA_VERSION, TERMINAL_TASK_STATUSES, FINDING_SEVERITIES, REVIEW_VERDICTS, TASK_KINDS, type ReviewFinding, type TaskStatus, type TeamMember, type TeamMessage, type TeamProfileSnapshot, type TeamState, type TeamTask } from './types.ts'
import { hasValidQualityTaskFields, isReviewPolicy, isValidFindingLine, normalizeBlankOptionalTaskFields } from './quality-gates.ts'
import { isAttemptWorkspaceAudit } from './workspace-audit.ts'
import { MEMBER_POLICY_SOURCES } from './selection-policy.ts'
import type { MemberToolFilter } from './tool-policies.ts'
import { teamLeadMatch, type LeadIdentity } from './lineage.ts'

export {
  buildCoverageMatrix,
  amendTaskContract,
  canDeclareDelivery,
  classifyChangedPath,
  collectChangedPaths,
  defaultQualityDeliveryGraph,
  describeQualityLoop,
  evaluateQualityCompletion,
  hasValidQualityTaskFields,
  isQualityKind,
  isValidFindingLine,
  normalizeBlankOptionalTaskFields,
  pathMatchesScope,
  planQualityFollowUp,
  qualityPlanningPrompt,
  resumeTeamState,
  sanitizeReviewAcceptance,
  sanitizeReviewObjective,
  taskKindOf,
  validateCreateTask,
} from './quality-gates.ts'

/** Mailbox key of the captain. */
export const CAPTAIN_KEY = 'captain'
/** A crashed live-delivery attempt becomes retryable after this interval. */
const MAILBOX_DELIVERY_LEASE_MS = 60_000
/** Durable deny-list for AgentTeams members that must never be resumed. */
const RETIRED_MEMBERS_FILE = 'retired-members.json'

/** In-process per-team mutation queues (promise chains). */
const locks = new Map<string, Promise<unknown>>()

/**
 * Serialize mutations of one team across the whole process.
 * @param key - the team id (or any mutation scope).
 * @param fn - the mutation to run exclusively.
 * @returns the mutation's result.
 */
export async function withTeamLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const tail = previous.then(() => gate)
  locks.set(key, tail)
  await previous
  try {
    return await fn()
  } finally {
    release()
    if (locks.get(key) === tail) locks.delete(key)
  }
}

/** Keys with an in-process lock queue, for diagnostics and leak checks. */
export function teamLockQueueKeys(): readonly string[] {
  return [...locks.keys()]
}

function stateFileLockKey(file: string): string {
  const path = resolve(file)
  return `state-file:${process.platform === 'win32' ? path.toLowerCase() : path}`
}

// Windows cannot replace a target while our own asynchronous reader holds it.
function readStateText(file: string): Promise<string> {
  return withTeamLock(stateFileLockKey(file), () => readFile(file, 'utf8'))
}

/** Longest key emitted before truncating and appending a digest. */
const MAX_KEY_LENGTH = 48

/** Short stable digest, used to keep otherwise-colliding keys distinct. */
function keyDigest(name: string): string {
  return createHash('sha256').update(name).digest('hex').slice(0, 8)
}

/**
 * Fold a free-form name into a safe path/key segment.
 *
 * Unicode letters and digits survive, so CJK/Cyrillic/Greek names stay
 * distinct and readable; everything else — spaces, punctuation, path
 * separators, control characters — folds to `-`. An ASCII-only whitelist
 * mapped *every* non-Latin name onto one shared fallback, which silently
 * merged their mailboxes and rejected the second such member as a duplicate.
 *
 * A name with no letters or digits at all (pure emoji or punctuation) cannot
 * yield a readable key, so it gets a digest rather than a shared constant.
 * Over-long names are truncated with a digest appended, so names sharing a
 * long prefix stay distinct and the result stays within filesystem limits
 * (CJK costs 3 bytes per character in UTF-8).
 *
 * @param name - any user-supplied name.
 * @returns a non-empty key safe as a single path segment.
 */
export function sanitizeKey(name: string): string {
  const cleaned = name.normalize('NFC').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  if (cleaned === '') return `k-${keyDigest(name)}`
  const points = [...cleaned]
  if (points.length > MAX_KEY_LENGTH) {
    return `${points.slice(0, MAX_KEY_LENGTH).join('')}-${keyDigest(name)}`
  }
  return cleaned
}

/**
 * Whether `dependencies` are all satisfied (every named task exists and
 * completed) for the given task list.
 * @param tasks - the team's tasks.
 * @param dependencies - task ids the candidate depends on.
 * @returns the ids that are still unsatisfied, empty when claimable.
 */
export function unsatisfiedDependencies(tasks: TeamTask[], dependencies: string[]): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  return dependencies.filter((id) => byId.get(id)?.status !== 'completed')
}

/**
 * The allowed task status transitions, keyed by current status.
 * Terminal statuses have no outgoing transitions.
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  pending: ['claimed', 'cancelled'],
  claimed: ['in_progress', 'failed', 'cancelled'],
  in_progress: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
}

/**
 * Validate one task status transition.
 * @param current - the task's current status.
 * @param next - the requested status.
 * @returns the transition error, or undefined when allowed.
 */
export function transitionError(current: TaskStatus, next: TaskStatus): string | undefined {
  if (current === next) return undefined
  if (!TASK_TRANSITIONS[current].includes(next)) {
    return `task status cannot move from "${current}" to "${next}"`
  }
  return undefined
}

/** Reject a stale model/tool mutation before it changes the task. */
export function assertExpectedTaskRevision(task: TeamTask, expectedRevision: number): void {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error('expected_revision must be a positive safe integer')
  }
  if (task.revision !== expectedRevision) {
    throw new Error(`stale task ${task.id} revision ${expectedRevision}; current revision is ${task.revision}`)
  }
}

/** Reject a stale staged-plan mutation before it changes the reviewable graph. */
export function assertExpectedPlanRevision(team: TeamState, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 1) {
    throw new Error('expected_plan_revision must be a positive safe integer')
  }
  if (team.planRevision !== expected) {
    throw new Error(`stale plan revision ${expected}; current revision is ${team.planRevision}`)
  }
}

function taskWithoutRevision(task: TeamTask): Omit<TeamTask, 'revision'> {
  const { revision: _revision, ...content } = task
  return content
}

function reviewablePlan(team: Pick<TeamState, 'members' | 'tasks'>): unknown {
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

/** Materialize revision 1 for new tasks and advance changed persisted tasks exactly once. */
function advanceTaskRevisions(previous: Pick<TeamState, 'tasks'> | undefined, next: TeamState): void {
  const previousById = new Map(previous?.tasks.map((task) => [task.id, task]) ?? [])
  for (const task of next.tasks) {
    const prior = previousById.get(task.id)
    if (prior === undefined) {
      if ((task as Partial<TeamTask>).revision === undefined) task.revision = 1
      if (task.revision !== 1) throw new Error(`new task ${task.id} must begin at revision 1`)
      continue
    }
    const changed = !deepEqualJson(taskWithoutRevision(prior), taskWithoutRevision(task))
    const expected = changed ? prior.revision + 1 : prior.revision
    if (task.revision !== prior.revision && task.revision !== expected) {
      throw new Error(`task ${task.id} revision is not contiguous: expected ${expected}, got ${task.revision}`)
    }
    task.revision = expected
  }
}

type RevisionSnapshot = Pick<TeamState, 'members' | 'tasks' | 'planRevision' | 'phase'>

function advancePlanRevision(previous: RevisionSnapshot | undefined, next: TeamState): void {
  if (previous === undefined) {
    if (next.planRevision !== 1) throw new Error('new Team planRevision must begin at 1')
    return
  }
  const changed = previous.phase === 'staged'
    && next.phase === 'staged'
    && !deepEqualJson(reviewablePlan(previous), reviewablePlan(next))
  const expected = changed ? previous.planRevision + 1 : previous.planRevision
  if (next.planRevision !== previous.planRevision && next.planRevision !== expected) {
    throw new Error(`Team planRevision is not contiguous: expected ${expected}, got ${next.planRevision}`)
  }
  next.planRevision = expected
}

/**
 * Read only the prior task revisions needed by the write path.
 *
 * This deliberately does not call {@link readTeam}: tests and recovery code
 * must be able to persist a malformed V2 fixture so that the strict read /
 * authorization boundary can reject it on the next load. The schema and task
 * revision fields still remain fail-closed, so this is not a legacy migration
 * path.
 */
async function readRevisionSnapshot(
  stateRoot: string,
  teamId: string,
): Promise<RevisionSnapshot | undefined> {
  try {
    const raw = await readStateText(join(stateRoot, teamId, 'team.json'))
    const parsed: unknown = JSON.parse(stripLeadingBom(raw))
    if (!isRecord(parsed) || parsed['schemaVersion'] !== AGENT_TEAMS_STATE_SCHEMA_VERSION) {
      throw new Error(`旧版 AgentTeams 状态不受支持，请创建新 Team`)
    }
    if (!Array.isArray(parsed['members']) || !Array.isArray(parsed['tasks'])) {
      throw new Error(`AgentTeams V2 状态无效: ${teamId}`)
    }
    if (parsed['tasks'].some((task) => (
      !isRecord(task)
      || typeof task['id'] !== 'string'
      || !Number.isSafeInteger(task['revision'])
      || (task['revision'] as number) < 1
    ))) {
      throw new Error(`AgentTeams V2 状态无效: ${teamId}`)
    }
    if (!Number.isSafeInteger(parsed['planRevision']) || (parsed['planRevision'] as number) < 1) {
      throw new Error(`AgentTeams V2 状态无效: ${teamId}`)
    }
    if (parsed['phase'] !== 'staged' && parsed['phase'] !== 'running') {
      throw new Error(`AgentTeams V2 状态无效: ${teamId}`)
    }
    return {
      members: parsed['members'] as TeamMember[],
      tasks: parsed['tasks'] as TeamTask[],
      planRevision: parsed['planRevision'] as number,
      phase: parsed['phase'],
    }
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

/** Activate the task's current generation for one owner and return its capability id. */
export function activateTaskAttempt(task: TeamTask, assignee: string): string {
  const attemptId = randomUUID()
  task.status = 'claimed'
  task.assignee = assignee
  task.attemptId = attemptId
  task.handoffId = undefined
  task.reassigning = false
  clearAttemptResult(task)
  task.updatedAt = Date.now()
  return attemptId
}

/** Start a fresh task generation for one owner. */
export function beginTaskAttempt(task: TeamTask, assignee: string): string {
  task.attempt = (task.attempt ?? 0) + 1
  return activateTaskAttempt(task, assignee)
}

/**
 * Revoke the current worker immediately. Clearing its capability makes old
 * updates stale; a separate handoff generation serializes async quiescence.
 */
/** Cancel one unfinished task without returning it to the ready pool. */
export function cancelUnfinishedTask(task: TeamTask, output?: string): void {
  if (TERMINAL_TASK_STATUSES.includes(task.status)) return
  task.status = 'cancelled'
  task.attemptId = undefined
  task.workspaceAudit = undefined
  task.handoffId = undefined
  task.reassigning = false
  if (output !== undefined) task.output = output
  task.updatedAt = Date.now()
}

export function invalidateTaskAttempt(
  task: TeamTask,
  nextAssignee?: string,
  reassigning = false,
): void {
  task.attemptId = undefined
  task.handoffId = randomUUID()
  task.status = 'pending'
  task.assignee = nextAssignee
  task.reassigning = reassigning
  clearAttemptResult(task)
  task.updatedAt = Date.now()
}

/** A fresh attempt must not inherit terminal evidence from a revoked owner. */
function clearAttemptResult(task: TeamTask): void {
  task.workspaceAudit = undefined
  task.noChangesReason = undefined
  task.executorEvidence = undefined
  task.completionEvidenceSource = undefined
  task.completionReportBasis = undefined
  task.reviewBasis = undefined
  task.reviewCodeVersion = undefined
  task.output = undefined
  task.verdict = undefined
  task.findings = undefined
  task.changedPaths = undefined
  task.acceptanceResults = undefined
  task.commandsRun = undefined
}

/**
 * Create the team directory structure and the initial team record.
 * @param stateRoot - resolved absolute state root directory.
 * @param state - the initial team record.
 */
export async function createTeamDir(stateRoot: string, state: TeamState): Promise<void> {
  const dir = join(stateRoot, state.id)
  await mkdir(join(dir, 'inbox'), { recursive: true })
  advanceTaskRevisions(undefined, state)
  advancePlanRevision(undefined, state)
  await atomicWriteText(join(dir, 'team.json'), JSON.stringify(state, null, 2))
}

/**
 * Read one team record; `undefined` when absent.
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team's sanitized id.
 */
export async function readTeam(stateRoot: string, teamId: string): Promise<TeamState | undefined> {
  try {
    const raw = await readStateText(join(stateRoot, teamId, 'team.json'))
    const value: unknown = JSON.parse(stripLeadingBom(raw))
    if (!isRecord(value) || value.schemaVersion !== AGENT_TEAMS_STATE_SCHEMA_VERSION) {
      throw new Error('旧版 AgentTeams 状态不受支持，请创建新 Team')
    }
    if (!isTeamState(value, teamId)) throw new Error(`AgentTeams V2 状态无效: ${teamId}: ${describeTeamStateDefect(value, teamId)}`)
    return value
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

/**
 * Synchronously read one team record while a continuable child is being
 * composed. Harness requires child setup contributions to be synchronous;
 * this narrow boundary lets a cold-resumed member restore its durable model
 * selection before its first request can be published.
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team's sanitized id.
 * @returns the team record, or `undefined` when absent.
 */
export function readTeamSync(stateRoot: string, teamId: string): TeamState | undefined {
  try {
    const raw = readFileSync(join(stateRoot, teamId, 'team.json'), 'utf8')
    const value: unknown = JSON.parse(stripLeadingBom(raw))
    if (!isRecord(value) || value.schemaVersion !== AGENT_TEAMS_STATE_SCHEMA_VERSION) {
      throw new Error('旧版 AgentTeams 状态不受支持，请创建新 Team')
    }
    if (!isTeamState(value, teamId)) throw new Error(`AgentTeams V2 状态无效: ${teamId}: ${describeTeamStateDefect(value, teamId)}`)
    return value
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

/**
 * Persist one team record (inside the caller's lock).
 * @param stateRoot - resolved absolute state root directory.
 * @param state - the record to persist.
 */
export async function writeTeam(stateRoot: string, state: TeamState): Promise<TeamState> {
  const teamId = state.id
  const previous = await readRevisionSnapshot(stateRoot, teamId)
  const staged = structuredClone(state)
  advanceTaskRevisions(previous, staged)
  advancePlanRevision(previous, staged)
  await atomicWriteText(join(stateRoot, teamId, 'team.json'), JSON.stringify(staged, null, 2))
  state.planRevision = staged.planRevision
  staged.tasks.forEach((task, index) => { state.tasks[index]!.revision = task.revision })
  return state
}

export async function readRetiredMemberIds(stateRoot: string): Promise<Set<string>> {
  try {
    const parsed: unknown = JSON.parse(stripLeadingBom(
      await readStateText(join(stateRoot, RETIRED_MEMBERS_FILE)),
    ))
    if (!Array.isArray(parsed) || parsed.some(value => typeof value !== 'string' || value === '')) {
      throw new Error('invalid AgentTeams retired member index')
    }
    return new Set(parsed)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return new Set()
    }
    throw error
  }
}

/** Atomically add session ids to the durable retired-member deny-list. */
export async function recordRetiredMemberIds(stateRoot: string, memberIds: readonly string[]): Promise<void> {
  const additions = memberIds.filter(id => id !== '')
  if (additions.length === 0) return
  await withTeamLock(`retired-members:${stateRoot}`, async () => {
    const retired = await readRetiredMemberIds(stateRoot)
    for (const id of additions) retired.add(id)
    await mkdir(stateRoot, { recursive: true })
    await atomicWriteText(
      join(stateRoot, RETIRED_MEMBERS_FILE),
      `${JSON.stringify([...retired].sort(), null, 2)}\n`,
    )
  })
}

/**
 * Find the team owned by one captain session (at most one per captain).
 * @param stateRoot - resolved absolute state root directory.
 * @param captainSessionId - the owning session id.
 * @param lead - durable lead identity of the calling session, when it may lead
 *   through a fork chain; omitted keeps the exact-id contract.
 * @returns the team record, or undefined when the captain leads no team.
 */
export async function findTeamByCaptain(
  stateRoot: string,
  captainSessionId: string,
  lead?: LeadIdentity,
): Promise<TeamState | undefined> {
  let entries
  try {
    entries = await readdir(stateRoot, { withFileTypes: true })
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  let found: TeamState | undefined
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const team = await readTeam(stateRoot, entry.name)
    if (team !== undefined && (team.captainSessionId === captainSessionId
      || (lead !== undefined && teamLeadMatch(team, lead)))) {
      if (found !== undefined && found.id !== team.id) {
        throw new Error(`captain session leads multiple active teams ("${found.id}", "${team.id}"); archive one before continuing`)
      }
      found = team
    }
  }
  return found
}

/**
 * Find the team in which one session is an active participant.
 * Captains match `captainSessionId` — including a lead session that inherited
 * it through a fork — and members match their durable child session id.
 * Removed members no longer have access to team-scoped tools.
 * @param stateRoot - resolved absolute state root directory.
 * @param agentSessionId - calling captain/member session id.
 * @param lead - durable lead identity of the calling session, when available.
 * @returns the team record, or undefined when the caller belongs to no team.
 */
export async function findTeamByParticipant(
  stateRoot: string,
  agentSessionId: string,
  lead?: LeadIdentity,
): Promise<TeamState | undefined> {
  let entries
  try {
    entries = await readdir(stateRoot, { withFileTypes: true })
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  let found: TeamState | undefined
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const team = await readTeam(stateRoot, entry.name)
    const participates = team !== undefined && (team.captainSessionId === agentSessionId
      || (lead !== undefined && teamLeadMatch(team, lead))
      || team.members.some((member) => member.id === agentSessionId && member.status !== 'removed'))
    if (participates && team !== undefined) {
      if (found !== undefined && found.id !== team.id) {
        throw new Error(`agent session belongs to multiple active teams ("${found.id}", "${team.id}"); the target team is ambiguous`)
      }
      found = team
    }
  }
  return found
}

/** Build a fresh message record. */
export function createMessage(from: string, to: string, content: string): TeamMessage {
  return { id: randomUUID(), from, to, content, ts: Date.now() }
}

/**
 * Append one message to an agent's mailbox (JSONL).
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team id.
 * @param agentKey - `captain` or a member name.
 * @param message - the message to append.
 */
export async function appendMailbox(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  message: TeamMessage,
): Promise<void> {
  const file = join(stateRoot, teamId, 'inbox', `${sanitizeKey(agentKey)}.jsonl`)
  await mkdir(join(stateRoot, teamId, 'inbox'), { recursive: true })
  let existing = ''
  try {
    existing = await readStateText(file)
  } catch (error: unknown) {
    if (!(error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
      throw error
    }
  }
  const separator = existing !== '' && !existing.endsWith('\n') ? '\n' : ''
  await atomicWriteText(file, `${existing}${separator}${JSON.stringify(message)}\n`)
}

/**
 * Read one agent's whole mailbox, oldest first.
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team id.
 * @param agentKey - `captain` or a member name.
 * @param onMalformedLine - optional diagnostic hook; malformed records are
 * skipped so one manually damaged line cannot make the whole team unreadable.
 * @returns the messages, empty when the mailbox does not exist yet.
 */
export async function readMailbox(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  onMalformedLine?: (lineNumber: number, error: unknown) => void,
): Promise<TeamMessage[]> {
  const file = join(stateRoot, teamId, 'inbox', `${sanitizeKey(agentKey)}.jsonl`)
  try {
    const raw = await readStateText(file)
    const messages: TeamMessage[] = []
    for (const [index, rawLine] of raw.split('\n').entries()) {
      const line = stripLeadingBom(rawLine)
      if (line.trim() === '') continue
      let value: unknown
      try {
        value = JSON.parse(line)
      } catch {
        onMalformedLine?.(index + 1, new Error('invalid JSON'))
        continue
      }
      if (!isTeamMessage(value)) {
        onMalformedLine?.(index + 1, new Error('invalid message shape'))
        continue
      }
      messages.push(value)
    }
    return messages
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

/** Read only messages that have not been acknowledged by their recipient. */
export async function readUnreadMailbox(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  onMalformedLine?: (lineNumber: number, error: unknown) => void,
): Promise<TeamMessage[]> {
  return (await readMailbox(stateRoot, teamId, agentKey, onMalformedLine))
    .filter(message => message.readAt === undefined && message.discardedAt === undefined)
}

/** Pending delivery is distinct from delivered-but-not-yet-read input. */
export async function readPendingMailbox(stateRoot: string, teamId: string, agentKey: string): Promise<TeamMessage[]> {
  const now = Date.now()
  return (await readUnreadMailbox(stateRoot, teamId, agentKey))
    .filter(message => message.deliveredAt === undefined
      && (message.deliveryClaimedAt === undefined
        || now - message.deliveryClaimedAt >= MAILBOX_DELIVERY_LEASE_MS))
}

async function mutateMailbox(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  messageIds: readonly string[],
  mutate: (message: TeamMessage) => TeamMessage,
): Promise<void> {
  if (messageIds.length === 0) return
  const file = join(stateRoot, teamId, 'inbox', `${sanitizeKey(agentKey)}.jsonl`)
  let raw: string
  try {
    raw = await readStateText(file)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  const selected = new Set(messageIds)
  const lines = raw.split('\n').map((rawLine) => {
    const line = stripLeadingBom(rawLine)
    if (line.trim() === '') return rawLine
    try {
      const value: unknown = JSON.parse(line)
      if (!isTeamMessage(value) || !selected.has(value.id)) return rawLine
      return JSON.stringify(mutate(value))
    } catch {
      return rawLine
    }
  })
  await atomicWriteText(file, lines.join('\n'))
}

/** Lease selected fallback messages to one delivery path. */
export async function claimMailboxDelivery(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  messageIds: readonly string[],
): Promise<void> {
  const now = Date.now()
  await mutateMailbox(stateRoot, teamId, agentKey, messageIds, message => ({
    ...message,
    deliveryClaimedAt: now,
  }))
}

/** Release a failed delivery lease so the scheduler can retry it later. */
export async function releaseMailboxDelivery(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  messageIds: readonly string[],
): Promise<void> {
  await mutateMailbox(stateRoot, teamId, agentKey, messageIds, (message) => {
    const { deliveryClaimedAt: _claimed, ...released } = message
    return released
  })
}

/**
 * Mark selected durable mailbox records delivered/read while preserving
 * malformed lines for diagnostics. Callers serialize this with the team lock.
 */
export async function acknowledgeMailbox(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  messageIds: readonly string[],
): Promise<void> {
  const now = Date.now()
  await mutateMailbox(stateRoot, teamId, agentKey, messageIds, (message) => {
    const { deliveryClaimedAt: _claimed, ...rest } = message
    return {
      ...rest,
      deliveredAt: message.deliveredAt ?? now,
      readAt: message.readAt ?? now,
    }
  })
}

/** Acceptance by Harness is not evidence that a model step consumed input. */
export async function markMailboxDelivered(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  messageIds: readonly string[],
): Promise<void> {
  await mutateMailbox(stateRoot, teamId, agentKey, messageIds, (message) => {
    const { deliveryClaimedAt: _claimed, ...rest } = message
    return { ...rest, deliveredAt: message.deliveredAt ?? Date.now() }
  })
}

export async function discardMailboxMessages(
  stateRoot: string,
  teamId: string,
  agentKey: string,
  messageIds: readonly string[],
): Promise<void> {
  await mutateMailbox(stateRoot, teamId, agentKey, messageIds, message => ({ ...message, discardedAt: message.discardedAt ?? Date.now() }))
}

/** Remove the optional UTF-8 BOM some editors prepend to JSON text. */
function stripLeadingBom(value: string): string {
  return value.charCodeAt(0) === 0xFEFF ? value.slice(1) : value
}

/** Bounded rename attempts; a busy target keeps its previous committed bytes. */
const ATOMIC_RENAME_RETRIES = 3
/** Four attempts span 750ms; real Windows readers can outlast the old 150ms window. */
const ATOMIC_RENAME_RETRY_DELAY_MS = 250
/**
 * Rename error codes worth retrying before surfacing the failure. On
 * Windows, replacing an existing file whose target is momentarily held open
 * without FILE_SHARE_DELETE surfaces as EPERM (or EACCES/EBUSY variants);
 * EEXIST/ENOTEMPTY cover other "target busy" edge shapes.
 */
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'EEXIST', 'ENOTEMPTY'])

function isRetryableRenameError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && RETRYABLE_RENAME_CODES.has((error as NodeJS.ErrnoException).code ?? '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Filesystem primitives used by {@link replaceFileAtomicOrDirect}; injectable for tests. */
export interface AtomicReplacePrimitives {
  rename: (from: string, to: string) => Promise<void>
  writeFile: (file: string, content: string) => Promise<void>
  remove: (file: string) => Promise<void>
}

/** Tuning knobs for {@link replaceFileAtomicOrDirect} (defaults match production). */
export interface AtomicReplaceOptions {
  /** Rename retries before failure (default 3). */
  retries?: number
  /** Delay between rename attempts in ms (default 50). */
  retryDelayMs?: number
}

/**
 * Commit by same-directory rename. A direct overwrite could truncate the only
 * committed record before a crash, so exhausted Windows lock retries fail.
 * The exported name and injectable signature remain compatible with callers.
 */
export async function replaceFileAtomicOrDirect(
  temporary: string,
  file: string,
  content: string,
  primitives: AtomicReplacePrimitives,
  options: AtomicReplaceOptions = {},
): Promise<void> {
  const retries = options.retries ?? ATOMIC_RENAME_RETRIES
  const retryDelayMs = options.retryDelayMs ?? ATOMIC_RENAME_RETRY_DELAY_MS
  for (let attempt = 0; ; attempt += 1) {
    try {
      await primitives.rename(temporary, file)
      return
    } catch (error: unknown) {
      if (isRetryableRenameError(error) && attempt < retries) {
        await sleep(retryDelayMs)
        continue
      }
      await primitives.remove(temporary).catch(() => undefined)
      throw error
    }
  }
}

/**
 * Flush a complete temp file before atomic replacement. Readers only use the
 * committed filename; crash leftovers are never promoted into committed state.
 */
async function atomicWriteText(file: string, content: string): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, 'wx')
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch (error: unknown) {
    await rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
  await withTeamLock(stateFileLockKey(file), () => replaceFileAtomicOrDirect(temporary, file, content, {
    rename: (from, to) => rename(from, to),
    writeFile: (target, payload) => writeFile(target, payload, 'utf8'),
    remove: (path) => rm(path, { force: true }),
  }))
}

/** Whether a parsed JSON value is a plain record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a value is an optional string. */
function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

/** Whether a value is a non-empty (non-blank) string. */
function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** Whether a value is an absent or non-blank string (a persisted id/name). */
function isOptionalNonBlankString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.trim() !== '')
}

/** Whether a value is a non-empty list of non-blank tool names. */
function isToolNameList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every(name => typeof name === 'string' && name.trim() !== '')
}

/**
 * Validate one persisted effective tool filter (#59). `deny` is part of the
 * contract and never empty (the captain-only deny list is always included); an
 * `allow` list, when present, is non-empty for the same reason. A wrong-typed
 * or empty list is rejected instead of being silently accepted at the durable
 * boundary — the same class of drift #188 fixed for team records.
 */
function isMemberToolFilter(value: unknown): value is MemberToolFilter {
  if (!isRecord(value)) return false
  const allow = value['allow']
  const deny = value['deny']
  if (allow !== undefined && !isToolNameList(allow)) return false
  return isToolNameList(deny)
}

/** Whether a value is a finite timestamp/counter number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Validate one member record at the durable JSON boundary. */
function isTeamMember(value: unknown): value is TeamMember {
  if (!isRecord(value)) return false
  return typeof value['id'] === 'string'
    && typeof value['name'] === 'string'
    && value['name'].trim() !== ''
    && isOptionalString(value['role'])
    && isOptionalString(value['spawnError'])
    && (value['stopping'] === undefined || typeof value['stopping'] === 'boolean')
    && typeof value['provider'] === 'string'
    && value['provider'].trim() !== ''
    && typeof value['model'] === 'string'
    && value['model'].trim() !== ''
    && (value['reasoningMode'] === 'target-default' || value['reasoningMode'] === 'route-aware' || value['reasoningMode'] === 'explicit')
    && isOptionalString(value['reasoningEffort'])
    && (value['modelPolicySource'] === undefined || MEMBER_POLICY_SOURCES.some(source => source === value['modelPolicySource']))
    && (value['temporaryAdmission'] === undefined || value['temporaryAdmission'] === true)
    && isOptionalString(value['activeProvider'])
    && isOptionalString(value['activeModel'])
    && (value['executionPrompt'] === undefined || typeof value['executionPrompt'] === 'string')
    && (value['fallback'] === undefined || (isRecord(value['fallback']) && typeof value['fallback']['provider'] === 'string' && typeof value['fallback']['model'] === 'string'))
    && (value['fallbackActive'] === undefined || typeof value['fallbackActive'] === 'boolean')
    // A member without a policy keeps the legacy shape: both fields stay absent.
    && isOptionalNonBlankString(value['toolPolicy'])
    && (value['toolFilter'] === undefined || isMemberToolFilter(value['toolFilter']))
    && (value['runtimeSetup'] === undefined || (isRecord(value['runtimeSetup'])
      && typeof value['runtimeSetup']['persona'] === 'string'
      && isMemberToolFilter(value['runtimeSetup']['toolFilter'])))
    && isFiniteNumber(value['joinedAt'])
    && (value['status'] === 'idle' || value['status'] === 'working' || value['status'] === 'removed')
}

/** Validate one task record at the durable JSON boundary. */
function isTeamProfileSnapshot(value: unknown): value is TeamProfileSnapshot {
  return isRecord(value)
    && typeof value['name'] === 'string'
    && value['name'].trim() !== ''
    && isOptionalString(value['description'])
    && isOptionalString(value['protocol'])
    && (value['executionPrompt'] === undefined || typeof value['executionPrompt'] === 'string')
    && (value['fallback'] === undefined || (isRecord(value['fallback']) && typeof value['fallback']['provider'] === 'string' && typeof value['fallback']['model'] === 'string'))
    && (value['taskPlanning'] === undefined || value['taskPlanning'] === 'captain' || value['taskPlanning'] === 'seed')
    && (value['reviewPolicy'] === undefined || isReviewPolicy(value['reviewPolicy']))
}

/**
 * Name the first durable defect in a record `coerceTeamState` rejected. Before
 * this, a rejected `team.json` surfaced only as
 * `invalid AgentTeams state in team "x"` — no task, no field, no value — while
 * every AgentTeams tool (read *and* write) failed at once, leaving an operator
 * to bisect the file by hand (issue #188). The detail is computed only on the
 * failure path, so the happy path keeps its existing cost.
 * @param raw - the parsed record as read from disk, before coercion.
 * @param expectedId - the team id the record was read for.
 * @returns a `task "t2": findings[0].line -1 must be ...` style detail.
 */
export function describeTeamStateDefect(raw: unknown, expectedId: string): string {
  if (!isRecord(raw)) return 'record must be a JSON object'
  if (!Array.isArray(raw['tasks'])) {
    return raw['tasks'] === undefined ? 'tasks is missing' : `tasks must be an array (got ${typeof raw['tasks']})`
  }
  const tasks = (raw['tasks'] as unknown[]).map((task) => isRecord(task) ? normalizeBlankOptionalTaskFields(task) : task)
  for (const [index, task] of tasks.entries()) {
    if (!isRecord(task)) return `tasks[${index}] must be an object`
    const label = typeof task['id'] === 'string' && task['id'] !== '' ? `task "${task['id'] as string}"` : `tasks[${index}]`
    const detail = describeTaskDefect(task)
    if (detail === undefined) continue
    return `${label}: ${detail}`
  }
  const ids = tasks.filter(isRecord).map((task) => task['id'])
  if (ids.some((id) => typeof id !== 'string' || id === '')) return 'a task id must be a non-empty string'
  const seen = new Set<string>()
  for (const id of ids as string[]) {
    if (seen.has(id)) return `task "${id}": duplicated task id`
    seen.add(id)
  }
  if (raw['id'] !== expectedId) return `id ${JSON.stringify(raw['id'])} must equal "${expectedId}"`
  if (typeof raw['name'] !== 'string' || raw['name'].trim() === '') return 'name must be a non-empty string'
  if (!isOptionalString(raw['description'])) return 'description must be a string'
  if (raw['profile'] !== undefined && !isTeamProfileSnapshot(raw['profile'])) return 'profile is not a valid profile snapshot'
  if (typeof raw['captainSessionId'] !== 'string' || raw['captainSessionId'] === '') return 'captainSessionId must be a non-empty string'
  if (!isFiniteNumber(raw['createdAt'])) return 'createdAt must be a finite number'
  if (!Array.isArray(raw['members'])) return 'members must be an array'
  const memberKeys = new Set<string>()
  const memberIds = new Set<string>()
  for (const [index, member] of (raw['members'] as unknown[]).entries()) {
    if (!isTeamMember(member)) return `members[${index}] is not a valid member record`
    const key = sanitizeKey(member.name)
    if (key === CAPTAIN_KEY) return `members[${index}]: name "${member.name}" is reserved for the captain`
    if (memberKeys.has(key)) return `members[${index}]: name "${member.name}" is already used by another member`
    memberKeys.add(key)
    if (member.id === '') continue
    if (memberIds.has(member.id)) return `members[${index}]: id "${member.id}" is duplicated`
    memberIds.add(member.id)
  }
  if (!Number.isSafeInteger(raw['taskSeq']) || (raw['taskSeq'] as number) < 0) return 'taskSeq must be an integer >= 0'
  if (raw['phase'] !== undefined && raw['phase'] !== 'staged' && raw['phase'] !== 'running') {
    return `phase ${JSON.stringify(raw['phase'])} must be "staged" or "running"`
  }
  if (raw['planReviewState'] !== undefined
    && raw['planReviewState'] !== 'awaiting_review'
    && raw['planReviewState'] !== 'awaiting_feedback') {
    return `planReviewState ${JSON.stringify(raw['planReviewState'])} is invalid`
  }
  for (const key of ['approvedAt', 'haltedAt'] as const) {
    if (raw[key] !== undefined && !isFiniteNumber(raw[key])) return `${key} must be a finite number`
  }
  if (raw['halted'] !== undefined && typeof raw['halted'] !== 'boolean') return 'halted must be a boolean'
  if (raw['reviewPolicy'] !== undefined && !isReviewPolicy(raw['reviewPolicy'])) return 'reviewPolicy is invalid'
  if (raw['escalated'] !== undefined && typeof raw['escalated'] !== 'boolean') return 'escalated must be a boolean'
  return 'record does not satisfy the durable team contract'
}

/** The first task-contract violation, or `undefined` when the task is valid. */
function describeTaskDefect(task: Record<string, unknown>): string | undefined {
  if (typeof task['id'] !== 'string') return 'id must be a string'
  if (!isOptionalString(task['profileSeedId'])) return 'profileSeedId must be a string'
  if (typeof task['profileSeedId'] === 'string' && task['profileSeedId'].trim() === '') return 'profileSeedId must not be blank'
  if (typeof task['subject'] !== 'string') return 'subject must be a string'
  if (!isOptionalString(task['description'])) return 'description must be a string'
  const statuses = ['pending', 'claimed', 'in_progress', 'completed', 'failed', 'cancelled']
  if (!statuses.includes(task['status'] as string)) return `status ${JSON.stringify(task['status'])} is invalid`
  if (!isOptionalString(task['assignee'])) return 'assignee must be a string'
  if (!Array.isArray(task['dependencies'])) return 'dependencies must be an array'
  if (!(task['dependencies'] as unknown[]).every((dependency) => typeof dependency === 'string')) return 'dependencies must contain only strings'
  if (!isOptionalString(task['output'])) return 'output must be a string'
  if (task['attempt'] !== undefined && !(Number.isSafeInteger(task['attempt']) && (task['attempt'] as number) >= 0)) {
    return `attempt ${JSON.stringify(task['attempt'])} must be an integer >= 0`
  }
  if (!isOptionalString(task['attemptId'])) return 'attemptId must be a string'
  if (!isOptionalString(task['handoffId'])) return 'handoffId must be a string'
  if (!isOptionalString(task['handoffFromMemberId'])) return 'handoffFromMemberId must be a string'
  if (task['reassigning'] !== undefined && typeof task['reassigning'] !== 'boolean') return 'reassigning must be a boolean'
  if (!isFiniteNumber(task['createdAt'])) return 'createdAt must be a finite number'
  if (!isFiniteNumber(task['updatedAt'])) return 'updatedAt must be a finite number'
  return describeQualityTaskDefect(task)
}

/** Mirror of `hasValidQualityTaskFields`, reporting the first failing field. */
function describeQualityTaskDefect(task: Record<string, unknown>): string | undefined {
  if (task['kind'] !== undefined && !(TASK_KINDS as readonly string[]).includes(task['kind'] as string)) {
    return `kind ${JSON.stringify(task['kind'])} is invalid`
  }
  if (task['verdict'] !== undefined && !(REVIEW_VERDICTS as readonly string[]).includes(task['verdict'] as string)) {
    return `verdict ${JSON.stringify(task['verdict'])} is invalid`
  }
  if (task['round'] !== undefined && !(Number.isSafeInteger(task['round']) && (task['round'] as number) >= 1)) {
    return `round ${JSON.stringify(task['round'])} must be an integer >= 1`
  }
  for (const key of ['objective', 'reviewedTaskId', 'sourceTaskId'] as const) {
    if (task[key] !== undefined && !nonemptyString(task[key])) return `${key} must be a non-empty string`
  }
  if (task['reviewedAttempt'] !== undefined
    && !(Number.isSafeInteger(task['reviewedAttempt']) && (task['reviewedAttempt'] as number) >= 0)) {
    return `reviewedAttempt ${JSON.stringify(task['reviewedAttempt'])} must be an integer >= 0`
  }
  const stringLists = ['inScope', 'outOfScope', 'acceptance', 'verify', 'deliverables', 'nonGoals', 'changedPaths', 'sourceFindingIds', 'coverageOf'] as const
  for (const key of stringLists) {
    const value = task[key]
    if (value === undefined) continue
    if (!Array.isArray(value)) return `${key} must be an array`
    const badIndex = (value as unknown[]).findIndex((item) => !nonemptyString(item))
    if (badIndex >= 0) return `${key}[${badIndex}] must be a non-empty string`
  }
  if (task['findings'] !== undefined) {
    const findings = task['findings']
    if (!Array.isArray(findings)) return 'findings must be an array'
    for (const [index, finding] of (findings as unknown[]).entries()) {
      const detail = describeFindingDefect(finding)
      if (detail !== undefined) return `findings[${index}].${detail}`
    }
    const ids = (findings as ReviewFinding[]).map((finding) => finding.id)
    if (new Set(ids).size !== ids.length) return 'findings ids must be unique'
  }
  if (task['acceptanceResults'] !== undefined) {
    const results = task['acceptanceResults']
    if (!Array.isArray(results)) return 'acceptanceResults must be an array'
    for (const [index, result] of (results as unknown[]).entries()) {
      if (!isRecord(result)) return `acceptanceResults[${index}] must be an object`
      if (!nonemptyString(result['criterion'])) return `acceptanceResults[${index}].criterion must be a non-empty string`
      if (result['status'] !== 'passed' && result['status'] !== 'failed') return `acceptanceResults[${index}].status must be "passed" or "failed"`
      if (result['evidence'] !== undefined && typeof result['evidence'] !== 'string') return `acceptanceResults[${index}].evidence must be a string`
    }
  }
  if (task['commandsRun'] !== undefined) {
    const commands = task['commandsRun']
    if (!Array.isArray(commands)) return 'commandsRun must be an array'
    for (const [index, command] of (commands as unknown[]).entries()) {
      if (!isRecord(command)) return `commandsRun[${index}] must be an object`
      if (!nonemptyString(command['command'])) return `commandsRun[${index}].command must be a non-empty string`
      if (command['status'] !== 'passed' && command['status'] !== 'failed') return `commandsRun[${index}].status must be "passed" or "failed"`
    }
  }
  return undefined
}

/** The first finding-contract violation, or `undefined` when the finding is valid. */
function describeFindingDefect(finding: unknown): string | undefined {
  if (!isRecord(finding)) return 'must be an object'
  if (!nonemptyString(finding['id'])) return 'id must be a non-empty string'
  if (!(FINDING_SEVERITIES as readonly string[]).includes(finding['severity'] as string)) {
    return `severity ${JSON.stringify(finding['severity'])} is invalid`
  }
  if (!nonemptyString(finding['problem'])) return 'problem must be a non-empty string'
  if (!nonemptyString(finding['requiredFix'])) return 'requiredFix must be a non-empty string'
  if (finding['file'] !== undefined && !nonemptyString(finding['file'])) return 'file must be a non-empty string'
  if (finding['line'] !== undefined && !isValidFindingLine(finding['line'])) {
    return `line ${JSON.stringify(finding['line'])} must be an integer >= 0 (omit it when there is no line number)`
  }
  if (finding['resolved'] !== undefined && typeof finding['resolved'] !== 'boolean') return 'resolved must be a boolean'
  return undefined
}
export function isTeamTask(value: unknown): value is TeamTask {
  if (!isRecord(value)) return false
  const status = value['status']
  const open = status === 'claimed' || status === 'in_progress'
  const assignee = value['assignee']
  const attempt = value['attempt']
  const attemptId = value['attemptId']
  return typeof value['id'] === 'string'
    && (value['workspaceAudit'] === undefined || (isAttemptWorkspaceAudit(value['workspaceAudit'])
      && value['workspaceAudit'].taskId === value['id'] && value['workspaceAudit'].attemptId === attemptId))
    && Number.isSafeInteger(value['revision'])
    && (value['revision'] as number) >= 1
    && isOptionalString(value['profileSeedId'])
    && (value['profileSeedId'] === undefined || value['profileSeedId'].trim() !== '')
    && typeof value['subject'] === 'string'
    && isOptionalString(value['description'])
    && (value['status'] === 'pending'
      || value['status'] === 'claimed'
      || value['status'] === 'in_progress'
      || value['status'] === 'completed'
      || value['status'] === 'failed'
      || value['status'] === 'cancelled')
    && isOptionalString(assignee)
    && (assignee === undefined || assignee.trim() !== '')
    && (value['temporaryAdmission'] === undefined || value['temporaryAdmission'] === true)
    && Array.isArray(value['dependencies'])
    && value['dependencies'].every((dependency) => typeof dependency === 'string')
    && isOptionalString(value['output'])
    && (value['attempt'] === undefined
      || (Number.isSafeInteger(value['attempt']) && (value['attempt'] as number) >= 0))
    && isOptionalString(attemptId)
    && (attemptId === undefined || attemptId.trim() !== '')
    && isOptionalString(value['handoffId'])
    && isOptionalString(value['handoffFromMemberId'])
    && (value['reassigning'] === undefined || typeof value['reassigning'] === 'boolean')
    && isFiniteNumber(value['createdAt'])
    && isFiniteNumber(value['updatedAt'])
    && (!open || (
      typeof assignee === 'string'
      && Number.isSafeInteger(attempt)
      && (attempt as number) >= 1
      && typeof attemptId === 'string'
      && attemptId.trim() !== ''
    ))
    && (value['reassigning'] !== true || status === 'pending')
    && hasValidQualityTaskFields(value)
}

/** Validate the full team record before it can participate in authorization. */
function isTeamState(value: unknown, expectedId: string): value is TeamState {
  if (!isRecord(value)) return false
  const validShape = value['schemaVersion'] === AGENT_TEAMS_STATE_SCHEMA_VERSION
    && value['id'] === expectedId
    && typeof value['name'] === 'string'
    && value['name'].trim() !== ''
    && isOptionalString(value['description'])
    && (value['profile'] === undefined || isTeamProfileSnapshot(value['profile']))
    && typeof value['captainSessionId'] === 'string'
    && value['captainSessionId'] !== ''
    && isFiniteNumber(value['createdAt'])
    && Array.isArray(value['members'])
    && value['members'].every(isTeamMember)
    && Array.isArray(value['tasks'])
    && value['tasks'].every(isTeamTask)
    && Number.isSafeInteger(value['taskSeq'])
    && (value['taskSeq'] as number) >= 0
    && Number.isSafeInteger(value['planRevision'])
    && (value['planRevision'] as number) >= 1
    && (value['phase'] === 'staged' || value['phase'] === 'running')
    && (value['halted'] === undefined || typeof value['halted'] === 'boolean')
    && (value['haltedAt'] === undefined || isFiniteNumber(value['haltedAt']))
    && (value['reviewPolicy'] === undefined || isReviewPolicy(value['reviewPolicy']))
    && (value['escalated'] === undefined || typeof value['escalated'] === 'boolean')
  if (!validShape) return false

  const members = value['members'] as TeamMember[]
  const tasks = value['tasks'] as TeamTask[]
  const memberIds = new Set<string>()
  const memberKeys = new Set<string>()
  const staged = value['phase'] === 'staged'
  const approvalFields = [
    value['approvedAt'],
    value['approvedPlanRevision'],
    value['approvalSource'],
    value['approvalEvidenceId'],
  ]
  const approvalCount = approvalFields.filter((item) => item !== undefined).length
  if (staged) {
    if (value['planReviewState'] !== 'building'
      && value['planReviewState'] !== 'ready_for_review'
      && value['planReviewState'] !== 'awaiting_feedback') return false
    if (approvalCount !== 0) return false
    if (value['planReviewState'] === 'building' && value['planReadyAt'] !== undefined) return false
    if (value['planReviewState'] !== 'building' && !isFiniteNumber(value['planReadyAt'])) return false
  } else {
    if (value['planReviewState'] !== undefined) return false
    if (approvalCount !== 4) return false
    if (!isFiniteNumber(value['approvedAt'])) return false
    if (!Number.isSafeInteger(value['approvedPlanRevision']) || value['approvedPlanRevision'] !== value['planRevision']) return false
    if (value['approvalSource'] !== 'web'
      && value['approvalSource'] !== 'chat'
      && value['approvalSource'] !== 'automatic') return false
    if (typeof value['approvalEvidenceId'] !== 'string' || value['approvalEvidenceId'].trim() === '') return false
    if (value['approvalSource'] === 'automatic') {
      if (value['planReadyAt'] !== undefined) return false
    } else if (!isFiniteNumber(value['planReadyAt'])) return false
  }
  for (const member of members) {
    const key = sanitizeKey(member.name)
    if (key === CAPTAIN_KEY || memberKeys.has(key)) return false
    if (member.id !== '') {
      if (memberIds.has(member.id)) return false
      memberIds.add(member.id)
    }
    memberKeys.add(key)
  }
  const taskIds = new Set<string>()
  for (const task of tasks) {
    if (task.id === '' || taskIds.has(task.id)) return false
    if ((task.status === 'claimed' || task.status === 'in_progress')
      && (task.assignee !== CAPTAIN_KEY && !members.some((member) => member.status !== 'removed' && member.name === task.assignee))) return false
    taskIds.add(task.id)
  }
  return true
}

/** Validate a mailbox record so later rendering cannot crash on `{}`/`null`. */
function isTeamMessage(value: unknown): value is TeamMessage {
  if (!isRecord(value)) return false
  return typeof value['id'] === 'string'
    && typeof value['from'] === 'string'
    && typeof value['to'] === 'string'
    && typeof value['content'] === 'string'
    && isFiniteNumber(value['ts'])
    && (value['deliveryClaimedAt'] === undefined || isFiniteNumber(value['deliveryClaimedAt']))
    && (value['deliveredAt'] === undefined || isFiniteNumber(value['deliveredAt']))
    && (value['readAt'] === undefined || isFiniteNumber(value['readAt']))
    && (value['discardedAt'] === undefined || isFiniteNumber(value['discardedAt']))
    && (value['taskId'] === undefined || typeof value['taskId'] === 'string')
    && (value['attemptId'] === undefined || typeof value['attemptId'] === 'string')
}

/**
 * Remove a team's whole directory (members should be interrupted first).
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team id.
 */
export async function removeTeamDir(stateRoot: string, teamId: string): Promise<void> {
  await rm(join(stateRoot, teamId), { recursive: true, force: true })
}

/**
 * `rename` with the same transient retry policy as the state-file atomic
 * write, for paths (like archiving a whole team directory) where there is no
 * content-equivalent direct-write degradation on Windows. A short-lived
 * delete-sharing lock on any file below the renamed path is retried a few
 * times before the error propagates.
 * @param from - source path.
 * @param to - destination path.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to)
      return
    } catch (error: unknown) {
      if (isRetryableRenameError(error) && attempt < ATOMIC_RENAME_RETRIES) {
        await sleep(ATOMIC_RENAME_RETRY_DELAY_MS)
        continue
      }
      throw error
    }
  }
}

/**
 * Archive a team instead of deleting it: the whole directory (team.json with
 * tasks and dependency graph, plus the mailboxes) moves under
 * `<stateRoot>/archive/<teamId>/` so later sessions can review how tasks were
 * planned and rebuild dependency relationships. The archive directory has no
 * team.json of its own, so the live activity scan skips it naturally.
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team id.
 */
export async function archiveTeamDir(stateRoot: string, teamId: string): Promise<void> {
  const archiveRoot = join(stateRoot, 'archive')
  await mkdir(archiveRoot, { recursive: true })
  const source = join(stateRoot, teamId)
  const target = join(archiveRoot, teamId)
  const previous = join(archiveRoot, `.${teamId}.previous-${randomUUID()}`)
  let displaced = false
  try {
    // The same Windows EPERM-on-rename applies at the directory boundary: a
    // delete-sharing violation on any file below `target` blocks the move, so
    // retry the transient-lock case before giving up.
    await renameWithRetry(target, previous)
    displaced = true
  } catch (error: unknown) {
    // Only ENOENT means there was nothing to displace; any other failure
    // (including a persistent EPERM lock) surfaces to the caller.
    if (!(error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
      throw error
    }
  }

  try {
    await renameWithRetry(source, target)
  } catch (error: unknown) {
    if (displaced) {
      try {
        await renameWithRetry(previous, target)
      } catch (restoreError: unknown) {
        throw new AggregateError(
          [error, restoreError],
          `failed to archive team "${teamId}" and restore its previous archive`,
        )
      }
    }
    throw error
  }

  // The new generation is authoritative. A failed cleanup only leaves a
  // hidden recovery directory, which archive discovery deliberately ignores.
  if (displaced) await rm(previous, { recursive: true, force: true }).catch(() => undefined)
}

/**
 * Read one archived team (already moved under `archive/`), or undefined when
 * it was never archived.
 * @param stateRoot - resolved absolute state root directory.
 * @param teamId - the team id.
 */
export async function readArchivedTeam(stateRoot: string, teamId: string): Promise<TeamState | undefined> {
  return readTeam(join(stateRoot, 'archive'), teamId)
}

/**
 * List every archived team id under the state root.
 * @param stateRoot - resolved absolute state root directory.
 * @returns the archived team ids, empty when the archive does not exist.
 */
export async function listArchivedTeamIds(stateRoot: string): Promise<string[]> {
  try {
    const entries = await readdir(join(stateRoot, 'archive'), { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }
    throw error
  }
}

// ── activity snapshot (server-side, like the Claude Code desktop watcher) ──

/** Visual task state for the activity panel. */
export type VisualTaskState = 'blocked' | 'open' | 'running' | 'completed' | 'failed' | 'cancelled'

/**
 * The visual state of one task: `running` while in_progress, `completed`
 * when done, `failed`/`cancelled` when terminal without success, `blocked`
 * while any dependency is unfinished, else `open`.
 */
export function taskVisualState(
  status: string,
  dependencies: readonly string[],
  tasks: readonly TeamTask[],
): VisualTaskState {
  if (status === 'completed') return 'completed'
  if (status === 'failed') return 'failed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'in_progress') return 'running'
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const openDependency = dependencies.some((dependencyId) => {
    const dependency = byId.get(dependencyId)
    return dependency !== undefined && dependency.status !== 'completed'
  })
  return openDependency ? 'blocked' : 'open'
}

/**
 * Longest dependency path depth per task id (each depth = one lane column).
 */
export function taskDepthsById(tasks: readonly TeamTask[]): Map<string, number> {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const depths = new Map<string, number>()
  const visiting = new Set<string>()
  const depthOf = (taskId: string): number => {
    const cached = depths.get(taskId)
    if (cached !== undefined) return cached
    if (visiting.has(taskId)) return 0
    const task = byId.get(taskId)
    if (task === undefined) return 0
    visiting.add(taskId)
    const dependencies = task.dependencies
      .filter((dependencyId) => byId.has(dependencyId))
      .sort()
    const depth = dependencies.length === 0
      ? 0
      : 1 + Math.max(...dependencies.map(depthOf))
    visiting.delete(taskId)
    depths.set(taskId, depth)
    return depth
  }
  for (const task of tasks) depthOf(task.id)
  return depths
}
