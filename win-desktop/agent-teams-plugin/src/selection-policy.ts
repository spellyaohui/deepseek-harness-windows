export type RoleReasoningMode = 'target-default' | 'route-aware' | 'explicit'

export interface MemberRolePolicy {
  provider?: string
  model?: string
  reasoningEffort?: string
  reasoningMode: RoleReasoningMode
}

export function validateMemberRolePolicy(input: {
  provider?: string
  model?: string
  reasoningEffort?: string
  reasoningMode?: unknown
}): asserts input is MemberRolePolicy {
  if (input.reasoningMode !== 'target-default'
    && input.reasoningMode !== 'route-aware'
    && input.reasoningMode !== 'explicit') {
    throw new Error('member reasoning mode must be target-default, route-aware, or explicit')
  }
  const provider = optionalNonBlank(input.provider)
  const model = optionalNonBlank(input.model)
  const effort = optionalNonBlank(input.reasoningEffort)
  if ((provider === undefined) !== (model === undefined)) {
    throw new Error('an explicit member LLM provider requires an explicit member model')
  }
  if (input.reasoningMode !== 'explicit' && effort !== undefined) {
    throw new Error('reasoning effort is only valid in explicit member policy mode')
  }
  if (input.reasoningMode === 'explicit' && (provider === undefined || model === undefined || effort === undefined)) {
    throw new Error('explicit member policy requires provider, model, and reasoning effort')
  }
}

export interface MemberSelectionCandidate {
  provider: string
  model: string
  reasoningEffort?: string
}

/** The frozen model-policy fields used to seed a numbered role member. */
export interface MemberRoleTemplate {
  name: string
  role?: string
  provider: string
  model: string
  reasoningMode: RoleReasoningMode
  reasoningEffort?: string
  fallback?: { provider: string; model: string }
}

export type MemberRoleTemplateMatch =
  | { kind: 'matched'; template: MemberRoleTemplate }
  | { kind: 'none' }
  | { kind: 'ambiguous'; templates: readonly MemberRoleTemplate[] }

function optionalNonBlank(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
}

function normalizedRoleText(value: string | undefined): string {
  return (value ?? '').trim().replace(/[-_]+/gu, ' ').replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
}

/**
 * Return the unnumbered role name for a positive numeric member suffix.
 *
 * `reviewer2`, `reviewer-3`, `reviewer_4`, and `reviewer 5` all resolve to
 * `reviewer`. A plain name is not numbered, so the first member remains the
 * only template and a previously-created numbered member cannot shadow it.
 */
function numberedRoleBase(value: string): string | undefined {
  const normalized = normalizedRoleText(value)
  const match = /^(.*?)(?:\s*)([1-9]\d*)$/u.exec(normalized)
  const base = match?.[1]?.trim()
  return base === undefined || base === '' ? undefined : base
}

/**
 * Find the frozen base-role policy for a newly named member.
 *
 * Matching is deliberately provider/model neutral. The exact unnumbered name
 * wins first; a role description is only a fallback. Ambiguous descriptions
 * are reported to the caller so it can require an explicit route instead of
 * choosing an arbitrary model.
 */
export function findMemberRoleTemplate(input: {
  memberName: string
  role?: string
  members: readonly MemberRoleTemplate[]
}): MemberRoleTemplateMatch {
  const base = numberedRoleBase(input.memberName)
  if (base !== undefined) {
    const nameMatches = input.members.filter((member) => (
      numberedRoleBase(member.name) === undefined
        && normalizedRoleText(member.name) === base
    ))
    if (nameMatches.length === 1) return { kind: 'matched', template: nameMatches[0]! }
    if (nameMatches.length > 1) return { kind: 'ambiguous', templates: nameMatches }
  }

  const role = normalizedRoleText(input.role)
  if (role === '') return { kind: 'none' }
  const roleMatches = input.members.filter((member) => normalizedRoleText(member.role) === role)
  if (roleMatches.length === 1) return { kind: 'matched', template: roleMatches[0]! }
  if (roleMatches.length > 1) return { kind: 'ambiguous', templates: roleMatches }
  return { kind: 'none' }
}

export function selectMemberCandidate(input: {
  captain: MemberSelectionCandidate
  role: MemberRolePolicy
}): MemberSelectionCandidate {
  validateMemberRolePolicy(input.role)
  const provider = optionalNonBlank(input.role.provider)
  const model = optionalNonBlank(input.role.model)
  const effort = optionalNonBlank(input.role.reasoningEffort)
  const targetProvider = provider ?? input.captain.provider
  const targetModel = model ?? input.captain.model
  const sameRoute = targetProvider === input.captain.provider && targetModel === input.captain.model
  const reasoningEffort = input.role.reasoningMode === 'explicit'
    ? effort
    : input.role.reasoningMode === 'route-aware' && sameRoute
      ? input.captain.reasoningEffort
      : undefined
  return {
    provider: targetProvider,
    model: targetModel,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}
