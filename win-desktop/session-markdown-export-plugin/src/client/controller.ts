import {
  createSnapshotStore,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

export type SessionMarkdownExportStatus = 'preparing' | 'success' | 'error'

export interface SessionMarkdownExportEntry {
  readonly open: boolean
  readonly status: SessionMarkdownExportStatus
  readonly error: string | null
}

export interface SessionMarkdownExportState {
  bySession: Record<string, SessionMarkdownExportEntry | undefined>
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>
type Save = (url: string) => void

const INITIAL: SessionMarkdownExportState = { bySession: {} }

export function downloadUrl(url: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.click()
}

function hostBase(): string {
  const origin = globalThis.location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}

async function responseMessage(response: Response): Promise<string> {
  const detail = (await response.text().catch(() => ''))
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 160)
  return `Unable to prepare export: HTTP ${response.status}${detail === '' ? '' : ` ${detail}`}`
}

export class SessionMarkdownExportController {
  readonly store: SnapshotStore<SessionMarkdownExportState> = createSnapshotStore(INITIAL)

  private readonly active = new Map<SessionId, { abort: AbortController; done: Promise<void> }>()
  private disposed = false

  constructor(
    private readonly fetcher: Fetch = (input, init) => fetch(input, init),
    private readonly save: Save = downloadUrl,
  ) {}

  download(sessionId: SessionId): Promise<void> {
    const existing = this.active.get(sessionId)
    if (existing !== undefined) return existing.done
    if (this.disposed) return Promise.resolve()

    const abort = new AbortController()
    const done = this.run(sessionId, abort.signal).finally(() => {
      this.active.delete(sessionId)
    })
    this.active.set(sessionId, { abort, done })
    return done
  }

  dismiss(sessionId: SessionId): void {
    const current = this.store.getSnapshot().bySession[String(sessionId)]
    if (current === undefined || !current.open) return
    this.publish(sessionId, { ...current, open: false })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const active = [...this.active.values()]
    for (const operation of active) operation.abort.abort()
    await Promise.allSettled(active.map((operation) => operation.done))
  }

  private async run(sessionId: SessionId, signal: AbortSignal): Promise<void> {
    this.publish(sessionId, { open: true, status: 'preparing', error: null })
    try {
      const url = new URL('/api/session.export-markdown', hostBase())
      url.searchParams.set('sessionId', String(sessionId))
      url.searchParams.set('includeDescendants', 'true')
      const response = await this.fetcher(url, { method: 'HEAD', signal })
      if (!response.ok) throw new Error(await responseMessage(response))
      if (signal.aborted) return

      this.save(url.toString())
      const open = this.store.getSnapshot().bySession[String(sessionId)]?.open ?? true
      this.publish(sessionId, { open, status: 'success', error: null })
    } catch (error) {
      if (signal.aborted) return
      const open = this.store.getSnapshot().bySession[String(sessionId)]?.open ?? true
      this.publish(sessionId, {
        open,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private publish(sessionId: SessionId, entry: SessionMarkdownExportEntry): void {
    this.store.update((state) => {
      state.bySession = { ...state.bySession, [String(sessionId)]: entry }
    })
  }
}
