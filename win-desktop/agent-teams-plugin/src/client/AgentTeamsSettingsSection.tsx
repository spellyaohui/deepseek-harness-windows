import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsPathOpView } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AgentTeamsSettings, DelegationMode, MemberReasoningMode } from '../settings.ts'
import { loadModelCatalog, type ModelCatalogEntry, type ModelCatalogState } from './model-catalog.ts'
import {
  planDelegationModeChange,
  planModelChange,
  planProviderChange,
  planReasoningEffortChange,
  planReasoningModeChange,
  runAgentTeamsSettingsAction,
  type AgentTeamsSettingsWriter,
  type SettingsPlanError,
  type SettingsWritePlan,
  type SettingsWriteView,
} from './settings-write.ts'
import type { AGENT_TEAMS_LOCALE_NAMESPACE } from './locales.ts'
import css from './AgentTeamsSettingsSection.module.css'

const SETTINGS_PLAN_ERROR_KEY = {
  'model-unavailable': 'settings.write.modelUnavailable',
  'no-efforts': 'settings.write.noEfforts',
  'no-models': 'settings.write.noModels',
  'unsupported-effort': 'settings.write.unsupportedEffort',
} as const satisfies Record<SettingsPlanError, Parameters<AgentTeamsSettingsSectionProps['t']>[0]>

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

const DEFAULT_SETTINGS: AgentTeamsSettings = {
  delegationMode: 'teams',
  memberLlmProvider: '',
  memberModel: '',
  memberReasoningMode: 'target-default',
  memberReasoningEffort: '',
  migrationVersion: 0,
}

function supportsEffort(model: ModelCatalogEntry | undefined, effort: string): boolean {
  return effort === '' || model?.efforts.some((candidate) => candidate.id === effort) === true
}

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

  const providers = useMemo(
    () => [...new Set(catalog.models.map((model) => model.provider))],
    [catalog.models],
  )
  const providerModels = useMemo(
    () => catalog.models.filter((model) => model.provider === value.memberLlmProvider),
    [catalog.models, value.memberLlmProvider],
  )
  const selectedModel = catalog.models.find((model) => (
    model.provider === value.memberLlmProvider && model.id === value.memberModel
  ))
  const settingsReady = snapshot.status === 'ready'
  const writable = settingsReady && snapshot.writable
  const controlsDisabled = !writable || writeView.status === 'busy'
  const catalogReady = catalog.status === 'ready'

  const runWrite = useCallback(async (ops: readonly SettingsPathOpView[]): Promise<void> => {
    await runAgentTeamsSettingsAction(writer, ops, setWriteView)
  }, [writer])

  const planErrorCopy = useCallback((error: SettingsPlanError): string => {
    return t(SETTINGS_PLAN_ERROR_KEY[error])
  }, [t])

  const runPlan = useCallback(async (plan: SettingsWritePlan): Promise<void> => {
    if (!plan.ok) {
      setWriteView({ status: 'error', ops: null, error: planErrorCopy(plan.error) })
      return
    }
    await runWrite(plan.ops)
  }, [planErrorCopy, runWrite])

  const setDelegationMode = async (mode: DelegationMode): Promise<void> => {
    await runPlan(planDelegationModeChange(mode))
  }

  const setProvider = async (provider: string): Promise<void> => {
    await runPlan(planProviderChange(value, provider, catalog.models))
  }

  const setModel = async (modelId: string): Promise<void> => {
    await runPlan(planModelChange(value, value.memberLlmProvider, modelId, catalog.models))
  }

  const setReasoningMode = async (mode: MemberReasoningMode): Promise<void> => {
    if (mode === value.memberReasoningMode) return
    await runPlan(planReasoningModeChange(value, mode, selectedModel))
  }

  const setReasoningEffort = async (effort: string): Promise<void> => {
    await runPlan(planReasoningEffortChange(effort, selectedModel))
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

      <section className={css.section} aria-labelledby="agent-teams-model-title">
        <h3 id="agent-teams-model-title" className={css.sectionTitle}>{t('settings.model.title')}</h3>
        <p className={css.help}>{t('settings.model.help')}</p>
        {catalog.status === 'loading' && (
          <p className={css.catalogStatus} role="status" aria-live="polite">
            {t('settings.catalog.loading')}
          </p>
        )}
        {catalog.status === 'empty' && (
          <p className={css.catalogStatus} role="status">{t('settings.catalog.empty')}</p>
        )}
        {catalog.status === 'error' && (
          <div className={css.catalogError} role="alert">
            <span>{t('settings.catalog.error', { message: catalog.error })}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCatalogAttempt((attempt) => attempt + 1)}
            >
              {t('settings.catalog.retry')}
            </Button>
          </div>
        )}
        <div className={css.fields}>
          <label className={css.field} htmlFor="agent-teams-member-provider">
            <span>{t('settings.model.provider')}</span>
            <select
              id="agent-teams-member-provider"
              value={value.memberLlmProvider}
              disabled={controlsDisabled || !catalogReady}
              onChange={async (event) => { await setProvider(event.currentTarget.value) }}
            >
              <option value="">{t('settings.model.followCaptain')}</option>
              {value.memberLlmProvider !== '' && !providers.includes(value.memberLlmProvider) && (
                <option value={value.memberLlmProvider}>
                  {t('settings.model.unavailable', { value: value.memberLlmProvider })}
                </option>
              )}
              {providers.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
            </select>
          </label>
          <label className={css.field} htmlFor="agent-teams-member-model">
            <span>{t('settings.model.model')}</span>
            <select
              id="agent-teams-member-model"
              value={value.memberModel}
              disabled={controlsDisabled || !catalogReady || value.memberLlmProvider === ''}
              onChange={async (event) => { await setModel(event.currentTarget.value) }}
            >
              {value.memberLlmProvider === '' && (
                <option value="">{t('settings.model.followCaptain')}</option>
              )}
              {value.memberModel !== '' && !providerModels.some((model) => model.id === value.memberModel) && (
                <option value={value.memberModel}>
                  {t('settings.model.unavailable', { value: value.memberModel })}
                </option>
              )}
              {providerModels.map((model) => (
                <option key={model.id} value={model.id}>{model.name || model.id}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className={css.section} aria-labelledby="agent-teams-reasoning-title">
        <h3 id="agent-teams-reasoning-title" className={css.sectionTitle}>
          {t('settings.reasoning.title')}
        </h3>
        <fieldset className={css.choices} disabled={controlsDisabled}>
          <legend className={css.visuallyHidden}>{t('settings.reasoning.title')}</legend>
          {(['target-default', 'route-aware', 'explicit'] as const).map((mode) => (
            <label
              className={`${css.choice} ${
                mode === 'explicit' && (selectedModel?.efforts.length ?? 0) === 0
                  ? css.choiceDisabled
                  : ''
              }`}
              key={mode}
            >
              <input
                type="radio"
                name="agent-teams-reasoning-mode"
                value={mode}
                checked={value.memberReasoningMode === mode}
                disabled={mode === 'explicit' && (selectedModel?.efforts.length ?? 0) === 0}
                onChange={async () => { await setReasoningMode(mode) }}
              />
              <span>
                <strong>{t(`settings.reasoning.${mode}.label`)}</strong>
                <small>{t(`settings.reasoning.${mode}.description`)}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <label className={css.field} htmlFor="agent-teams-member-effort">
          <span>{t('settings.reasoning.effort')}</span>
          <select
            id="agent-teams-member-effort"
            value={value.memberReasoningEffort}
            disabled={
              controlsDisabled
              || value.memberReasoningMode !== 'explicit'
              || (selectedModel?.efforts.length ?? 0) === 0
            }
            onChange={async (event) => { await setReasoningEffort(event.currentTarget.value) }}
          >
            {selectedModel?.efforts.length
              ? <>
                {!supportsEffort(selectedModel, value.memberReasoningEffort) && (
                  <option value={value.memberReasoningEffort} disabled>
                    {t('settings.reasoning.unsupportedEffort', { effort: value.memberReasoningEffort })}
                  </option>
                )}
                {selectedModel.efforts.map((effort) => (
                  <option key={effort.id} value={effort.id}>{effort.name}</option>
                ))}
              </>
              : <option value="">{t('settings.reasoning.noEfforts')}</option>}
          </select>
        </label>
      </section>

      <section className={css.section} aria-labelledby="agent-teams-scope-title">
        <h3 id="agent-teams-scope-title" className={css.sectionTitle}>{t('settings.scope.title')}</h3>
        <p className={css.help}>{t('settings.scope.description')}</p>
      </section>
    </div>
  )
}
