import { Fragment } from 'react'

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { IconDownloadOutline16, Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

import type { SessionMarkdownExportState } from './controller.ts'
import { NS } from './locales.ts'

export interface SessionMarkdownExportInjected {
  hooks: {
    sessionMarkdownExport: ObservableSnapshot<SessionMarkdownExportState>
  }
  request: (sessionId: SessionId) => Promise<void>
  dismiss: (sessionId: SessionId) => void
}

type HeaderActionProps = PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<typeof NS>
  & InjectFace<SessionMarkdownExportInjected>

export function SessionMarkdownExportHeaderAction(props: HeaderActionProps): JSX.Element {
  const { sessionId, useSessionMarkdownExport, request, dismiss, t } = props
  const entry = useSessionMarkdownExport((state) => state.bySession[String(sessionId)])
  const status = entry?.status
  const busy = status === 'preparing'
  const error = status === 'error' ? entry?.error || t('dialog.commandFailed') : null

  const title = status === 'preparing'
    ? t('dialog.preparingTitle')
    : status === 'success'
      ? t('dialog.successTitle')
      : t('dialog.errorTitle')
  const description = status === 'preparing'
    ? t('dialog.preparingDescription')
    : status === 'success'
      ? t('dialog.successDescription')
      : error ?? t('dialog.commandFailed')

  return <Fragment>
    <button
      type="button"
      className="dsh-session-markdown-export-button"
      title="导出供其他智能体继续工作的 Markdown"
      disabled={busy}
      aria-busy={busy || undefined}
      onClick={() => { void request(sessionId) }}
    >
      <span>续接 MD</span>
      <IconDownloadOutline16 size={12} />
    </button>
    <Modal
      open={entry?.open === true}
      onClose={() => dismiss(sessionId)}
      title={title}
      description={description}
      closeLabel={t('dialog.close')}
      footer={<Button
        variant="primary"
        onClick={() => {
          if (status === 'error') void request(sessionId)
          else dismiss(sessionId)
        }}
      >
        {status === 'error' ? t('dialog.retry') : t('dialog.close')}
      </Button>}
    />
  </Fragment>
}
