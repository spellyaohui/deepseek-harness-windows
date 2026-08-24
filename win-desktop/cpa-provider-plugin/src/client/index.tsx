import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { normalizeCpaProviderProfile } from '../profile.ts'

interface ProviderProfileNormalizationPayload {
  provider: string
  value: Record<string, unknown>
  failure?: string
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'settings.models/normalize-provider-profile'(
      payload: ProviderProfileNormalizationPayload,
      next: () => ProviderProfileNormalizationPayload,
    ): ProviderProfileNormalizationPayload
  }
}

export function apply(ctx: ClientContext): void {
  ctx.on('settings.models/normalize-provider-profile', (payload, next) => {
    if (payload.provider !== 'cpa') return next()
    try {
      payload.value = normalizeCpaProviderProfile(payload.value)
      return next()
    } catch (error) {
      payload.failure = error instanceof Error ? error.message : String(error)
      return payload
    }
  })
}
