import type { CpaReasoningEfforts } from './types.ts'

const FULL_REASONING_EFFORTS = Object.freeze({
  off: 'none',
  minimal: 'minimal',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
} as const satisfies CpaReasoningEfforts)

const GPT_5_6_REASONING_EFFORTS = Object.freeze({
  off: 'none',
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'max',
} as const satisfies CpaReasoningEfforts)

const GPT_5_6_FAMILY = /(?:^|[\/:_.-])gpt-5\.6(?:$|[\/:_.-])/i

/** Normalize historical desktop values before validating them against a model. */
export function normalizeLegacyEffort(value: string): string {
  const normalized = value.trim().toLowerCase()
  return normalized === 'ultra' ? 'max' : normalized
}

/** Return the ordered Harness-id to CPA-wire effort map for one exact model id. */
export function reasoningEffortsForModel(modelId: string): CpaReasoningEfforts {
  return GPT_5_6_FAMILY.test(modelId) ? GPT_5_6_REASONING_EFFORTS : FULL_REASONING_EFFORTS
}
