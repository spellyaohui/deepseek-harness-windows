import type { CpaModelCandidate } from '../types.ts'

export type CpaCapacityField = 'contextWindow' | 'maxTokens'

export interface CpaCapacityDraft {
  contextWindow: string
  maxTokens: string
}

export type CpaCapacityDrafts = ReadonlyMap<string, CpaCapacityDraft>

export type CpaCapacityResult =
  | { ok: true; models: CpaModelCandidate[] }
  | { ok: false; modelId: string; field: CpaCapacityField }

function draftFromModel(model: CpaModelCandidate): CpaCapacityDraft {
  return {
    contextWindow: model.contextWindow === undefined ? '' : String(model.contextWindow),
    maxTokens: model.maxTokens === undefined ? '' : String(model.maxTokens),
  }
}

function parseCapacity(value: string): number | undefined | false {
  if (value === '') return undefined
  if (!/^[0-9]+$/.test(value)) return false
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : false
}

export function capacityDraftsFromModels(models: readonly CpaModelCandidate[]): Map<string, CpaCapacityDraft> {
  return new Map(models.map(model => [model.id, draftFromModel(model)]))
}

export function mergeCapacityDrafts(
  current: CpaCapacityDrafts,
  discovered: readonly CpaModelCandidate[],
): Map<string, CpaCapacityDraft> {
  const merged = new Map(current)
  for (const model of discovered) {
    if (!merged.has(model.id)) merged.set(model.id, draftFromModel(model))
  }
  return merged
}

export function applyCapacityDrafts(
  models: readonly CpaModelCandidate[],
  drafts: CpaCapacityDrafts,
): CpaCapacityResult {
  const parsedModels: CpaModelCandidate[] = []
  for (const model of models) {
    if (model.selected === false) {
      parsedModels.push(model)
      continue
    }
    const draft = drafts.get(model.id) ?? draftFromModel(model)
    const contextWindow = parseCapacity(draft.contextWindow)
    if (contextWindow === false) return { ok: false, modelId: model.id, field: 'contextWindow' }
    const maxTokens = parseCapacity(draft.maxTokens)
    if (maxTokens === false) return { ok: false, modelId: model.id, field: 'maxTokens' }
    const { contextWindow: _contextWindow, maxTokens: _maxTokens, ...base } = model
    parsedModels.push({
      ...base,
      ...(contextWindow === undefined ? {} : { contextWindow }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    })
  }
  return { ok: true, models: parsedModels }
}
