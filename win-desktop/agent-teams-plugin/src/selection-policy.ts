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

function optionalNonBlank(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === '' ? undefined : normalized
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
