import { readImageInputChoice } from './model-input.ts'

export const REASONING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ReasoningLevel = typeof REASONING_LEVELS[number]
export const DEFAULT_REASONING_EFFORTS = Object.freeze({
  minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
})

/** Missing declarations use the editor's seven choices; malformed data blocks Save. */
export function readReasoningLevels(model: Readonly<Record<string, unknown>>): readonly ReasoningLevel[] | 'invalid' {
  const efforts = model['reasoningEfforts']
  if (efforts === undefined) return REASONING_LEVELS
  if (efforts === false) return []
  if (typeof efforts !== 'object' || efforts === null || Array.isArray(efforts)) return 'invalid'
  const entries = Object.entries(efforts)
  if (entries.length === 0 || entries.some(([key, value]) =>
    !(key === 'off' || REASONING_LEVELS.some(level => level === key))
    || !(key === 'off' && value === null || typeof value === 'string' && value.trim().length > 0))) return 'invalid'
  const selected = REASONING_LEVELS.filter(level => Object.hasOwn(efforts, level))
  return selected.length === 0 ? 'invalid' : selected
}

/** A manual edit preserves existing wire spellings and never alters other model fields. */
export function toggleReasoningLevel<T extends Record<string, unknown>>(model: T, level: ReasoningLevel, checked: boolean): T {
  const selected = readReasoningLevels(model)
  if (selected === 'invalid') return model
  const levels = REASONING_LEVELS.filter(value => value === level ? checked : selected.includes(value))
  const existing = model['reasoningEfforts']
  const previous = typeof existing === 'object' && existing !== null ? existing as Record<string, unknown> : {}
  return { ...model, reasoningEfforts: levels.length === 0 ? false : {
    ...Object.fromEntries(levels.map(value => [value, previous[value] ?? value])),
  } }
}

/** Materialize explicit defaults only in a draft/Save, leaving invalid values for validation. */
export function materializeModelChoices<T extends Record<string, unknown>>(model: T): T {
  const efforts = model['reasoningEfforts']
  const reasoningEfforts = efforts === undefined ? { ...DEFAULT_REASONING_EFFORTS }
    : readReasoningLevels(model) !== 'invalid' && typeof efforts === 'object' && efforts !== null
      ? Object.fromEntries(Object.entries(efforts).filter(([key]) => key !== 'off'))
      : efforts
  return {
    ...model,
    ...(model['input'] === undefined || Array.isArray(model['input']) && model['input'].length === 0)
      && readImageInputChoice(model) !== 'invalid' ? { input: ['text'] } : {},
    reasoningEfforts,
  }
}
