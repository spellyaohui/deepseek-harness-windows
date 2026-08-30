/** JSON-safe statuses emitted by the model capability probe. */
export type CapabilityStatus = 'supported' | 'unsupported' | 'inconclusive' | 'not-applicable'

/** One redacted result for one probe category. */
export interface CapabilityCheck {
  status: CapabilityStatus
  summary: string
  error?: string
  efforts?: Readonly<Record<string, string | null>>
  allEffortsUnsupported?: boolean
  noneRejected?: boolean
  omittedReasoningSupported?: boolean
}

export type CapabilityChecks = Readonly<Record<string, CapabilityCheck>>
export type ReasoningEffortKey = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type ReasoningEffortWire = string | null
export type CapabilityInput = readonly ['text'] | readonly ['text', 'image']
export type CapabilityCompatValue = boolean | string

/** The only model fields the probe may propose. */
export interface ModelCapabilityPatch {
  input?: CapabilityInput
  reasoningEfforts?: false | Readonly<Partial<Record<ReasoningEffortKey, ReasoningEffortWire>>>
  compat?: Readonly<Record<string, CapabilityCompatValue>>
}

/** Complete result returned to the draft editor; it contains no secret data. */
export interface ModelCapabilityProbeResult {
  modelId: string
  protocol: string
  checks: CapabilityChecks
  patch: ModelCapabilityPatch
}

export type CapabilityPatchSource = 'probe' | 'discovery'
