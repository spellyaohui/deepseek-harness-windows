import type { Context } from '@deepseek-ai/cordis'
// Type-only imports merge the official Alpha.2 Session-header slot, renderer,
// Session standard props, and locale services.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'

import { SessionMarkdownExportHeaderAction, type SessionMarkdownExportInjected } from './HeaderAction.tsx'
import { SessionMarkdownExportController } from './controller.ts'
import { en, NS, zh, type SessionMarkdownExportKey } from './locales.ts'
import { ensureSessionMarkdownExportStyles } from './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'session-markdown-export': SessionMarkdownExportKey
  }
}

export const inject = ['slots', 'locale']

export function apply(ctx: Context): void {
  ensureSessionMarkdownExportStyles()
  const controller = new SessionMarkdownExportController()
  ctx.effect(() => async () => {
    await controller.dispose()
  }, 'session-markdown-export: browser download lifecycle')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-markdown-export: browser dictionaries')
  ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: 'session-markdown-export',
    locale: NS,
    inject: (): SessionMarkdownExportInjected => ({
      hooks: { sessionMarkdownExport: controller.store },
      request: (sessionId) => controller.download(sessionId),
      dismiss: (sessionId) => controller.dismiss(sessionId),
    }),
  }, SessionMarkdownExportHeaderAction))
}
