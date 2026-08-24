import type { AgentTeamsSettings } from './settings.ts'

export interface MemberRouteInput {
  provider?: string
  model?: string
  reasoningEffort?: string
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
  settings: AgentTeamsSettings
  explicit: MemberRouteInput
}): MemberSelectionCandidate {
  if (input.settings.memberReasoningMode === 'explicit') {
    return {
      provider: input.settings.memberLlmProvider || input.captain.provider,
      model: input.settings.memberModel || input.captain.model,
      reasoningEffort: input.settings.memberReasoningEffort,
    }
  }

  const explicitProvider = optionalNonBlank(input.explicit.provider)
  const explicitModel = optionalNonBlank(input.explicit.model)
  const explicitEffort = optionalNonBlank(input.explicit.reasoningEffort)
  if (explicitProvider !== undefined && explicitModel === undefined) {
    throw new Error('an explicit member LLM provider requires an explicit member model')
  }
  const provider = explicitProvider ?? (input.settings.memberLlmProvider || input.captain.provider)
  const model = explicitModel ?? (input.settings.memberModel || input.captain.model)
  const sameRoute = provider === input.captain.provider && model === input.captain.model
  const reasoningEffort = explicitEffort === 'default'
    ? undefined
    : explicitEffort ?? (input.settings.memberReasoningMode === 'route-aware' && sameRoute
      ? input.captain.reasoningEffort
      : undefined)
  return { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
}
