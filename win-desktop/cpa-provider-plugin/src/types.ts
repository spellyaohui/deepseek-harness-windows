export type CpaReasoningKey = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type CpaReasoningWire = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type CpaReasoningEfforts = Readonly<Partial<Record<CpaReasoningKey, CpaReasoningWire>>>

export interface CpaModelCandidate {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  selected?: boolean
}

export interface CpaModelProfile {
  id: string
  name: string
  contextWindow?: number
  maxTokens?: number
  reasoningEfforts: CpaReasoningEfforts
}

export interface CpaDraft {
  baseURL: string
  token: string
  models: readonly CpaModelCandidate[]
}

export interface CpaProviderProfile {
  displayName: 'CPA / CLIProxyAPI'
  apiKeyEnv: 'CPA_API_KEY'
  api: 'openai-responses'
  baseURL: string
  models: CpaModelProfile[]
}
