import type {
  CapabilityCheck,
  CapabilityCompatValue,
  CapabilityPatchSource,
  CapabilityStatus,
  ModelCapabilityPatch,
} from '../capability-contract.ts'

export type { CapabilityCheck, CapabilityCompatValue, CapabilityPatchSource, CapabilityStatus, ModelCapabilityPatch }

const IMAGE_INPUT = ['text', 'image'] as const
const TEXT_INPUT = ['text'] as const

/** Classify a bounded HTTP attempt without turning transient failures into facts. */
export function classifyCapabilityOutcome(outcome: {
  status?: number
  aborted?: boolean
}): CapabilityStatus {
  if (outcome.aborted === true) return 'inconclusive'
  if (outcome.status === undefined) return 'inconclusive'
  if (outcome.status >= 200 && outcome.status < 300) return 'supported'
  if (outcome.status >= 400 && outcome.status < 500 && outcome.status !== 408 && outcome.status !== 429) {
    return 'unsupported'
  }
  return 'inconclusive'
}

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
  if (checkIs(image, 'supported')) patch.input = IMAGE_INPUT
  else if (checkIs(image, 'unsupported')) patch.input = TEXT_INPUT

  const reasoning = checks['reasoning']
  if (reasoning?.status === 'supported') {
    const efforts = reasoning.efforts ?? {}
    const normalized = { ...efforts }
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
  const compatChecks: Readonly<Record<string, [string, string]>> = {
    developer: ['supportsDeveloperRole', 'developer'],
    strict: ['supportsStrictMode', 'strict'],
    store: ['supportsStore', 'store'],
    streamingUsage: ['supportsUsageInStreaming', 'streamingUsage'],
  }
  for (const [field, [property, key]] of Object.entries(compatChecks)) {
    const check = checks[key]
    if (checkIs(check, 'supported')) compat[property] = true
    else if (checkIs(check, 'unsupported')) compat[property] = false
    void field
  }

  const maxTokens = checks['maxTokens']
  if (maxTokens?.status === 'supported' && typeof maxTokens.error === 'string') {
    compat['maxTokensField'] = maxTokens.error
  }
  if (Object.keys(compat).length > 0) patch.compat = compat
  return patch
}

function isCapabilityInput(value: unknown): value is readonly ['text'] | readonly ['text', 'image'] {
  return Array.isArray(value)
    && (value.length === 1 && value[0] === 'text'
      || value.length === 2 && value[0] === 'text' && value[1] === 'image')
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Apply capability fields to a draft row without rebuilding or losing hidden
 * model fields. The source is explicit so later callers cannot silently use
 * this helper for a different precedence rule.
 */
export function applyCapabilityPatch<T extends Record<string, unknown>>(
  model: T,
  patch: ModelCapabilityPatch,
  options: { overwriteExisting: boolean; source: CapabilityPatchSource },
): T {
  const next: Record<string, unknown> = { ...model }
  const { overwriteExisting, source: _source } = options

  if (patch.input !== undefined && isCapabilityInput(patch.input)
    && (!Object.hasOwn(model, 'input') || overwriteExisting)) {
    next['input'] = [...patch.input]
  }

  if (patch.reasoningEfforts !== undefined
    && (!Object.hasOwn(model, 'reasoningEfforts') || overwriteExisting)) {
    next['reasoningEfforts'] = patch.reasoningEfforts === false
      ? false
      : { ...patch.reasoningEfforts }
  }

  if (patch.compat !== undefined) {
    const existing = isPlainRecord(model['compat']) ? model['compat'] : {}
    const merged: Record<string, unknown> = { ...existing }
    for (const [key, value] of Object.entries(patch.compat)) {
      if (!Object.hasOwn(existing, key) || overwriteExisting) merged[key] = value
    }
    next['compat'] = merged
  }

  return next as T
}
