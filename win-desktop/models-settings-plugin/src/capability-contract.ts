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

function checkIs(check: CapabilityCheck | undefined, status: CapabilityStatus): boolean {
  return check?.status === status
}

/** Convert successful/explicitly unsupported checks into the canonical pi-ai patch. */
export function capabilityPatchFromChecks(
  checks: Readonly<Record<string, CapabilityCheck>>,
): ModelCapabilityPatch {
  const patch: {
    input?: readonly ['text'] | readonly ['text', 'image']
    reasoningEfforts?: false | Readonly<Record<string, string | null>>
    compat?: Record<string, CapabilityCompatValue>
  } = {}

  const image = checks['image']
  if (checkIs(image, 'supported')) patch.input = ['text', 'image']
  else if (checkIs(image, 'unsupported')) patch.input = ['text']

  const reasoning = checks['reasoning']
  if (reasoning?.status === 'supported') {
    const normalized = { ...(reasoning.efforts ?? {}) }
    // A rejected wire `none` is not an explicit off value. When the request
    // without any reasoning parameter works, pi-ai represents that fact as
    // `off: null`, which means "omit the parameter".
    if (reasoning.noneRejected === true && reasoning.omittedReasoningSupported === true) {
      normalized['off'] = null
    }
    if (Object.keys(normalized).length > 0) patch.reasoningEfforts = normalized
  } else if (reasoning?.status === 'unsupported' && reasoning.allEffortsUnsupported === true) {
    patch.reasoningEfforts = false
  }

  const compat: Record<string, CapabilityCompatValue> = {}
  const compatChecks: ReadonlyArray<[string, string]> = [
    ['supportsDeveloperRole', 'developer'],
    ['supportsStrictMode', 'strict'],
    ['supportsStore', 'store'],
    ['supportsUsageInStreaming', 'streamingUsage'],
  ]
  for (const [property, key] of compatChecks) {
    const check = checks[key]
    if (checkIs(check, 'supported')) compat[property] = true
    else if (checkIs(check, 'unsupported')) compat[property] = false
  }

  const maxTokens = checks['maxTokens']
  if (maxTokens?.status === 'supported' && typeof maxTokens.error === 'string') {
    compat['maxTokensField'] = maxTokens.error
  }
  if (Object.keys(compat).length > 0) patch.compat = compat
  return patch
}
