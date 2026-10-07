import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DelegationMode } from '../settings.ts'
import { loadModelCatalog, type ModelCatalogEntry, type ModelCatalogState } from './model-catalog.ts'
import { TeamProfilesEditor } from './TeamProfilesEditor.tsx'
import { TemporaryMemberSettings } from './TemporaryMemberSettings.tsx'
import {
  discardTemporaryMemberWrite,
  planDelegationModeChange,
  planTemporaryMemberChange,
  runAgentTeamsSettingsAction,
  type AgentTeamsSettingsWriter,
  type AgentTeamsEditorSettings,
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
  settings: ConfigForm<AgentTeamsEditorSettings>
  writer: AgentTeamsSettingsWriter
}

export type AgentTeamsSettingsSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<typeof AGENT_TEAMS_LOCALE_NAMESPACE>
  & AgentTeamsSettingsSectionInjected

const DEFAULT_SETTINGS: AgentTeamsEditorSettings = { delegationMode: 'teams' }

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
  const actionScope = useRef({ settings, writer, generation: 0, active: true, key: 0 })
  if (actionScope.current.settings !== settings || actionScope.current.writer !== writer) {
    actionScope.current = { settings, writer, generation: 0, active: true, key: actionScope.current.key + 1 }
  }
  useEffect(() => {
    const scope = actionScope.current
    scope.active = true
    setWriteView({ status: 'idle', ops: null, error: null })
    return () => { scope.active = false; scope.generation += 1 }
  }, [settings, writer])

  const writeCurrent = useCallback(async (ops: readonly SettingsPathOpView[]): Promise<boolean> => {
    const scope = actionScope.current
    const generation = ++scope.generation
    const isCurrent = () => scope === actionScope.current && scope.active && generation === scope.generation
    const result = await runAgentTeamsSettingsAction(writer, ops, setWriteView, isCurrent)
    return isCurrent() && result.status === 'ready'
  }, [writer])

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
    await writeCurrent(ops)
  }, [writeCurrent])

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
                className={css.retryButton}
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

      <TemporaryMemberSettings
        key={`temporary-${actionScope.current.key}`}
        value={value.temporaryMember}
        catalog={catalog.models}
        catalogReady={catalog.status === 'ready'}
        disabled={controlsDisabled}
        native={value.delegationMode === 'native'}
        onDiscardPendingWrite={() => {
          actionScope.current.generation += 1
          setWriteView(discardTemporaryMemberWrite)
        }}
        onSave={async policy => {
          return writeCurrent(planTemporaryMemberChange(policy).ops)
        }}
        t={t}
      />

      <TeamProfilesEditor
        key={`profiles-${actionScope.current.key}`}
        settings={settings}
        writer={writer}
        catalog={catalog}
        onRetryCatalog={() => setCatalogAttempt((attempt) => attempt + 1)}
        t={t}
        writable={writable}
      />

    </div>
  )
}
