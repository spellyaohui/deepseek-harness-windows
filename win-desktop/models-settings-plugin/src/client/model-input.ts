export type ModelInputDraft = Readonly<Record<string, unknown>>
export type ImageInputChoice = 'auto' | 'image' | 'text-only'
export type ImageInputState = ImageInputChoice | 'invalid'

function isModality(value: unknown): value is 'text' | 'image' {
  return value === 'text' || value === 'image'
}

export function readImageInputChoice(model: ModelInputDraft): ImageInputState {
  const input = model['input']
  if (input === undefined) return 'auto'
  if (!Array.isArray(input)) return 'invalid'
  if (input.length === 0) return 'auto'
  if (!input.every(isModality)) return 'invalid'
  return input.includes('image') ? 'image' : 'text-only'
}

export function applyImageInputChoice(
  model: ModelInputDraft,
  choice: ImageInputChoice,
): Record<string, unknown> {
  const next = { ...model }
  if (choice === 'auto') Reflect.deleteProperty(next, 'input')
  else next['input'] = choice === 'image' ? ['text', 'image'] : ['text']
  return next
}

export function applyImageInputChoiceToAll(
  models: readonly ModelInputDraft[],
  choice: ImageInputChoice,
): Record<string, unknown>[] {
  return models.map(model => applyImageInputChoice(model, choice))
}
