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

export const AGENT_TEAMS_PROFILE_SCHEMA_VERSION = 2

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

const SOFTWARE_DELIVERY_PROFILE = {
  description: '通用软件交付团队：由需求分析、开发实现、测试验证和代码审查四类成员协作完成交付。',
  protocol: '先明确需求、范围和验收标准，再按任务依赖实施；实现后进行测试和独立审查。结论必须可追溯到代码或验证证据，阻塞与风险及时报告队长。',
  executionPrompt: [
    '使用中文沟通，保留代码符号、路径和命令的原文。按照队长分配的任务、范围、验收标准及依赖结果开展工作。',
    '先检查现有实现和仓库规则，区分已验证事实、推断与待确认事项。遇到阻塞及时报告队长，不擅自扩大任务范围。',
    '交付时说明结果、修改路径、实际验证及剩余风险；未执行的检查必须明确标注，不得编造通过结果。',
  ].join('\n'),
  taskPlanning: 'captain',
  members: [
    {
      name: 'analyst', role: '需求分析师', reasoning_mode: 'target-default',
      executionPrompt: [
        '你负责需求分析。使用中文输出，先阅读用户目标、现有实现和仓库规则，将事实、假设和待确认问题分开记录。',
        '明确任务范围、非目标、交付物和可验证的验收标准；识别任务依赖、兼容性约束及主要风险，向队长提供可执行的拆解建议。',
        '影响实现方向的问题应及时报告队长，并给出已有证据和可选方案；不要自行把未经确认的假设当成需求，也不要越过依赖或审批开始实现。',
        '结论关联具体代码、文档或用户要求。只完成分配的分析任务，不扩大范围；交付时说明尚未解决的问题和验收依据。',
      ].join('\n'),
    },
    {
      name: 'implementer', role: '开发工程师', reasoning_mode: 'target-default',
      executionPrompt: [
        '你负责开发实现。使用中文汇报，先检查任务合同、依赖结果、现有代码和仓库规则，在 inScope 范围内采用最小且完整的兼容修改。',
        '保留既有接口、用户数据和他人修改；复用项目现有结构，避免无关重构。发现需求矛盾、依赖缺失或范围不足时，向队长报告后等待调整。',
        '完成后执行与变更相关的实际验证，记录命令、结果和未执行的检查；不要把自检当作独立审查通过，也不要跳过失败的门禁。',
        '交付说明实现行为、changedPaths、验证证据及剩余风险；没有修改时提供具体原因。遵守任务依赖与审批，不自行发布或部署。',
      ].join('\n'),
    },
    {
      name: 'tester', role: '测试验证工程师', reasoning_mode: 'target-default',
      executionPrompt: [
        '你负责测试验证。使用中文报告，根据任务验收标准和实现差异设计检查，覆盖主要行为、边界、失败路径及相关回归。',
        '在实际环境执行适当的测试或运行检查，记录命令、环境、预期和实际结果；明确区分通过、失败、阻塞与未执行，不以静态阅读替代运行证据。',
        '失败时给出可复现步骤、相关文件和最小诊断证据，向队长报告影响及修复建议；日志和输出不得暴露凭据或用户私密数据。',
        '默认只验证，不擅自修改实现或削弱断言；需要修复时交由队长安排。只有验收证据充分才提交通过结论，保留未覆盖事项和风险。',
      ].join('\n'),
    },
    {
      name: 'reviewer', role: '代码与风险审查员', reasoning_mode: 'target-default',
      executionPrompt: [
        '你负责独立审查。使用中文报告，先对照需求、任务范围和实现差异，再核查正确性、兼容性、数据安全、错误处理及验证证据。',
        '每项发现应包含严重程度、具体文件与位置、触发条件、影响和修复建议；区分确定缺陷与待验证风险，避免只有风格偏好的泛泛意见。',
        '检查交付物与验收标准是否完整覆盖、测试是否实际执行；有阻塞缺陷时给出需要修改的结论，不因实现者声明通过而直接认可。',
        '不擅自改写实现或扩大范围。将发现和剩余风险报告队长，修复后按变更复核；证据充分且无阻塞问题时才提交审查通过。',
      ].join('\n'),
    },
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

function normalizedRequiredString(value, path) {
  const normalized = normalizedOptionalString(value, path)
  if (normalized === undefined) throw new Error(`${path} must not be empty`)
  return normalized
}

function preservedPrompt(value, path) {
  // Validate emptiness without rewriting user-authored Markdown or indentation.
  normalizedOptionalString(value, path)
  return value
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
    if (key === 'requiredReviewers') continue
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
  const provider = normalizedOptionalString(value.provider, `${path}.provider`)
  const model = normalizedOptionalString(value.model, `${path}.model`)
  const reasoning_mode = normalizedRequiredString(value.reasoning_mode, `${path}.reasoning_mode`)
  const reasoning_effort = normalizedOptionalString(value.reasoning_effort, `${path}.reasoning_effort`)
  if ((provider === undefined) !== (model === undefined)) {
    throw new Error(`${path}.provider and ${path}.model must be set together`)
  }
  if (!['target-default', 'route-aware', 'explicit'].includes(reasoning_mode)) {
    throw new Error(`${path}.reasoning_mode is invalid`)
  }
  if (reasoning_mode === 'explicit' && (provider === undefined || model === undefined || reasoning_effort === undefined)) {
    throw new Error(`${path} explicit policy requires provider, model, and reasoning_effort`)
  }
  if (reasoning_mode !== 'explicit' && reasoning_effort !== undefined) {
    throw new Error(`${path}.reasoning_effort is valid only for explicit policy`)
  }
  const member = { name, reasoning_mode }
  for (const key of ['role', 'executionPrompt']) {
    const normalized = (key === 'executionPrompt' ? preservedPrompt : normalizedOptionalString)(value[key], `${path}.${key}`)
    if (normalized !== undefined) member[key] = normalized
  }
  if (provider !== undefined) member.provider = provider
  if (model !== undefined) member.model = model
  if (reasoning_effort !== undefined) member.reasoning_effort = reasoning_effort
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
    const normalized = (key === 'description' ? normalizedOptionalString : preservedPrompt)(value[key], `${path}.${key}`)
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

function readProfileDocument(settings) {
  const stored = isPlainRecord(settings) ? settings.agentTeamsProfiles : undefined
  const builtIns = cloneAgentTeamsProfiles(BUILTIN_AGENT_TEAMS_PROFILES)
  if (stored === undefined) {
    return {
      schemaVersion: AGENT_TEAMS_PROFILE_SCHEMA_VERSION,
      profiles: builtIns,
      unsupportedPersistedVersion: false,
    }
  }
  if (
    !isPlainRecord(stored)
    || stored.schemaVersion !== AGENT_TEAMS_PROFILE_SCHEMA_VERSION
    || !isPlainRecord(stored.profiles)
  ) {
    return {
      schemaVersion: AGENT_TEAMS_PROFILE_SCHEMA_VERSION,
      profiles: builtIns,
      unsupportedPersistedVersion: true,
    }
  }
  const profiles = normalizeProfileMap(stored.profiles, false)
  return {
    schemaVersion: AGENT_TEAMS_PROFILE_SCHEMA_VERSION,
    profiles: { ...builtIns, ...profiles },
    unsupportedPersistedVersion: false,
  }
}

function normalizeProfileDocumentForWrite(value) {
  if (!isPlainRecord(value)) throw new Error('AgentTeams profile document must be an object')
  for (const key of Object.keys(value)) {
    if (key !== 'schemaVersion' && key !== 'profiles') {
      throw new Error(`AgentTeams profile document.${key} is not supported`)
    }
  }
  if (value.schemaVersion !== AGENT_TEAMS_PROFILE_SCHEMA_VERSION) {
    throw new Error(`AgentTeams profile document.schemaVersion must be ${AGENT_TEAMS_PROFILE_SCHEMA_VERSION}`)
  }
  return normalizeProfileMap(value.profiles, true)
}

export function readAgentTeamsProfiles(settings) {
  return cloneAgentTeamsProfiles(readProfileDocument(settings).profiles)
}

export function getAgentTeamsProfileSnapshot({ settings = {} } = {}) {
  const document = readProfileDocument(settings)
  return {
    schemaVersion: AGENT_TEAMS_PROFILE_SCHEMA_VERSION,
    profiles: cloneAgentTeamsProfiles(document.profiles),
    builtInNames: [...BUILTIN_AGENT_TEAMS_PROFILE_NAMES],
    builtInProfiles: cloneAgentTeamsProfiles(BUILTIN_AGENT_TEAMS_PROFILES),
    unsupportedPersistedVersion: document.unsupportedPersistedVersion,
    hasPersistedProfiles: isPlainRecord(settings) && isPlainRecord(settings.agentTeamsProfiles)
      && settings.agentTeamsProfiles.schemaVersion === AGENT_TEAMS_PROFILE_SCHEMA_VERSION
      && isPlainRecord(settings.agentTeamsProfiles.profiles),
  }
}

export function writeAgentTeamsProfiles(profileDocument, {
  load = () => ({}),
  flush = () => {},
} = {}) {
  const normalized = normalizeProfileDocumentForWrite(profileDocument)
  const merged = {
    ...cloneAgentTeamsProfiles(BUILTIN_AGENT_TEAMS_PROFILES),
    ...normalized,
  }
  if (Object.keys(merged).length > MAX_PROFILES) {
    throw new Error(`too many AgentTeams profiles after built-in merge (${Object.keys(merged).length}); the limit is ${MAX_PROFILES}`)
  }
  const current = load()
  if (!isPlainRecord(current)) throw new Error('desktop settings must be an object')
  const next = {
    ...current,
    agentTeamsProfiles: {
      schemaVersion: AGENT_TEAMS_PROFILE_SCHEMA_VERSION,
      profiles: cloneAgentTeamsProfiles(merged),
    },
  }
  flush(next)
  return {
    schemaVersion: AGENT_TEAMS_PROFILE_SCHEMA_VERSION,
    profiles: cloneAgentTeamsProfiles(merged),
    builtInNames: [...BUILTIN_AGENT_TEAMS_PROFILE_NAMES],
    builtInProfiles: cloneAgentTeamsProfiles(BUILTIN_AGENT_TEAMS_PROFILES),
    unsupportedPersistedVersion: false,
  }
}
