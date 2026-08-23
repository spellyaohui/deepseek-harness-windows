import type { ModelsSettingsState } from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { CpaModelCandidate } from '../types.ts'

export interface CpaSettingsView {
  status: ModelsSettingsState['status']
  writable: boolean
  revision: number | undefined
  baseURL: string
  models: CpaModelCandidate[]
  credentialConfigured: boolean
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function readModels(value: unknown): CpaModelCandidate[] {
  if (!Array.isArray(value)) return []
  const models: CpaModelCandidate[] = []
  for (const candidate of value) {
    const row = recordOf(candidate)
    const id = typeof row?.['id'] === 'string' ? row['id'].trim() : ''
    if (id === '') continue
    const name = typeof row?.['name'] === 'string' && row['name'].trim() !== '' ? row['name'].trim() : id
    const contextWindow = numberOf(row?.['contextWindow'])
    const maxTokens = numberOf(row?.['maxTokens'])
    models.push({
      id,
      name,
      ...contextWindow === undefined ? {} : { contextWindow },
      ...maxTokens === undefined ? {} : { maxTokens },
      selected: true,
    })
  }
  return models
}

/** Project the redacted shared Models snapshot into CPA card state. */
export function cpaSettingsView(state: ModelsSettingsState): CpaSettingsView {
  const namespace = state.namespaces.get('llm-pi-ai')
  const root = recordOf(namespace?.value)
  const providers = recordOf(root?.['providers'])
  const profile = recordOf(providers?.['cpa'])
  const row = state.rows.find(candidate => candidate.entry.provider === 'cpa')
  return {
    status: state.status,
    writable: state.writable,
    revision: namespace?.revision,
    baseURL: typeof profile?.['baseURL'] === 'string' ? profile['baseURL'] : '',
    models: readModels(profile?.['models']),
    credentialConfigured: row?.credential?.configured === true,
  }
}
