const MAX_PROFILES = 16
const MAX_MEMBERS = 8
const MAX_TASKS = 32
const MAX_PROFILE_NAME_LENGTH = 64
const PROFILE_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u
const CAPTAIN_NAME = 'captain'

const PROFILE_KEYS = new Set([
  'description', 'protocol', 'executionPrompt', 'fallback', 'members',
  'tasks', 'taskPlanning', 'reviewPolicy',
])
const MEMBER_KEYS = new Set([
  'name', 'role', 'provider', 'model', 'reasoning_mode', 'reasoning_effort', 'executionPrompt', 'fallback',
])
const TASK_KEYS = new Set(['id', 'subject', 'description', 'assignee', 'dependencies'])
const FALLBACK_KEYS = new Set(['provider', 'model'])
const REVIEW_POLICY_KEYS = new Set([
  'requirementsMinRounds', 'requirementsMaxRounds', 'codeMaxRounds',
  'maxRepairAttempts', 'requiredReviewers',
])

/** Browser-local structural copy of the upstream profile config contract. */
export interface TeamModelFallbackConfig {
  provider: string
  model: string
}

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

export interface TeamProfileTaskConfig {
  id: string
  subject: string
  description?: string
  assignee?: string
  dependencies?: string[]
}

export interface TeamProfileReviewPolicy {
  requirementsMinRounds?: number
  requirementsMaxRounds?: number
  codeMaxRounds?: number
  maxRepairAttempts?: number
  requiredReviewers?: string[]
}

export interface TeamProfileConfig {
  description?: string
  protocol?: string
  executionPrompt?: string
  fallback?: TeamModelFallbackConfig
  members: TeamProfileMemberConfig[]
  taskPlanning?: 'captain' | 'seed'
  tasks?: TeamProfileTaskConfig[]
  reviewPolicy?: TeamProfileReviewPolicy
}

export interface AgentTeamsProfilesSnapshot {
  schemaVersion: 2
  profiles: Record<string, TeamProfileConfig>
  builtInNames: string[]
  builtInProfiles: Record<string, TeamProfileConfig>
  unsupportedPersistedVersion: boolean
}

export type ProfileSaveResult =
  | { ok: true; profiles: Record<string, TeamProfileConfig> }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function trimString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

function optionalString(value: unknown, path: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') {
    errors.push(`${path} must be a string`)
    return undefined
  }
  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}

function requiredString(value: unknown, path: string, errors: string[]): string | undefined {
  const normalized = trimString(value)
  if (normalized === undefined || normalized === '') {
    errors.push(`${path} must not be empty`)
    return undefined
  }
  return normalized
}

function normalizeReasoningMode(value: unknown): RoleReasoningMode | undefined {
  if (value === 'target-default' || value === 'route-aware' || value === 'explicit') return value
  return undefined
}

function normalizeOptionalEditorString(value: unknown): string | undefined {
  const normalized = trimString(value)
  return normalized === '' ? undefined : normalized
}

function assertKnownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, errors: string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key} is not supported`)
  }
}

function normalizeName(value: unknown): string | undefined {
  const name = trimString(value)
  if (name === undefined || name === '' || name.length > MAX_PROFILE_NAME_LENGTH) return undefined
  if (!PROFILE_NAME_PATTERN.test(name) || name.toLowerCase() === CAPTAIN_NAME) return undefined
  return name
}

function normalizeMemberForEditor(value: unknown): TeamProfileMemberConfig | undefined {
  if (!isRecord(value)) return undefined
  const name = trimString(value.name)
  if (name === undefined || name === '') return undefined
  const reasoning_mode = normalizeReasoningMode(value.reasoning_mode)
  if (reasoning_mode === undefined) return undefined
  const provider = normalizeOptionalEditorString(value.provider)
  const model = normalizeOptionalEditorString(value.model)
  const reasoning_effort = normalizeOptionalEditorString(value.reasoning_effort)
  if ((provider === undefined) !== (model === undefined)) return undefined
  if (reasoning_mode === 'explicit' && (provider === undefined || model === undefined || reasoning_effort === undefined)) {
    return undefined
  }
  if (reasoning_mode !== 'explicit' && reasoning_effort !== undefined) return undefined
  const member: TeamProfileMemberConfig = { name, reasoning_mode }
  for (const key of ['role', 'executionPrompt'] as const) {
    const normalized = trimString(value[key])
    if (normalized !== undefined && normalized !== '') member[key] = normalized
  }
  if (provider !== undefined) member.provider = provider
  if (model !== undefined) member.model = model
  if (reasoning_effort !== undefined) member.reasoning_effort = reasoning_effort
  const fallback = normalizeFallbackForEditor(value.fallback)
  if (fallback !== undefined) member.fallback = fallback
  return member
}

function normalizeFallbackForEditor(value: unknown): TeamModelFallbackConfig | undefined {
  if (!isRecord(value)) return undefined
  const provider = trimString(value.provider)
  const model = trimString(value.model)
  if (provider === undefined || provider === '' || model === undefined || model === '') return undefined
  return { provider, model }
}

function normalizeTaskForEditor(value: unknown): TeamProfileTaskConfig | undefined {
  if (!isRecord(value)) return undefined
  const id = trimString(value.id)
  const subject = trimString(value.subject)
  if (id === undefined || id === '' || subject === undefined || subject === '') return undefined
  const task: TeamProfileTaskConfig = { id, subject }
  for (const key of ['description', 'assignee'] as const) {
    const normalized = trimString(value[key])
    if (normalized !== undefined && normalized !== '') task[key] = normalized
  }
  if (Array.isArray(value.dependencies)) {
    const dependencies = value.dependencies
      .map((dependency) => trimString(dependency))
      .filter((dependency): dependency is string => dependency !== undefined && dependency !== '')
    if (dependencies.length > 0) task.dependencies = dependencies
  }
  return task
}

function normalizeProfileForEditor(value: unknown): TeamProfileConfig | undefined {
  if (!isRecord(value) || !Array.isArray(value.members)) return undefined
  const members = value.members
    .map(normalizeMemberForEditor)
    .filter((member): member is TeamProfileMemberConfig => member !== undefined)
  if (members.length === 0) return undefined
  const profile: TeamProfileConfig = { members }
  for (const key of ['description', 'protocol', 'executionPrompt'] as const) {
    const normalized = trimString(value[key])
    if (normalized !== undefined && normalized !== '') profile[key] = normalized
  }
  if (value.taskPlanning === 'captain' || value.taskPlanning === 'seed') {
    profile.taskPlanning = value.taskPlanning
  }
  const fallback = normalizeFallbackForEditor(value.fallback)
  if (fallback !== undefined) profile.fallback = fallback
  if (Array.isArray(value.tasks)) {
    const tasks = value.tasks
      .map(normalizeTaskForEditor)
      .filter((task): task is TeamProfileTaskConfig => task !== undefined)
    if (tasks.length > 0) profile.tasks = tasks
  }
  if (isRecord(value.reviewPolicy)) {
    const policy: NonNullable<TeamProfileConfig['reviewPolicy']> = {}
    for (const key of [
      'requirementsMinRounds', 'requirementsMaxRounds', 'codeMaxRounds', 'maxRepairAttempts',
    ] as const) {
      if (Number.isSafeInteger(value.reviewPolicy[key]) && Number(value.reviewPolicy[key]) > 0) {
        policy[key] = Number(value.reviewPolicy[key])
      }
    }
    if (Array.isArray(value.reviewPolicy.requiredReviewers)) {
      const reviewers = value.reviewPolicy.requiredReviewers
        .map((reviewer) => trimString(reviewer))
        .filter((reviewer): reviewer is string => reviewer !== undefined && reviewer !== '')
      if (reviewers.length > 0) policy.requiredReviewers = reviewers
    }
    if (Object.keys(policy).length > 0) profile.reviewPolicy = policy
  }
  return profile
}

function normalizeMapForEditor(value: unknown): Record<string, TeamProfileConfig> {
  if (!isRecord(value)) return {}
  const result: Record<string, TeamProfileConfig> = {}
  for (const [rawName, rawProfile] of Object.entries(value)) {
    const name = normalizeName(rawName)
    const profile = normalizeProfileForEditor(rawProfile)
    if (name !== undefined && profile !== undefined) result[name] = profile
  }
  return result
}

/** Normalize the host response into an isolated browser-editable snapshot. */
export function normalizeProfileSnapshot(value: unknown): AgentTeamsProfilesSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 2) {
    throw new Error('AgentTeams profile snapshot schemaVersion must be 2')
  }
  if (
    !isRecord(value.profiles)
    || !Array.isArray(value.builtInNames)
    || !isRecord(value.builtInProfiles)
    || typeof value.unsupportedPersistedVersion !== 'boolean'
  ) {
    throw new Error('AgentTeams profile snapshot must be a complete V2 document')
  }
  const unsupportedPersistedVersion = value.unsupportedPersistedVersion === true
  const source = value
  const suppliedBuiltIns = normalizeMapForEditor(source.builtInProfiles)
  const profiles = unsupportedPersistedVersion ? {} : normalizeMapForEditor(source.profiles)
  const requestedNames = Array.isArray(source.builtInNames)
    ? source.builtInNames.map(normalizeName).filter((name): name is string => name !== undefined)
    : []
  const builtInNames = [...new Set(requestedNames.filter((name) => (
    suppliedBuiltIns[name] !== undefined || (!unsupportedPersistedVersion && profiles[name] !== undefined)
  )))]
  const builtInProfiles: Record<string, TeamProfileConfig> = {}
  for (const name of builtInNames) {
    const profile = suppliedBuiltIns[name] ?? profiles[name]
    if (profile !== undefined) builtInProfiles[name] = cloneJson(profile)
  }
  return {
    schemaVersion: 2,
    profiles: cloneJson(profiles),
    builtInNames,
    builtInProfiles,
    unsupportedPersistedVersion,
  }
}

/** Create the minimum valid captain-planned profile used by the editor. */
export function createEmptyTeamProfile(_name: string): TeamProfileConfig {
  return {
    taskPlanning: 'captain',
    members: [{ name: 'member', reasoning_mode: 'target-default' }],
  }
}

/** Clone an editable profile map before applying a UI update. */
export function cloneProfileMap(value: Record<string, TeamProfileConfig>): Record<string, TeamProfileConfig> {
  return cloneJson(value)
}

function normalizeFallbackForSave(value: unknown, path: string, errors: string[]): TeamModelFallbackConfig | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return undefined
  }
  assertKnownKeys(value, FALLBACK_KEYS, path, errors)
  const provider = requiredString(value.provider, `${path}.provider`, errors)
  const model = requiredString(value.model, `${path}.model`, errors)
  if (provider === undefined || model === undefined) return undefined
  return { provider, model }
}

function normalizeMemberForSave(value: unknown, path: string, errors: string[]): TeamProfileMemberConfig | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return undefined
  }
  assertKnownKeys(value, MEMBER_KEYS, path, errors)
  const name = requiredString(value.name, `${path}.name`, errors)
  if (name === undefined) return undefined
  if (name.toLowerCase() === CAPTAIN_NAME) errors.push(`${path}.name is reserved for the captain`)
  const rawReasoningMode = requiredString(value.reasoning_mode, `${path}.reasoning_mode`, errors)
  if (rawReasoningMode === undefined) return undefined
  const reasoning_mode = normalizeReasoningMode(rawReasoningMode)
  if (reasoning_mode === undefined) {
    errors.push(`${path}.reasoning_mode is invalid`)
    return undefined
  }
  const provider = optionalString(value.provider, `${path}.provider`, errors)
  const model = optionalString(value.model, `${path}.model`, errors)
  const reasoning_effort = optionalString(value.reasoning_effort, `${path}.reasoning_effort`, errors)
  if ((provider === undefined) !== (model === undefined)) {
    errors.push(`${path}.provider and ${path}.model must be set together`)
  }
  if (reasoning_mode === 'explicit' && (provider === undefined || model === undefined || reasoning_effort === undefined)) {
    errors.push(`${path} explicit policy requires provider, model, and reasoning_effort`)
  }
  if (reasoning_mode !== 'explicit' && reasoning_effort !== undefined) {
    errors.push(`${path}.reasoning_effort is valid only for explicit policy`)
  }
  const member: TeamProfileMemberConfig = { name, reasoning_mode }
  for (const key of ['role', 'executionPrompt'] as const) {
    const normalized = optionalString(value[key], `${path}.${key}`, errors)
    if (normalized !== undefined) member[key] = normalized
  }
  if (provider !== undefined) member.provider = provider
  if (model !== undefined) member.model = model
  if (reasoning_effort !== undefined) member.reasoning_effort = reasoning_effort
  const fallback = normalizeFallbackForSave(value.fallback, `${path}.fallback`, errors)
  if (fallback !== undefined) member.fallback = fallback
  return member
}

function normalizeTaskForSave(value: unknown, path: string, errors: string[]): TeamProfileTaskConfig | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return undefined
  }
  assertKnownKeys(value, TASK_KEYS, path, errors)
  const id = requiredString(value.id, `${path}.id`, errors)
  const subject = requiredString(value.subject, `${path}.subject`, errors)
  if (id === undefined || subject === undefined) return undefined
  const task: TeamProfileTaskConfig = { id, subject }
  for (const key of ['description', 'assignee'] as const) {
    const normalized = optionalString(value[key], `${path}.${key}`, errors)
    if (normalized !== undefined) task[key] = normalized
  }
  if (value.dependencies !== undefined) {
    if (!Array.isArray(value.dependencies)) {
      errors.push(`${path}.dependencies must be an array`)
    } else {
      const dependencies: string[] = []
      for (const [index, dependency] of value.dependencies.entries()) {
        const normalized = requiredString(dependency, `${path}.dependencies[${index}]`, errors)
        if (normalized !== undefined && !dependencies.includes(normalized)) dependencies.push(normalized)
      }
      if (dependencies.length > 0) task.dependencies = dependencies
    }
  }
  return task
}

function normalizeReviewPolicyForSave(
  value: unknown,
  path: string,
  errors: string[],
): NonNullable<TeamProfileConfig['reviewPolicy']> | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return undefined
  }
  assertKnownKeys(value, REVIEW_POLICY_KEYS, path, errors)
  const policy: NonNullable<TeamProfileConfig['reviewPolicy']> = {}
  for (const key of [
    'requirementsMinRounds', 'requirementsMaxRounds', 'codeMaxRounds', 'maxRepairAttempts',
  ] as const) {
    if (value[key] === undefined || value[key] === '') continue
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 1) {
      errors.push(`${path}.${key} must be a positive integer`)
    } else {
      policy[key] = Number(value[key])
    }
  }
  if (
    policy.requirementsMinRounds !== undefined
    && policy.requirementsMaxRounds !== undefined
    && policy.requirementsMinRounds > policy.requirementsMaxRounds
  ) {
    errors.push(`${path}.requirementsMinRounds must be <= requirementsMaxRounds`)
  }
  if (value.requiredReviewers !== undefined) {
    if (!Array.isArray(value.requiredReviewers)) {
      errors.push(`${path}.requiredReviewers must be an array`)
    } else {
      const reviewers: string[] = []
      for (const [index, reviewer] of value.requiredReviewers.entries()) {
        const normalized = requiredString(reviewer, `${path}.requiredReviewers[${index}]`, errors)
        if (normalized !== undefined) reviewers.push(normalized)
      }
      if (reviewers.length > 0) policy.requiredReviewers = reviewers
    }
  }
  return Object.keys(policy).length === 0 ? undefined : policy
}

function normalizeProfileForSave(value: unknown, path: string, errors: string[]): TeamProfileConfig | undefined {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return undefined
  }
  assertKnownKeys(value, PROFILE_KEYS, path, errors)
  if (!Array.isArray(value.members) || value.members.length < 1 || value.members.length > MAX_MEMBERS) {
    errors.push(`${path}.members must contain 1-${MAX_MEMBERS} members`)
  }
  const members = Array.isArray(value.members)
    ? value.members
      .map((member, index) => normalizeMemberForSave(member, `${path}.members[${index}]`, errors))
      .filter((member): member is TeamProfileMemberConfig => member !== undefined)
    : []
  const memberKeys = new Set<string>()
  for (const member of members) {
    const key = member.name.normalize('NFC').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')
    if (memberKeys.has(key)) errors.push(`${path}.members contains duplicate names`)
    memberKeys.add(key)
  }
  const profile: TeamProfileConfig = { members }
  for (const key of ['description', 'protocol', 'executionPrompt'] as const) {
    const normalized = optionalString(value[key], `${path}.${key}`, errors)
    if (normalized !== undefined) profile[key] = normalized
  }
  if (value.taskPlanning !== undefined) {
    if (value.taskPlanning !== 'captain' && value.taskPlanning !== 'seed') {
      errors.push(`${path}.taskPlanning must be captain or seed`)
    } else {
      profile.taskPlanning = value.taskPlanning
    }
  }
  const fallback = normalizeFallbackForSave(value.fallback, `${path}.fallback`, errors)
  if (fallback !== undefined) profile.fallback = fallback
  if (value.tasks !== undefined) {
    if (!Array.isArray(value.tasks) || value.tasks.length > MAX_TASKS) {
      errors.push(`${path}.tasks must contain 0-${MAX_TASKS} tasks`)
    } else {
      const tasks = value.tasks
        .map((task, index) => normalizeTaskForSave(task, `${path}.tasks[${index}]`, errors))
        .filter((task): task is TeamProfileTaskConfig => task !== undefined)
      const taskIds = new Set<string>()
      for (const task of tasks) {
        if (taskIds.has(task.id)) errors.push(`${path}.tasks contains duplicate ids`)
        taskIds.add(task.id)
      }
      if (profile.taskPlanning !== 'captain') {
        const memberNames = new Set(members.map((member) => member.name))
        for (const task of tasks) {
          if (task.assignee === undefined || task.assignee === '') {
            errors.push(`${path}.tasks.${task.id}.assignee must not be empty for seed planning`)
          } else if (!memberNames.has(task.assignee)) {
            errors.push(`${path}.tasks.${task.id}.assignee must match a member name`)
          }
          for (const dependency of task.dependencies ?? []) {
            if (dependency === task.id) errors.push(`${path}.tasks.${task.id} cannot depend on itself`)
            if (!taskIds.has(dependency) && !tasks.some((candidate) => candidate.id === dependency)) {
              errors.push(`${path}.tasks.${task.id} depends on unknown task "${dependency}"`)
            }
          }
        }
      }
      if (tasks.length > 0) profile.tasks = tasks
    }
  }
  const reviewPolicy = normalizeReviewPolicyForSave(value.reviewPolicy, `${path}.reviewPolicy`, errors)
  if (reviewPolicy !== undefined) profile.reviewPolicy = reviewPolicy
  return profile
}

/** Validate and normalize the map before handing it to the host IPC boundary. */
export function prepareProfileMapForSave(value: unknown): ProfileSaveResult {
  if (!isRecord(value)) return { ok: false, error: 'AgentTeams profiles must be an object map' }
  const names = Object.keys(value)
  if (names.length > MAX_PROFILES) {
    return { ok: false, error: `too many AgentTeams profiles (${names.length}); the limit is ${MAX_PROFILES}` }
  }
  const errors: string[] = []
  const profiles: Record<string, TeamProfileConfig> = {}
  const seenNames = new Set<string>()
  for (const rawName of names) {
    const name = normalizeName(rawName)
    if (name === undefined) {
      errors.push(`invalid AgentTeams profile name "${rawName}"`)
      continue
    }
    if (seenNames.has(name)) {
      errors.push(`duplicate AgentTeams profile name "${name}"`)
      continue
    }
    seenNames.add(name)
    const profile = normalizeProfileForSave(value[rawName], `profiles.${name}`, errors)
    if (profile !== undefined) profiles[name] = profile
  }
  if (errors.length > 0) return { ok: false, error: errors.join('; ') }
  return { ok: true, profiles }
}
