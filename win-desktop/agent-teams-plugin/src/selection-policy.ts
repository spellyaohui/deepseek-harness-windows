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

export function selectMemberCandidate(input: {
  captain: MemberSelectionCandidate
  settings: AgentTeamsSettings
  explicit: MemberRouteInput
}): MemberSelectionCandidate {
  const explicitProvider = input.explicit.provider?.trim()
  const explicitModel = input.explicit.model?.trim()
  const explicitEffort = input.explicit.reasoningEffort?.trim()
  if (input.explicit.provider !== undefined && explicitProvider === '') throw new Error('member LLM provider must not be empty')
  if (input.explicit.model !== undefined && explicitModel === '') throw new Error('member model must not be empty')
  if (input.explicit.reasoningEffort !== undefined && explicitEffort === '') throw new Error('member reasoning effort must not be empty')
  if (explicitProvider !== undefined && explicitModel === undefined) {
    throw new Error('an explicit member LLM provider requires an explicit member model')
  }
  const provider = explicitProvider ?? (input.settings.memberLlmProvider || input.captain.provider)
  const model = explicitModel ?? (input.settings.memberModel || input.captain.model)
  const sameRoute = provider === input.captain.provider && model === input.captain.model
  const reasoningEffort = explicitEffort === 'default'
    ? undefined
    : explicitEffort ?? (
      input.settings.memberReasoningMode === 'explicit'
        ? input.settings.memberReasoningEffort
        : input.settings.memberReasoningMode === 'route-aware' && sameRoute
          ? input.captain.reasoningEffort
          : undefined
    )
  return { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
}
