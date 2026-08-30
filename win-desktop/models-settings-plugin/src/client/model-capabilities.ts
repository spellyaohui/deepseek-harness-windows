import type {
  CapabilityCheck,
  CapabilityCompatValue,
  CapabilityPatchSource,
  CapabilityStatus,
  ModelCapabilityPatch,
} from '../capability-contract.ts'
import { capabilityPatchFromChecks } from '../capability-contract.ts'

export type { CapabilityCheck, CapabilityCompatValue, CapabilityPatchSource, CapabilityStatus, ModelCapabilityPatch }
export { capabilityPatchFromChecks }

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
