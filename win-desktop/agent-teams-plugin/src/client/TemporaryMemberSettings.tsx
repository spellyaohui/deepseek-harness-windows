import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MemberRolePolicy } from '../selection-policy.ts'
import { validateMemberRolePolicy } from '../selection-policy.ts'
import type { ModelCatalogEntry } from './model-catalog.ts'
import type { AgentTeamsTranslate } from './locales.ts'
import css from './AgentTeamsSettingsSection.module.css'

const FOLLOW_CAPTAIN: MemberRolePolicy = { reasoningMode: 'target-default' }

/** A separate default for temporary calls; it never edits a Profile roster. */
export function TemporaryMemberSettings({ value, catalog, catalogReady, disabled, native, onSave, onDiscardPendingWrite, t }: {
  value?: MemberRolePolicy
  catalog: readonly ModelCatalogEntry[]
  catalogReady: boolean
  disabled: boolean
  native: boolean
  onSave: (policy: MemberRolePolicy) => Promise<boolean>
  onDiscardPendingWrite: () => void
  t: AgentTeamsTranslate
}) {
  const [draft, setDraft] = useState<MemberRolePolicy | null>(null)
  const [saved, setSaved] = useState(false)
  const committed = value ?? FOLLOW_CAPTAIN
  const policy = draft ?? committed
  const dirty = JSON.stringify(policy) !== JSON.stringify(committed)
  const provider = policy.provider ?? ''
  const model = policy.model ?? ''
  const providers = [...new Set(catalog.map(entry => entry.provider))]
  const models = catalog.filter(entry => entry.provider === provider)
  const selected = models.find(entry => entry.id === model)
  let valid = true
  try { validateMemberRolePolicy(policy) } catch { valid = false }
  if (provider !== '' && (!catalogReady || selected === undefined)) valid = false
  if (policy.reasoningMode === 'explicit' && !selected?.efforts.some(entry => entry.id === policy.reasoningEffort)) valid = false
  const edit = (next: MemberRolePolicy): void => { onDiscardPendingWrite(); setDraft(next); setSaved(false) }
  const changeRoute = (nextProvider: string, nextModel: string): void => edit({
    reasoningMode: policy.reasoningMode === 'explicit' ? 'target-default' : policy.reasoningMode,
    ...(nextProvider === '' ? {} : { provider: nextProvider, model: nextModel }),
  })

  return (
    <section className={css.section} aria-labelledby="agent-teams-temporary-title">
      <h3 id="agent-teams-temporary-title" className={css.sectionTitle}>{t('settings.temporary.title')}</h3>
      <p className={css.help}>{t('settings.temporary.help')}</p>
      {native && <p className={css.settingsStatus}>{t('settings.temporary.native')}</p>}
      <fieldset className={css.choices} disabled={disabled || native}>
        <legend className={css.visuallyHidden}>{t('settings.temporary.title')}</legend>
        <div className={css.fields}>
          <label className={css.field}>
            <span>{t('settings.profiles.memberProvider')}</span>
            <select className={css.profileSelect} value={provider} disabled={!catalogReady}
              onChange={event => changeRoute(event.currentTarget.value, '')}>
              <option value="">{t('settings.profiles.followCaptain')}</option>
              {provider !== '' && !providers.includes(provider) && <option value={provider}>{t('settings.profiles.unavailable', { value: provider })}</option>}
              {providers.map(entry => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </label>
          <label className={css.field}>
            <span>{t('settings.profiles.memberModel')}</span>
            <select className={css.profileSelect} value={model} disabled={!catalogReady || provider === ''}
              onChange={event => changeRoute(provider, event.currentTarget.value)}>
              <option value="">{provider === '' ? t('settings.profiles.followCaptain') : t('settings.profiles.chooseModel')}</option>
              {model !== '' && selected === undefined && <option value={model}>{t('settings.profiles.unavailable', { value: model })}</option>}
              {models.map(entry => <option key={entry.id} value={entry.id}>{entry.name || entry.id}</option>)}
            </select>
          </label>
        </div>
        <fieldset className={css.profileReasoning}>
          <legend className={css.profileLegend}>{t('settings.profiles.reasoning.title')}</legend>
          <div className={css.temporaryReasoningChoices}>
            {(['target-default', 'route-aware', 'explicit'] as const).map(mode => (
              <label className={css.choice} key={mode}>
                <input type="radio" name="agent-teams-temporary-reasoning" checked={policy.reasoningMode === mode}
                  disabled={mode === 'explicit' && !selected?.efforts.length}
                  onChange={() => edit({
                    reasoningMode: mode,
                    ...(provider === '' ? {} : { provider, model }),
                    ...(mode === 'explicit' ? { reasoningEffort: selected?.defaultEffort ?? selected?.efforts[0]?.id } : {}),
                  })} />
                <span>{t(`settings.profiles.reasoning.${mode}.label`)}</span>
              </label>
            ))}
          </div>
          {policy.reasoningMode === 'explicit' && (
            <label className={css.field}>
              <span>{t('settings.profiles.reasoning.effort')}</span>
              <select className={css.profileSelect} value={policy.reasoningEffort ?? ''} disabled={!catalogReady || !selected?.efforts.length}
                onChange={event => edit({ ...policy, reasoningEffort: event.currentTarget.value })}>
                {!selected?.efforts.some(entry => entry.id === policy.reasoningEffort) && <option value={policy.reasoningEffort ?? ''}>{t('settings.profiles.unavailable', { value: policy.reasoningEffort ?? '' })}</option>}
                {selected?.efforts.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </label>
          )}
        </fieldset>
      </fieldset>
      <p className={css.help}>{t('settings.temporary.reasoningHelp')}</p>
      {dirty && !valid && <p className={css.catalogError} role="alert">{t('settings.temporary.invalid')}</p>}
      {saved && <p className={css.settingsStatus} role="status">{t('settings.temporary.saved')}</p>}
      <div className={css.profileActions}>
        <Button type="button" variant="outline" size="sm" disabled={disabled || native || !dirty}
          onClick={() => { onDiscardPendingWrite(); setDraft(null); setSaved(false) }}>{t('settings.temporary.cancel')}</Button>
        <Button type="button" size="sm" disabled={disabled || native || !dirty || !valid}
          onClick={async () => { if (await onSave(policy)) { setDraft(null); setSaved(true) } }}>{t('settings.temporary.save')}</Button>
      </div>
    </section>
  )
}
