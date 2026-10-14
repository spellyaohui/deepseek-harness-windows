import { useEffect, useRef, useState } from 'react'
import type { AgentTeamsTranslate } from './locales.ts'
import { planDefaultProfileChange, profileDraftSignature, type AgentTeamsEditorSettings, type AgentTeamsSettingsWriter } from './settings-write.ts'
import css from './AgentTeamsSettingsSection.module.css'

export function DefaultTeamProfileSettings({ value, writer, disabled, t }: {
  value: AgentTeamsEditorSettings
  writer: AgentTeamsSettingsWriter
  disabled: boolean
  t: AgentTeamsTranslate
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const name = value.defaultProfile?.trim() ?? ''
  const names = Object.keys(value.profiles ?? {})
  const missing = name !== '' && !names.includes(name)
  const profile = value.profiles?.[name]
  const emptySeed = profile !== undefined && (profile.taskPlanning ?? 'seed') === 'seed' && (profile.tasks?.length ?? 0) === 0

  return (
    <section className={css.section} aria-busy={busy}>
      <label className={css.field}>
        <span>{t('settings.defaultProfile.label')}</span>
        <select id="agent-teams-default-profile" className={css.profileSelect}
          value={name} disabled={disabled || busy} aria-describedby="agent-teams-default-profile-help"
          onChange={async event => {
            const selected = event.currentTarget.value
            setBusy(true)
            setError(null)
            setSaved(false)
            try {
              const result = await writer.write(planDefaultProfileChange(selected).ops, profileDraftSignature(value))
              if (!alive.current) return
              if (result.status === 'ready') setSaved(true)
              else setError(result.error)
            } catch (reason: unknown) {
              if (alive.current) setError(reason instanceof Error ? reason.message : String(reason))
            } finally {
              if (alive.current) setBusy(false)
            }
          }}
        >
          <option value="">{t('settings.defaultProfile.none')}</option>
          {missing && <option value={name}>{name}</option>}
          {names.map(entry => <option key={entry} value={entry}>{entry}</option>)}
        </select>
      </label>
      <p id="agent-teams-default-profile-help" className={css.help}>{t('settings.defaultProfile.help')}</p>
      {value.delegationMode === 'native' && <p className={css.profileHint}>{t('settings.defaultProfile.native')}</p>}
      {name === '' && <p className={css.profileWarning} role="status">{t('settings.defaultProfile.unbound')}</p>}
      {missing && <p className={css.profileWarning} role="alert">{t('settings.defaultProfile.missing', { name })}</p>}
      {emptySeed && <p className={css.profileWarning} role="alert">{t('settings.profiles.emptySeed')}</p>}
      {busy && <p className={css.settingsStatus} role="status" aria-live="polite">{t('settings.write.saving')}</p>}
      {saved && <p className={css.profileSaved} role="status" aria-live="polite">{t('settings.defaultProfile.saved')}</p>}
      {error !== null && <p className={css.profileError} role="alert">{t('settings.write.error', { message: error })}</p>}
    </section>
  )
}
