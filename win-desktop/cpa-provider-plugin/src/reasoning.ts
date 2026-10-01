import type { CpaReasoningEfforts } from './types.ts'
const FULL_REASONING_EFFORTS = Object.freeze({
  minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
}) satisfies CpaReasoningEfforts
export function normalizeLegacyEffort(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'ultra' ? 'max' : normalized
}
/** Gateways declare their levels manually, independent of model names. */
export function reasoningEffortsForModel(_modelId: string): CpaReasoningEfforts {
  return FULL_REASONING_EFFORTS
}

/** Default is supplied by Harness; remove the legacy Off choice only from valid maps. */
export function normalizeManualEfforts(value: unknown): unknown {
  if (value === undefined) return FULL_REASONING_EFFORTS
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value
  const entries = Object.entries(value)
  if (!entries.some(([key]) => key !== 'off') || entries.some(([key, wire]) =>
    key !== 'off' && !Object.hasOwn(FULL_REASONING_EFFORTS, key)
    || !(key === 'off' && wire === null || typeof wire === 'string' && wire.trim().length > 0))) return value
  return Object.fromEntries(entries.filter(([key]) => key !== 'off'))
}
