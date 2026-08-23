import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'

import {
  createSessionMarkdownExportHandler,
  SESSION_MARKDOWN_EXPORT_PATH,
} from './http.ts'

interface WebRouteHost {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
  }): () => void
}

const WEB_SERVER_KEYS = ['webServer', 'httpServer'] as const

export const name = 'session-markdown-export'
export const inject = ['sessionQuery']

export function apply(ctx: Context): void {
  const handler = createSessionMarkdownExportHandler({
    query: ctx.sessionQuery,
    logError: (error) => ctx.logger.warn(error),
  })
  let registered = false

  const registerRoute = (): void => {
    if (registered) return
    const webServer = (ctx.get(WEB_SERVER_KEYS[0]) ?? ctx.get(WEB_SERVER_KEYS[1])) as WebRouteHost | undefined
    if (webServer === undefined) return
    registered = true
    ctx.effect(() => webServer.register({
      kind: 'exact',
      path: SESSION_MARKDOWN_EXPORT_PATH,
      handler,
    }), 'session-markdown-export: HTTP route')
  }

  registerRoute()
  ctx.on('internal/service', (service) => {
    if (WEB_SERVER_KEYS.includes(service as (typeof WEB_SERVER_KEYS)[number])) registerRoute()
  })
}
