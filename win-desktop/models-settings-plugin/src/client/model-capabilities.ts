import type {
  CapabilityCheck,
  CapabilityCompatValue,
  CapabilityPatchSource,
  CapabilityStatus,
  ModelCapabilityPatch,
  ModelCapabilityProbeResult,
} from '../capability-contract.ts'
import { capabilityPatchFromChecks } from '../capability-contract.ts'
import { readImageInputChoice } from './model-input.ts'

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
  if (outcome.status === 401 || outcome.status === 403 || outcome.status === 407) return 'inconclusive'
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
    && (readImageInputChoice(model) === 'auto' || overwriteExisting)) {
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

/**
 * Apply one completed probe to every matching draft row without writing
 * settings. Duplicate ids are deliberately all updated: the parent save gate
 * still rejects duplicates, but a user who is correcting a duplicate should
 * not see one visually identical row behave differently from the other.
 */
export function applyCapabilityProbeResult<T extends Record<string, unknown>>(
  models: readonly T[],
  result: ModelCapabilityProbeResult,
  overwriteExisting: boolean,
): T[] {
  return models.map(model => typeof model['id'] === 'string' && model['id'].trim() === result.modelId
    ? applyCapabilityPatch(model, result.patch, { overwriteExisting, source: 'probe' })
    : model)
}

/** Collapse the matrix into one cautious row-level status for the editor. */
export function capabilityResultStatus(result: ModelCapabilityProbeResult): CapabilityStatus {
  const statuses = Object.values(result.checks).map(check => check.status)
  if (statuses.includes('inconclusive')) return 'inconclusive'
  if (statuses.includes('supported')) return 'supported'
  if (statuses.includes('unsupported')) return 'unsupported'
  return 'not-applicable'
}
