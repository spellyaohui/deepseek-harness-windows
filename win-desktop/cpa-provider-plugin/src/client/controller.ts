import type {
  LlmDiscoveredModel,
  LlmModelDiscoveryRequest,
  SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'
import { snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import { normalizeCpaBaseURL } from '../address.ts'
import { buildCpaProfile } from '../profile.ts'
import type { CpaDraft, CpaModelCandidate } from '../types.ts'

const SETTINGS_NAMESPACE = 'llm-pi-ai'
const PROVIDER = 'cpa'
const CREDENTIAL_REF = 'CPA_API_KEY'
type RemoteResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

interface CpaApi {
  readonly llm: {
    discoverModels(
      settingsNs: string,
      request: LlmModelDiscoveryRequest,
      signal?: AbortSignal,
    ): Promise<RemoteResult<LlmDiscoveredModel[]>>
  }
  readonly settings: {
    mutate(
      ns: string,
      ops: SettingsPathOpView[],
      expectedRevision: number | undefined,
    ): Promise<RemoteResult<unknown>>
  }
  readonly credentials: {
    set(ref: string, value: string): Promise<RemoteResult<void>>
  }
}
export type CpaSaveResult =
  | { ok: true }
  | { ok: false; stage: 'profile' | 'credential'; message: string }
export interface CpaControllerOptions { timeoutMs?: number; setTimeoutFn?: typeof setTimeout; clearTimeoutFn?: typeof clearTimeout }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error) }
function profileValue(draft: CpaDraft): JsonValue {
  const profile = snapshotJsonValue(buildCpaProfile(draft))
  if (profile === undefined) throw new Error('CPA profile is not losslessly JSON-serializable')
  return profile as unknown as JsonValue
}
async function within<T>(promise: Promise<T>, timeoutMs: number, setTimeoutFn: typeof setTimeout, clearTimeoutFn: typeof clearTimeout): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeoutFn(() => { reject(new Error(`CPA model discovery timed out after ${timeoutMs}ms`)) }, timeoutMs) })])
  } finally { if (timer !== undefined) clearTimeoutFn(timer) }
}
export function createCpaController(api: CpaApi, options: CpaControllerOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout
  let profileCommitted = false
  return {
    async discover(draft: Pick<CpaDraft, 'baseURL' | 'token'>): Promise<CpaModelCandidate[]> {
      const baseURL = normalizeCpaBaseURL(draft.baseURL)
      const apiKey = draft.token.trim()
      const response = await within(api.llm.discoverModels(SETTINGS_NAMESPACE, { provider: PROVIDER, api: 'openai-responses', baseURL, ...apiKey === '' ? {} : { apiKey } }), timeoutMs, setTimeoutFn, clearTimeoutFn)
      if (!response.ok) throw new Error(response.error.message)
      const seen = new Set<string>(); const models: CpaModelCandidate[] = []
      for (const candidate of response.value) {
        const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
        if (id === '' || seen.has(id)) continue
        seen.add(id)
        models.push({ id, name: typeof candidate.name === 'string' && candidate.name.trim() !== '' ? candidate.name.trim() : id, ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow }, ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens }, selected: true })
      }
      if (models.length === 0) throw new Error('CPA returned no usable models')
      return models
    },
    async save(draft: CpaDraft, expectedRevision: number, onStage: (stage: 'profile' | 'credential') => void = () => {}): Promise<CpaSaveResult> {
      if (!profileCommitted) {
        onStage('profile')
        try {
          const response = await api.settings.mutate(SETTINGS_NAMESPACE, [{ op: 'set', path: ['providers', PROVIDER], value: profileValue(draft) }], expectedRevision)
          if (!response.ok) return { ok: false, stage: 'profile', message: response.error.message }
          profileCommitted = true
        } catch (error) { return { ok: false, stage: 'profile', message: messageOf(error) }
        }
      }
      const value = draft.token.trim()
      if (value !== '') {
        onStage('credential')
        try {
          const response = await api.credentials.set(CREDENTIAL_REF, value)
          if (!response.ok) return { ok: false, stage: 'credential', message: response.error.message }
        } catch (error) { return { ok: false, stage: 'credential', message: messageOf(error) }
        }
      }
      profileCommitted = false
      return { ok: true }
    },
  }
}
