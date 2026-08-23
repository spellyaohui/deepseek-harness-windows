import { normalizeCpaBaseURL } from './address.ts'
import { reasoningEffortsForModel } from './reasoning.ts'
import type { CpaDraft, CpaModelCandidate, CpaModelProfile, CpaProviderProfile } from './types.ts'

/** Merge a fresh listing with configured rows the endpoint temporarily omitted. */
export function mergeCpaCandidates(
  configured: readonly CpaModelCandidate[],
  discovered: readonly CpaModelCandidate[],
): CpaModelCandidate[] {
  const merged = new Map<string, CpaModelCandidate>()
  for (const candidate of discovered) {
    const id = candidate.id.trim()
    if (id !== '' && !merged.has(id)) merged.set(id, { ...candidate, id })
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
    models: buildCpaModels(draft.models),
  }
}
