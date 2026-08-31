import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentTeamsSettings, DelegationMode } from '../settings.ts'
import { loadModelCatalog, type ModelCatalogEntry, type ModelCatalogState } from './model-catalog.ts'
import { TeamProfilesEditor } from './TeamProfilesEditor.tsx'
import {
  planDelegationModeChange,
  runAgentTeamsSettingsAction,
  type AgentTeamsSettingsWriter,
  type SettingsWritePlan,
  type SettingsWriteView,
} from './settings-write.ts'
import type { AGENT_TEAMS_LOCALE_NAMESPACE } from './locales.ts'
import css from './AgentTeamsSettingsSection.module.css'

type CatalogViewState = ModelCatalogState | {
  status: 'loading'
  models: readonly ModelCatalogEntry[]
  error: null
}

export interface AgentTeamsSettingsSectionInjected {
  settings: SettingsScope<AgentTeamsSettings>
  writer: AgentTeamsSettingsWriter
}

export type AgentTeamsSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<typeof AGENT_TEAMS_LOCALE_NAMESPACE>
  & AgentTeamsSettingsSectionInjected

const DEFAULT_SETTINGS: Pick<AgentTeamsSettings, 'delegationMode'> = { delegationMode: 'teams' }

export function AgentTeamsSettingsSection({
  settings, writer, t,
}: AgentTeamsSettingsSectionProps) {
  const subscribe = useCallback((listener: () => void) => settings.subscribe(listener), [settings])
  const getSnapshot = useCallback(() => settings.getSnapshot(), [settings])
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const value = snapshot.value ?? DEFAULT_SETTINGS
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [catalog, setCatalog] = useState<CatalogViewState>({
    status: 'loading', models: [], error: null,
  })
  const [writeView, setWriteView] = useState<SettingsWriteView>({
    status: 'idle', ops: null, error: null,
  })

  useEffect(() => {
    let active = true
    setCatalog({ status: 'loading', models: [], error: null })
    void loadModelCatalog().then((next) => {
      if (active) setCatalog(next)
    })
    return () => { active = false }
  }, [catalogAttempt])

  const settingsReady = snapshot.status === 'ready'
  const writable = settingsReady && snapshot.writable
  const controlsDisabled = !writable || writeView.status === 'busy'

  const runWrite = useCallback(async (ops: readonly SettingsPathOpView[]): Promise<void> => {
    await runAgentTeamsSettingsAction(writer, ops, setWriteView)
  }, [writer])

  const runPlan = useCallback(async (plan: SettingsWritePlan): Promise<void> => {
    await runWrite(plan.ops)
  }, [runWrite])

  const setDelegationMode = async (mode: DelegationMode): Promise<void> => {
    await runPlan(planDelegationModeChange(mode))
  }

  const statusCopy = snapshot.status === 'loading'
    ? t('settings.state.loading')
    : snapshot.status === 'unavailable'
      ? t('settings.state.unavailable')
      : !snapshot.writable ? t('settings.state.readOnly') : null
  const visibleWriteError = writeView.status === 'error'
    && writeView.error === 'settings revision is not ready'
    ? t('settings.write.noRevision')
    : writeView.status === 'error' ? writeView.error : null

  return (
    <div
      className={css.root}
      aria-busy={snapshot.status === 'loading' || catalog.status === 'loading' || writeView.status === 'busy'}
    >
      <header className={css.header}>
        <h2 className={css.pageTitle}>{t('settings.title')}</h2>
        <p className={css.intro}>{t('settings.intro')}</p>
        {statusCopy !== null && (
          <p className={css.settingsStatus} role="status" aria-live="polite">{statusCopy}</p>
        )}
        {writeView.status === 'busy' && (
          <p className={css.settingsStatus} role="status" aria-live="polite">
            {t('settings.write.saving')}
          </p>
        )}
        {writeView.status === 'error' && (
          <div className={css.writeError} role="alert">
            <span>{t('settings.write.error', { message: visibleWriteError ?? writeView.error })}</span>
            {writeView.ops !== null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!writable}
                onClick={async () => {
                  if (writeView.ops !== null) await runWrite(writeView.ops)
                }}
              >
                {t('settings.write.retry')}
              </Button>
            )}
          </div>
        )}
      </header>

      <section className={css.section} aria-labelledby="agent-teams-delegation-title">
        <h3 id="agent-teams-delegation-title" className={css.sectionTitle}>
          {t('settings.delegation.title')}
        </h3>
        <p className={css.help}>{t('settings.delegation.help')}</p>
        <fieldset className={css.choices} disabled={controlsDisabled}>
          <legend className={css.visuallyHidden}>{t('settings.delegation.title')}</legend>
          {(['teams', 'native'] as const).map((mode) => (
            <label className={css.choice} key={mode}>
              <input
                type="radio"
                name="agent-teams-delegation-mode"
                value={mode}
                checked={value.delegationMode === mode}
                onChange={async () => { await setDelegationMode(mode) }}
              />
              <span>
                <strong>{t(`settings.delegation.${mode}.label`)}</strong>
                <small>{t(`settings.delegation.${mode}.description`)}</small>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      <TeamProfilesEditor
        catalog={catalog}
        onRetryCatalog={() => setCatalogAttempt((attempt) => attempt + 1)}
        t={t}
        writable={writable}
      />

    </div>
  )
}
