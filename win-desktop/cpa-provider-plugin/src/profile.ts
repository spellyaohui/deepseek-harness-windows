import { normalizeCpaBaseURL } from './address.ts'
import { reasoningEffortsForModel } from './reasoning.ts'
import type { CpaDraft, CpaInputModality, CpaModelCandidate, CpaModelProfile, CpaProviderProfile } from './types.ts'

type UnknownRecord = Record<string, unknown>

const CPA_INPUT_MODALITIES: CpaInputModality[] = ['text', 'image']

/** Merge a fresh listing with configured rows the endpoint temporarily omitted. */
export function mergeCpaCandidates(
  configured: readonly CpaModelCandidate[],
  discovered: readonly CpaModelCandidate[],
): CpaModelCandidate[] {
  const configuredById = new Map(configured.map(candidate => [candidate.id.trim(), candidate]))
  const merged = new Map<string, CpaModelCandidate>()
  for (const candidate of discovered) {
    const id = candidate.id.trim()
    if (id === '' || merged.has(id)) continue
    const previous = configuredById.get(id)
    const next = { ...previous, ...candidate, id }
    if (candidate.contextWindow === undefined && previous?.contextWindow !== undefined) {
      next.contextWindow = previous.contextWindow
    }
    if (candidate.maxTokens === undefined && previous?.maxTokens !== undefined) {
      next.maxTokens = previous.maxTokens
    }
    merged.set(id, next)
  }
  for (const candidate of configured) {
    const id = candidate.id.trim()
    if (id !== '' && !merged.has(id)) merged.set(id, { ...candidate, id })
  }
  return [...merged.values()]
}

/** Convert selected discovery candidates to the exact pi-ai model profile. */
export function buildCpaModels(candidates: readonly CpaModelCandidate[]): CpaModelProfile[] {
  const seen = new Set<string>()
  const models: CpaModelProfile[] = []
  for (const candidate of candidates) {
    if (candidate.selected === false) continue
    const id = candidate.id.trim()
    if (id === '' || seen.has(id)) continue
    seen.add(id)
    const name = candidate.name?.trim() || id
    models.push({
      id,
      name,
      ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow },
      ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens },
      input: [...CPA_INPUT_MODALITIES],
      reasoningEfforts: reasoningEffortsForModel(id),
    })
  }
  if (models.length === 0) throw new Error('Select at least one model')
  return models
}

/** Assemble the stable redacted CPA provider route. */
export function buildCpaProfile(draft: CpaDraft): CpaProviderProfile {
  return {
    displayName: 'CPA / CLIProxyAPI',
    apiKeyEnv: 'CPA_API_KEY',
    api: 'openai-responses',
    baseURL: normalizeCpaBaseURL(draft.baseURL),
    defaultInput: [...CPA_INPUT_MODALITIES],
    models: buildCpaModels(draft.models),
  }
}

/**
 * Normalize a CPA profile edited through Harness's native provider editor.
 * Provider-specific facts stay here so the generic Models fork remains
 * provider-neutral. Unknown fields and raw capacity numbers are preserved.
 */
export function normalizeCpaProviderProfile(value: UnknownRecord): UnknownRecord {
  const baseURL = value['baseURL']
  if (typeof baseURL !== 'string') throw new Error('CPA API address is required')

  const rawModels = value['models']
  if (!Array.isArray(rawModels)) throw new Error('Select at least one model')

  const models = rawModels.map((rawModel) => {
    if (typeof rawModel !== 'object' || rawModel === null || Array.isArray(rawModel)) return rawModel
    const model = rawModel as UnknownRecord
    const id = typeof model['id'] === 'string' ? model['id'].trim() : ''
    if (id === '') return model
    const input = Array.isArray(model['input']) && model['input'].length > 0
      ? model['input']
      : [...CPA_INPUT_MODALITIES]
    return {
      ...model,
      id,
      input,
      reasoningEfforts: reasoningEffortsForModel(id),
    }
  })

  return {
    ...value,
    displayName: 'CPA / CLIProxyAPI',
    apiKeyEnv: 'CPA_API_KEY',
    api: 'openai-responses',
    baseURL: normalizeCpaBaseURL(baseURL),
    // CPA is a multimodal gateway by contract. Keep a per-model ['text']
    // override when a deployment has a genuinely text-only model, but do not
    // let an old route-level text-only default disable image admission for
    // newly added CPA models.
    defaultInput: [...CPA_INPUT_MODALITIES],
    models,
  }
}
