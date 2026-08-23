import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client'
import { normalizeCpaBaseURL } from '../address.ts'
import { buildCpaProfile } from '../profile.ts'
import type { CpaDraft, CpaModelCandidate } from '../types.ts'

const SETTINGS_NAMESPACE = 'llm-pi-ai'
const PROVIDER = 'cpa'
const CREDENTIAL_REF = 'CPA_API_KEY'

type CpaApi = Pick<IApiClient, 'llm' | 'settings' | 'credentials'>

export type CpaSaveResult =
  | { ok: true }
  | { ok: false; stage: 'profile' | 'credential'; message: string }

export interface CpaControllerOptions {
  timeoutMs?: number
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function within<T>(
  promise: Promise<T>,
  timeoutMs: number,
  setTimeoutFn: typeof setTimeout,
  clearTimeoutFn: typeof clearTimeout,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeoutFn(() => { reject(new Error(`CPA model discovery timed out after ${timeoutMs}ms`)) }, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeoutFn(timer)
  }
}

/** Create one card-scoped controller. A credential retry retains profile commit state. */
export function createCpaController(api: CpaApi, options: CpaControllerOptions = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout
  let profileCommitted = false

  return {
    async discover(draft: Pick<CpaDraft, 'baseURL' | 'token'>): Promise<CpaModelCandidate[]> {
      const baseURL = normalizeCpaBaseURL(draft.baseURL)
      const apiKey = draft.token.trim()
      const response = await within(api.llm.discoverModels({
        settingsNs: SETTINGS_NAMESPACE,
        provider: PROVIDER,
        api: 'openai-responses',
        baseURL,
        ...apiKey === '' ? {} : { apiKey },
      }), timeoutMs, setTimeoutFn, clearTimeoutFn)
      if (!response.result.ok) throw new Error(response.result.error.message)

      const seen = new Set<string>()
      const models: CpaModelCandidate[] = []
      for (const candidate of response.result.value.models) {
        const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
        if (id === '' || seen.has(id)) continue
        seen.add(id)
        models.push({
          id,
          name: typeof candidate.name === 'string' && candidate.name.trim() !== '' ? candidate.name.trim() : id,
          ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow },
          ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens },
          selected: true,
        })
      }
      if (models.length === 0) throw new Error('CPA returned no usable models')
      return models
    },

    async save(draft: CpaDraft, expectedRevision: number): Promise<CpaSaveResult> {
      if (!profileCommitted) {
        try {
          const response = await api.settings.mutate({
            ns: SETTINGS_NAMESPACE,
            expectedRevision,
            ops: [{ op: 'set', path: ['providers', PROVIDER], value: buildCpaProfile(draft) }],
          })
          if (!response.result.ok) {
            return { ok: false, stage: 'profile', message: response.result.error.message }
          }
          profileCommitted = true
        } catch (error) {
          return { ok: false, stage: 'profile', message: messageOf(error) }
        }
      }

      const value = draft.token.trim()
      if (value !== '') {
        try {
          const response = await api.credentials.set({ ref: CREDENTIAL_REF, value })
          if (!response.result.ok) {
            return { ok: false, stage: 'credential', message: response.result.error.message }
          }
        } catch (error) {
          return { ok: false, stage: 'credential', message: messageOf(error) }
        }
      }

      profileCommitted = false
      return { ok: true }
    },
  }
}
