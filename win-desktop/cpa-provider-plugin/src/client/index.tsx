import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import { CpaProviderCard } from './CpaProviderCard.tsx'
import { en, zh, type CpaLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.cpa': CpaLocaleKey
  }
}

export type CpaProviderCardProps = PropsRuntime<'settings.models.card'> & {
  cpaT: (key: CpaLocaleKey) => string
  cardName: 'CPA / CLIProxyAPI'
}

const NS = 'settings.cpa'
const CARD_NAME = 'CPA / CLIProxyAPI' as const

export const inject = ['slots', 'locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'cpa-provider: locale')
  const cpaT = ctx.locale.bind(NS) as CpaProviderCardProps['cpaT']
  ctx.slots.inject('settings.models.card', () => ctx.slots.register({
    name: 'settings.models.card',
    id: 'cpa',
    order: -100,
    inject: () => ({ cpaT, cardName: CARD_NAME }),
  }, CpaProviderCard))
}
