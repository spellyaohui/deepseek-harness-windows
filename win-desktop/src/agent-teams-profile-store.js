/**
 * Host-side persistence boundary for AgentTeams named profiles.
 *
 * The AgentTeams plugin remains the semantic authority for profile execution.
 * This module only owns the desktop default, JSON-safe persistence, and the
 * fail-closed shape checks needed before a profile can enter the startup YAML.
 */

const MAX_PROFILES = 16
const MAX_MEMBERS = 8
const MAX_TASKS = 32
const MAX_PROFILE_NAME_LENGTH = 64
const MAX_SERIALIZED_BYTES = 256 * 1024
const PROFILE_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u
const CAPTAIN_NAME = 'captain'

const PROFILE_KEYS = new Set([
  'description', 'protocol', 'executionPrompt', 'fallback', 'members',
  'tasks', 'taskPlanning', 'reviewPolicy',
])
const MEMBER_KEYS = new Set([
  'name', 'role', 'provider', 'model', 'reasoning_effort', 'executionPrompt', 'fallback',
])
const TASK_KEYS = new Set(['id', 'subject', 'description', 'assignee', 'dependencies'])
const FALLBACK_KEYS = new Set(['provider', 'model'])
const REVIEW_POLICY_KEYS = new Set([
  'requirementsMinRounds', 'requirementsMaxRounds', 'codeMaxRounds',
  'maxRepairAttempts', 'requiredReviewers',
])

const SOFTWARE_DELIVERY_PROFILE = {
  description: 'A general software delivery team for analysis, implementation, verification, and review.',
  protocol: 'Keep scope, acceptance criteria, and verification evidence traceable. Analyze before implementation and verify before delivery.',
  taskPlanning: 'captain',
  members: [
    { name: 'analyst', role: 'Requirements analyst' },
    { name: 'implementer', role: 'Implementation engineer' },
    { name: 'tester', role: 'Verification engineer' },
    { name: 'reviewer', role: 'Code and risk reviewer' },
  ],
}

function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

/** Default profile map. Callers must use a clone before editing. */
export const BUILTIN_AGENT_TEAMS_PROFILES = deepFreeze({
  'software-delivery': SOFTWARE_DELIVERY_PROFILE,
})

export const BUILTIN_AGENT_TEAMS_PROFILE_NAMES = Object.freeze(
  Object.keys(BUILTIN_AGENT_TEAMS_PROFILES),
)

function isPlainRecord(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function cloneJson(value, label) {
  let encoded
  try {
    encoded = JSON.stringify(value)
  } catch (error) {
    throw new Error(`${label} must contain only JSON-safe values: ${String(error)}`)
  }
  if (typeof encoded !== 'string') {
    throw new Error(`${label} must contain only JSON-safe values`)
  }
  if (Buffer.byteLength(encoded, 'utf8') > MAX_SERIALIZED_BYTES) {
    throw new Error(`${label} is too large`)
  }
  return JSON.parse(encoded)
}

export function cloneAgentTeamsProfiles(value) {
  if (!isPlainRecord(value)) throw new Error('AgentTeams profiles must be an object map')
  return cloneJson(value, 'AgentTeams profiles')
}

function normalizedName(value) {
  if (typeof value !== 'string') return undefined
  const name = value.trim()
  if (name.length === 0 || name.length > MAX_PROFILE_NAME_LENGTH) return undefined
  if (!PROFILE_NAME_PATTERN.test(name) || name.toLowerCase() === CAPTAIN_NAME) return undefined
  return name
}

function normalizedMemberKey(value) {
  return value.normalize('NFC').trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-')
}

function normalizedOptionalString(value, path) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${path} must be a string`)
  const trimmed = value.trim()
  if (trimmed === '') throw new Error(`${path} must not be empty`)
  return trimmed
}

function normalizedFallback(value, path) {
  if (value === undefined) return undefined
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`)
  for (const key of Object.keys(value)) {
    if (!FALLBACK_KEYS.has(key)) throw new Error(`${path}.${key} is not supported`)
  }
  const provider = normalizedOptionalString(value.provider, `${path}.provider`)
  const model = normalizedOptionalString(value.model, `${path}.model`)
  if (provider === undefined || model === undefined) {
    throw new Error(`${path} requires provider and model`)
  }
  return { provider, model }
}

function normalizedReviewPolicy(value, path) {
  if (value === undefined) return undefined
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`)
  for (const key of Object.keys(value)) {
    if (!REVIEW_POLICY_KEYS.has(key)) throw new Error(`${path}.${key} is not supported`)
  }
  const result = {}
  for (const key of REVIEW_POLICY_KEYS) {
    if (value[key] === undefined) continue
    if (!Number.isSafeInteger(value[key]) || value[key] < 1) {
      throw new Error(`${path}.${key} must be a positive integer`)
    }
    result[key] = value[key]
  }
  if (
    result.requirementsMinRounds !== undefined
    && result.requirementsMaxRounds !== undefined
    && result.requirementsMinRounds > result.requirementsMaxRounds
  ) {
    throw new Error(`${path}.requirementsMinRounds must be <= requirementsMaxRounds`)
  }
  if (value.requiredReviewers !== undefined) {
    if (!Array.isArray(value.requiredReviewers)) {
      throw new Error(`${path}.requiredReviewers must be an array`)
    }
    result.requiredReviewers = value.requiredReviewers.map((reviewer, index) => {
      const normalized = normalizedOptionalString(reviewer, `${path}.requiredReviewers[${index}]`)
      if (normalized === undefined) throw new Error(`${path}.requiredReviewers[${index}] must not be empty`)
      return normalized
    })
  }
  return result
}

function normalizedTask(value, path) {
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`)
  for (const key of Object.keys(value)) {
    if (!TASK_KEYS.has(key)) throw new Error(`${path}.${key} is not supported`)
  }
  const id = normalizedOptionalString(value.id, `${path}.id`)
  const subject = normalizedOptionalString(value.subject, `${path}.subject`)
  if (id === undefined || subject === undefined) throw new Error(`${path} requires id and subject`)
  const task = { id, subject }
  for (const key of ['description', 'assignee']) {
    const normalized = normalizedOptionalString(value[key], `${path}.${key}`)
    if (normalized !== undefined) task[key] = normalized
  }
  if (value.dependencies !== undefined) {
    if (!Array.isArray(value.dependencies)) throw new Error(`${path}.dependencies must be an array`)
    task.dependencies = value.dependencies.map((dependency, index) => {
      const normalized = normalizedOptionalString(dependency, `${path}.dependencies[${index}]`)
      if (normalized === undefined) throw new Error(`${path}.dependencies[${index}] must not be empty`)
      return normalized
    })
  }
  return task
}

function normalizedMember(value, path) {
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`)
  for (const key of Object.keys(value)) {
    if (!MEMBER_KEYS.has(key)) throw new Error(`${path}.${key} is not supported`)
  }
  const name = normalizedOptionalString(value.name, `${path}.name`)
  if (name === undefined || name.toLowerCase() === CAPTAIN_NAME) {
    throw new Error(`${path}.name must be a non-captain member name`)
  }
  const member = { name }
  for (const key of ['role', 'provider', 'model', 'reasoning_effort', 'executionPrompt']) {
    const normalized = normalizedOptionalString(value[key], `${path}.${key}`)
    if (normalized !== undefined) member[key] = normalized
  }
  if (member.provider !== undefined && member.model === undefined) {
    throw new Error(`${path}.provider requires model`)
  }
  const fallback = normalizedFallback(value.fallback, `${path}.fallback`)
  if (fallback !== undefined) member.fallback = fallback
  return member
}

function normalizedProfile(value, path) {
  if (!isPlainRecord(value)) throw new Error(`${path} must be an object`)
  for (const key of Object.keys(value)) {
    if (!PROFILE_KEYS.has(key)) throw new Error(`${path}.${key} is not supported`)
  }
  if (!Array.isArray(value.members) || value.members.length < 1 || value.members.length > MAX_MEMBERS) {
    throw new Error(`${path}.members must contain 1-${MAX_MEMBERS} members`)
  }
  const profile = { members: value.members.map((member, index) => normalizedMember(member, `${path}.members[${index}]`)) }
  const memberKeys = new Set()
  for (const member of profile.members) {
    const key = normalizedMemberKey(member.name)
    if (memberKeys.has(key)) throw new Error(`${path}.members contains duplicate names`)
    memberKeys.add(key)
  }
  for (const key of ['description', 'protocol', 'executionPrompt']) {
    const normalized = normalizedOptionalString(value[key], `${path}.${key}`)
    if (normalized !== undefined) profile[key] = normalized
  }
  const fallback = normalizedFallback(value.fallback, `${path}.fallback`)
  if (fallback !== undefined) profile.fallback = fallback
  if (value.taskPlanning !== undefined) {
    if (value.taskPlanning !== 'captain' && value.taskPlanning !== 'seed') {
      throw new Error(`${path}.taskPlanning must be captain or seed`)
    }
    profile.taskPlanning = value.taskPlanning
  }
  if (value.tasks !== undefined) {
    if (!Array.isArray(value.tasks) || value.tasks.length > MAX_TASKS) {
      throw new Error(`${path}.tasks must contain 0-${MAX_TASKS} tasks`)
    }
    profile.tasks = value.tasks.map((task, index) => normalizedTask(task, `${path}.tasks[${index}]`))
  }
  const reviewPolicy = normalizedReviewPolicy(value.reviewPolicy, `${path}.reviewPolicy`)
  if (reviewPolicy !== undefined) profile.reviewPolicy = reviewPolicy
  return profile
}

function normalizeProfileMap(value, strict) {
  if (!isPlainRecord(value)) {
    if (strict) throw new Error('AgentTeams profiles must be an object map')
    return {}
  }
  const cloned = cloneAgentTeamsProfiles(value)
  const keys = Object.keys(cloned)
  if (keys.length > MAX_PROFILES) {
    if (strict) throw new Error(`too many AgentTeams profiles (${keys.length}); the limit is ${MAX_PROFILES}`)
    return {}
  }
  const profiles = {}
  const seen = new Set()
  for (const rawName of keys) {
    const name = normalizedName(rawName)
    if (name === undefined || seen.has(name)) {
      if (strict) throw new Error(`invalid AgentTeams profile name "${rawName}"`)
      continue
    }
    seen.add(name)
    try {
      profiles[name] = normalizedProfile(cloned[rawName], `profiles.${name}`)
    } catch (error) {
      if (strict) throw error
    }
  }
  return profiles
}

export function readAgentTeamsProfiles(settings) {
  const stored = isPlainRecord(settings) ? settings.agentTeamsProfiles : undefined
  const profiles = normalizeProfileMap(stored, false)
  return {
    ...cloneAgentTeamsProfiles(BUILTIN_AGENT_TEAMS_PROFILES),
    ...profiles,
  }
}

export function getAgentTeamsProfileSnapshot({ settings = {} } = {}) {
  return {
    profiles: cloneAgentTeamsProfiles(readAgentTeamsProfiles(settings)),
    builtInNames: [...BUILTIN_AGENT_TEAMS_PROFILE_NAMES],
  }
}

export function writeAgentTeamsProfiles(profiles, {
  load = () => ({}),
  flush = () => {},
} = {}) {
  const normalized = normalizeProfileMap(profiles, true)
  const merged = {
    ...cloneAgentTeamsProfiles(BUILTIN_AGENT_TEAMS_PROFILES),
    ...normalized,
  }
  const current = load()
  if (!isPlainRecord(current)) throw new Error('desktop settings must be an object')
  const next = {
    ...current,
    agentTeamsProfiles: cloneAgentTeamsProfiles(merged),
  }
  flush(next)
  return {
    profiles: cloneAgentTeamsProfiles(merged),
    builtInNames: [...BUILTIN_AGENT_TEAMS_PROFILE_NAMES],
  }
}
