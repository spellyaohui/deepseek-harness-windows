import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AgentTeamsTranslate } from './locales.ts'
import type { ModelCatalogEntry, ModelCatalogState } from './model-catalog.ts'
import {
  applyMemberReasoningMode,
  cloneProfileMap,
  createCommittedProfileNameMap,
  createEmptyTeamProfile,
  hasUnvalidatedExplicitRoleDraft,
  normalizeProfileSnapshot,
  prepareProfileMapForSave,
  renameCommittedProfileName,
  type AgentTeamsProfilesSnapshot,
  type CommittedProfileNameMap,
  type TeamModelFallbackConfig,
  type TeamProfileConfig,
  type TeamProfileMemberConfig,
  type TeamProfileTaskConfig,
} from './profile-editor.ts'
import { getAgentTeamsDesktopBridge } from './desktop-bridge.ts'
import css from './AgentTeamsSettingsSection.module.css'

interface TeamProfilesEditorProps {
  catalog: ModelCatalogState | { status: 'loading'; models: readonly ModelCatalogEntry[]; error: null }
  onRetryCatalog: () => void
  t: AgentTeamsTranslate
  writable: boolean
}

interface RenamedProfilesResult {
  profiles: Record<string, TeamProfileConfig>
  committedProfileNames: CommittedProfileNameMap
  selectedName: string
}

type MemberField = 'role' | 'reasoning_effort' | 'executionPrompt'
type ReviewPolicyField = 'requirementsMinRounds' | 'requirementsMaxRounds' | 'codeMaxRounds' | 'maxRepairAttempts'

function uniqueName(existing: readonly string[], base: string): string {
  const occupied = new Set(existing)
  if (!occupied.has(base)) return base
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}`
    if (!occupied.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}

function updateProfileMap(
  profiles: Record<string, TeamProfileConfig>,
  name: string,
  update: (profile: TeamProfileConfig) => TeamProfileConfig,
): Record<string, TeamProfileConfig> {
  const current = profiles[name]
  if (current === undefined) return profiles
  const next = cloneProfileMap(profiles)
  next[name] = update(next[name] ?? current)
  return next
}

function setMemberField(
  member: TeamProfileMemberConfig,
  field: MemberField,
  value: string,
): TeamProfileMemberConfig {
  const next = { ...member }
  if (value === '') delete next[field]
  else next[field] = value
  return next
}

function setMemberProvider(
  member: TeamProfileMemberConfig,
  provider: string,
  catalog: readonly ModelCatalogEntry[],
): TeamProfileMemberConfig {
  if (provider === '') return { ...member, provider: undefined, model: undefined }
  const models = catalog.filter((entry) => entry.provider === provider)
  const currentModel = member.provider === provider && models.some((entry) => entry.id === member.model)
    ? member.model
    : models[0]?.id
  return {
    ...member,
    provider,
    ...(currentModel === undefined ? { model: undefined } : { model: currentModel }),
  }
}

function setMemberModel(
  member: TeamProfileMemberConfig,
  provider: string,
  model: string,
): TeamProfileMemberConfig {
  if (provider === '' || model === '') return { ...member, provider: undefined, model: undefined }
  return { ...member, provider, model }
}

function setRouteField(
  current: TeamModelFallbackConfig | undefined,
  field: keyof TeamModelFallbackConfig,
  value: string,
): TeamModelFallbackConfig | undefined {
  const next = {
    provider: current?.provider ?? '',
    model: current?.model ?? '',
  }
  next[field] = value
  return next.provider === '' && next.model === '' ? undefined : next
}

function formatDependencies(task: TeamProfileTaskConfig): string {
  return task.dependencies?.join(', ') ?? ''
}

function parseDependencies(value: string): string[] | undefined {
  const dependencies = value
    .split(',')
    .map((dependency) => dependency.trim())
    .filter((dependency) => dependency !== '')
  return dependencies.length === 0 ? undefined : [...new Set(dependencies)]
}

function FallbackFields({
  disabled,
  fallback,
  onChange,
  t,
}: {
  disabled: boolean
  fallback: TeamModelFallbackConfig | undefined
  onChange: (next: TeamModelFallbackConfig | undefined) => void
  t: AgentTeamsTranslate
}) {
  return (
    <div className={css.profileFallback}>
      <label className={css.field}>
        <span>{t('settings.profiles.fallbackProvider')}</span>
        <input
          className={css.profileInput}
          value={fallback?.provider ?? ''}
          disabled={disabled}
          onChange={(event) => onChange(setRouteField(fallback, 'provider', event.currentTarget.value))}
        />
      </label>
      <label className={css.field}>
        <span>{t('settings.profiles.fallbackModel')}</span>
        <input
          className={css.profileInput}
          value={fallback?.model ?? ''}
          disabled={disabled}
          onChange={(event) => onChange(setRouteField(fallback, 'model', event.currentTarget.value))}
        />
      </label>
    </div>
  )
}

function MemberEditor({
  catalog,
  catalogReady,
  disabled,
  index,
  member,
  onChange,
  onRemove,
  t,
}: {
  catalog: readonly ModelCatalogEntry[]
  catalogReady: boolean
  disabled: boolean
  index: number
  member: TeamProfileMemberConfig
  onChange: (next: TeamProfileMemberConfig) => void
  onRemove: () => void
  t: AgentTeamsTranslate
}) {
  const providers = useMemo(
    () => [...new Set(catalog.map((model) => model.provider))],
    [catalog],
  )
  const provider = member.provider ?? ''
  const model = member.model ?? ''
  const providerModels = catalog.filter((entry) => entry.provider === provider)
  const selectedModel = providerModels.find((entry) => entry.id === model)
  const update = (field: MemberField, value: string): void => {
    onChange(setMemberField(member, field, value))
  }

  return (
    <div className={css.profileMember}>
      <div className={css.profileRowHeader}>
        <strong>{t('settings.profiles.member', { index: index + 1 })}</strong>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onRemove}>
          {t('settings.profiles.remove')}
        </Button>
      </div>
      <div className={css.fields}>
        <label className={css.field}>
          <span>{t('settings.profiles.memberName')}</span>
          <input
            className={css.profileInput}
            value={member.name}
            disabled={disabled}
            onChange={(event) => onChange({ ...member, name: event.currentTarget.value })}
          />
        </label>
        <label className={css.field}>
          <span>{t('settings.profiles.memberRole')}</span>
          <input
            className={css.profileInput}
            value={member.role ?? ''}
            disabled={disabled}
            onChange={(event) => update('role', event.currentTarget.value)}
          />
        </label>
        <label className={css.field}>
          <span>{t('settings.profiles.memberProvider')}</span>
          <select
            className={css.profileSelect}
            value={provider}
            disabled={disabled || !catalogReady}
            onChange={(event) => onChange(setMemberProvider(member, event.currentTarget.value, catalog))}
          >
            <option value="">{t('settings.profiles.followCaptain')}</option>
            {provider !== '' && !providers.includes(provider) && (
              <option value={provider}>{t('settings.profiles.unavailable', { value: provider })}</option>
            )}
            {providers.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </label>
        <label className={css.field}>
          <span>{t('settings.profiles.memberModel')}</span>
          <select
            className={css.profileSelect}
            value={model}
            disabled={disabled || !catalogReady || provider === ''}
            onChange={(event) => onChange(setMemberModel(member, provider, event.currentTarget.value))}
          >
            <option value="">{provider === '' ? t('settings.profiles.followCaptain') : t('settings.profiles.chooseModel')}</option>
            {model !== '' && selectedModel === undefined && (
              <option value={model}>{t('settings.profiles.unavailable', { value: model })}</option>
            )}
            {providerModels.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || entry.id}</option>)}
          </select>
        </label>
        <fieldset className={css.profileReasoning} disabled={disabled}>
          <legend className={css.profileLegend}>{t('settings.profiles.reasoning.title')}</legend>
          <div className={css.profileReasoningChoices}>
            {(['target-default', 'route-aware', 'explicit'] as const).map((mode) => (
              <label
                className={`${css.choice} ${mode === 'explicit' && (!catalogReady || (selectedModel?.efforts.length ?? 0) === 0) ? css.choiceDisabled : ''}`}
                key={mode}
              >
                <input
                  type="radio"
                  name={`agent-teams-profile-member-${index}-reasoning-mode`}
                  value={mode}
                  checked={member.reasoning_mode === mode}
                  disabled={mode === 'explicit' && (!catalogReady || (selectedModel?.efforts.length ?? 0) === 0)}
                  onChange={() => {
                    const next = applyMemberReasoningMode(member, mode, selectedModel)
                    if (next !== undefined) onChange(next)
                  }}
                />
                <span>{t(`settings.profiles.reasoning.${mode}.label`)}</span>
              </label>
            ))}
          </div>
          {member.reasoning_mode === 'explicit' && (
            <label className={css.field}>
              <span>{t('settings.profiles.reasoning.effort')}</span>
              <select
                className={css.profileSelect}
                value={member.reasoning_effort ?? ''}
                disabled={disabled || !catalogReady || (selectedModel?.efforts.length ?? 0) === 0}
                onChange={(event) => update('reasoning_effort', event.currentTarget.value)}
              >
                {selectedModel?.efforts.length
                  ? <>
                    {member.reasoning_effort !== undefined
                      && !selectedModel.efforts.some((effort) => effort.id === member.reasoning_effort)
                      && <option value={member.reasoning_effort}>{t('settings.profiles.unavailable', { value: member.reasoning_effort })}</option>}
                    {selectedModel.efforts.map((effort) => <option key={effort.id} value={effort.id}>{effort.name}</option>)}
                  </>
                  : <option value="">{t('settings.profiles.reasoning.noEfforts')}</option>}
              </select>
            </label>
          )}
        </fieldset>
      </div>
      <label className={css.field}>
        <span>{t('settings.profiles.memberPrompt')}</span>
        <textarea
          className={css.profileTextarea}
          value={member.executionPrompt ?? ''}
          disabled={disabled}
          rows={3}
          onChange={(event) => update('executionPrompt', event.currentTarget.value)}
        />
      </label>
      <details className={css.profileDetails}>
        <summary>{t('settings.profiles.memberFallback')}</summary>
        <FallbackFields
          disabled={disabled}
          fallback={member.fallback}
          onChange={(fallback) => onChange({ ...member, ...(fallback === undefined ? { fallback: undefined } : { fallback }) })}
          t={t}
        />
      </details>
    </div>
  )
}

function TaskEditor({
  disabled,
  members,
  onChange,
  onRemove,
  task,
  t,
}: {
  disabled: boolean
  members: readonly TeamProfileMemberConfig[]
  onChange: (next: TeamProfileTaskConfig) => void
  onRemove: () => void
  task: TeamProfileTaskConfig
  t: AgentTeamsTranslate
}) {
  return (
    <div className={css.profileTask}>
      <div className={css.profileRowHeader}>
        <strong>{task.id || t('settings.profiles.newTask')}</strong>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onRemove}>
          {t('settings.profiles.remove')}
        </Button>
      </div>
      <div className={css.fields}>
        <label className={css.field}>
          <span>{t('settings.profiles.taskId')}</span>
          <input
            className={css.profileInput}
            value={task.id}
            disabled={disabled}
            onChange={(event) => onChange({ ...task, id: event.currentTarget.value })}
          />
        </label>
        <label className={css.field}>
          <span>{t('settings.profiles.taskAssignee')}</span>
          <select
            className={css.profileSelect}
            value={task.assignee ?? ''}
            disabled={disabled}
            onChange={(event) => onChange({ ...task, assignee: event.currentTarget.value || undefined })}
          >
            <option value="">{t('settings.profiles.chooseAssignee')}</option>
            {members.map((member) => <option key={member.name} value={member.name}>{member.name}</option>)}
          </select>
        </label>
      </div>
      <label className={css.field}>
        <span>{t('settings.profiles.taskSubject')}</span>
        <input
          className={css.profileInput}
          value={task.subject}
          disabled={disabled}
          onChange={(event) => onChange({ ...task, subject: event.currentTarget.value })}
        />
      </label>
      <label className={css.field}>
        <span>{t('settings.profiles.taskDescription')}</span>
        <textarea
          className={css.profileTextarea}
          value={task.description ?? ''}
          disabled={disabled}
          rows={2}
          onChange={(event) => onChange({ ...task, description: event.currentTarget.value })}
        />
      </label>
      <label className={css.field}>
        <span>{t('settings.profiles.taskDependencies')}</span>
        <input
          className={css.profileInput}
          value={formatDependencies(task)}
          disabled={disabled}
          placeholder={t('settings.profiles.commaSeparated')}
          onChange={(event) => onChange({ ...task, dependencies: parseDependencies(event.currentTarget.value) })}
        />
      </label>
    </div>
  )
}

function ProfileForm({
  catalog,
  catalogReady,
  disabled,
  onChange,
  profile,
  t,
}: {
  catalog: readonly ModelCatalogEntry[]
  catalogReady: boolean
  disabled: boolean
  onChange: (next: TeamProfileConfig) => void
  profile: TeamProfileConfig
  t: AgentTeamsTranslate
}) {
  const members = profile.members
  const tasks = profile.tasks ?? []
  const updateMember = (index: number, next: TeamProfileMemberConfig): void => {
    onChange({ ...profile, members: members.map((member, memberIndex) => memberIndex === index ? next : member) })
  }
  const removeMember = (index: number): void => {
    onChange({ ...profile, members: members.filter((_member, memberIndex) => memberIndex !== index) })
  }
  const addMember = (): void => {
    const name = uniqueName(members.map((member) => member.name), 'member')
    onChange({ ...profile, members: [...members, { name, reasoning_mode: 'target-default' }] })
  }
  const updateTask = (index: number, next: TeamProfileTaskConfig): void => {
    onChange({ ...profile, tasks: tasks.map((task, taskIndex) => taskIndex === index ? next : task) })
  }
  const removeTask = (index: number): void => {
    const next = tasks.filter((_task, taskIndex) => taskIndex !== index)
    onChange({ ...profile, ...(next.length === 0 ? { tasks: undefined } : { tasks: next }) })
  }
  const addTask = (): void => {
    const id = uniqueName(tasks.map((task) => task.id), 'task')
    onChange({
      ...profile,
      taskPlanning: 'seed',
      tasks: [...tasks, { id, subject: '', assignee: members[0]?.name }],
    })
  }
  const setOptionalText = (field: 'description' | 'protocol' | 'executionPrompt', value: string): void => {
    onChange({ ...profile, [field]: value })
  }
  const setPolicyField = (field: ReviewPolicyField, value: string): void => {
    const policy = { ...(profile.reviewPolicy ?? {}) }
    if (value.trim() === '') delete policy[field]
    else policy[field] = Number(value)
    onChange({ ...profile, ...(Object.keys(policy).length === 0 ? { reviewPolicy: undefined } : { reviewPolicy: policy }) })
  }
  const requiredReviewers = profile.reviewPolicy?.requiredReviewers?.join(', ') ?? ''

  return (
    <div className={css.profileForm}>
      <div className={css.fields}>
        <label className={`${css.field} ${css.profileWideField}`}>
          <span>{t('settings.profiles.description')}</span>
          <input
            className={css.profileInput}
            value={profile.description ?? ''}
            disabled={disabled}
            onChange={(event) => setOptionalText('description', event.currentTarget.value)}
          />
        </label>
        <label className={`${css.field} ${css.profileWideField}`}>
          <span>{t('settings.profiles.protocol')}</span>
          <textarea
            className={css.profileTextarea}
            value={profile.protocol ?? ''}
            disabled={disabled}
            rows={3}
            onChange={(event) => setOptionalText('protocol', event.currentTarget.value)}
          />
        </label>
        <label className={`${css.field} ${css.profileWideField}`}>
          <span>{t('settings.profiles.executionPrompt')}</span>
          <textarea
            className={css.profileTextarea}
            value={profile.executionPrompt ?? ''}
            disabled={disabled}
            rows={4}
            onChange={(event) => setOptionalText('executionPrompt', event.currentTarget.value)}
          />
        </label>
      </div>

      <fieldset className={css.profileFieldset} disabled={disabled}>
        <legend className={css.profileLegend}>{t('settings.profiles.taskPlanning')}</legend>
        <label className={css.choice}>
          <input
            type="radio"
            name="agent-teams-profile-task-planning"
            value="captain"
            checked={(profile.taskPlanning ?? 'seed') === 'captain'}
            onChange={() => onChange({ ...profile, taskPlanning: 'captain' })}
          />
          <span><strong>{t('settings.profiles.captain')}</strong><small>{t('settings.profiles.captainHelp')}</small></span>
        </label>
        <label className={css.choice}>
          <input
            type="radio"
            name="agent-teams-profile-task-planning"
            value="seed"
            checked={(profile.taskPlanning ?? 'seed') === 'seed'}
            onChange={() => onChange({ ...profile, taskPlanning: 'seed' })}
          />
          <span><strong>{t('settings.profiles.seed')}</strong><small>{t('settings.profiles.seedHelp')}</small></span>
        </label>
      </fieldset>

      <div className={css.profileSubsection}>
        <div className={css.profileRowHeader}>
          <h4 className={css.profileSubsectionTitle}>{t('settings.profiles.members')}</h4>
          <Button type="button" variant="outline" size="sm" disabled={disabled || members.length >= 8} onClick={addMember}>
            {t('settings.profiles.addMember')}
          </Button>
        </div>
        {members.map((member, index) => (
          <MemberEditor
            key={`${index}-${member.name}`}
            catalog={catalog}
            catalogReady={catalogReady}
            disabled={disabled}
            index={index}
            member={member}
            onChange={(next) => updateMember(index, next)}
            onRemove={() => removeMember(index)}
            t={t}
          />
        ))}
      </div>

      <details className={css.profileDetails}>
        <summary>{t('settings.profiles.profileFallback')}</summary>
        <FallbackFields
          disabled={disabled}
          fallback={profile.fallback}
          onChange={(fallback) => onChange({ ...profile, ...(fallback === undefined ? { fallback: undefined } : { fallback }) })}
          t={t}
        />
      </details>

      <div className={css.profileSubsection}>
        <div className={css.profileRowHeader}>
          <div>
            <h4 className={css.profileSubsectionTitle}>{t('settings.profiles.tasks')}</h4>
            {(profile.taskPlanning ?? 'seed') === 'captain' && <p className={css.profileHint}>{t('settings.profiles.captainTasksHint')}</p>}
          </div>
          <Button type="button" variant="outline" size="sm" disabled={disabled || tasks.length >= 32} onClick={addTask}>
            {t('settings.profiles.addTask')}
          </Button>
        </div>
        {(profile.taskPlanning ?? 'seed') === 'seed' && tasks.map((task, index) => (
          <TaskEditor
            key={`${index}-${task.id}`}
            disabled={disabled}
            members={members}
            onChange={(next) => updateTask(index, next)}
            onRemove={() => removeTask(index)}
            task={task}
            t={t}
          />
        ))}
      </div>

      <details className={css.profileDetails}>
        <summary>{t('settings.profiles.reviewPolicy')}</summary>
        <div className={css.fields}>
          {([
            ['requirementsMinRounds', 'settings.profiles.requirementsMinRounds'],
            ['requirementsMaxRounds', 'settings.profiles.requirementsMaxRounds'],
            ['codeMaxRounds', 'settings.profiles.codeMaxRounds'],
            ['maxRepairAttempts', 'settings.profiles.maxRepairAttempts'],
          ] as const).map(([field, label]) => (
            <label className={css.field} key={field}>
              <span>{t(label)}</span>
              <input
                className={css.profileInput}
                type="number"
                min={1}
                value={profile.reviewPolicy?.[field] ?? ''}
                disabled={disabled}
                onChange={(event) => setPolicyField(field, event.currentTarget.value)}
              />
            </label>
          ))}
          <label className={`${css.field} ${css.profileWideField}`}>
            <span>{t('settings.profiles.requiredReviewers')}</span>
            <input
              className={css.profileInput}
              value={requiredReviewers}
              disabled={disabled}
              placeholder={t('settings.profiles.commaSeparated')}
              onChange={(event) => onChange({
                ...profile,
                reviewPolicy: {
                  ...(profile.reviewPolicy ?? {}),
                  requiredReviewers: event.currentTarget.value.split(',').map((reviewer) => reviewer.trim()).filter(Boolean),
                },
              })}
            />
          </label>
        </div>
      </details>
    </div>
  )
}

export function TeamProfilesEditor({ catalog, onRetryCatalog, t, writable }: TeamProfilesEditorProps) {
  const bridge = useMemo(() => getAgentTeamsDesktopBridge(), [])
  const [snapshot, setSnapshot] = useState<AgentTeamsProfilesSnapshot | null>(null)
  const [profiles, setProfiles] = useState<Record<string, TeamProfileConfig>>({})
  const [committedProfiles, setCommittedProfiles] = useState<Record<string, TeamProfileConfig>>({})
  const [committedProfileNames, setCommittedProfileNames] = useState<CommittedProfileNameMap>({})
  const [selectedName, setSelectedName] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadProfiles = useCallback(() => {
    if (bridge?.getAgentTeamsProfiles === undefined) {
      setLoading(false)
      setError(t('settings.profiles.bridgeUnavailable'))
      return
    }
    setLoading(true)
    setError(null)
    let active = true
    void bridge.getAgentTeamsProfiles().then((next) => {
      if (!active) return
      const normalized = normalizeProfileSnapshot(next)
      setSnapshot(normalized)
      setProfiles(normalized.profiles)
      setCommittedProfiles(cloneProfileMap(normalized.profiles))
      setCommittedProfileNames(createCommittedProfileNameMap(normalized.profiles))
      setSelectedName(Object.keys(normalized.profiles)[0] ?? '')
      setMessage(null)
      setLoading(false)
    }).catch((reason: unknown) => {
       if (!active) return
       setLoading(false)
       setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { active = false }
  }, [bridge, t])

  useEffect(() => loadProfiles(), [loadProfiles])
  useEffect(() => { setNameDraft(selectedName) }, [selectedName])
  useEffect(() => {
    if (selectedName !== '' && profiles[selectedName] !== undefined) return
    setSelectedName(Object.keys(profiles)[0] ?? '')
  }, [profiles, selectedName])

  const selectedProfile = selectedName === '' ? undefined : profiles[selectedName]
  const builtInNames = snapshot?.builtInNames ?? []
  const builtInProfiles = snapshot?.builtInProfiles ?? {}
  const selectedIsBuiltIn = selectedName !== '' && builtInNames.includes(selectedName)
  const dirty = JSON.stringify(profiles) !== JSON.stringify(committedProfiles)
  const controlsDisabled = !writable || loading || saving
  const catalogReady = catalog.status === 'ready'
  const explicitRouteBlocked = hasUnvalidatedExplicitRoleDraft(
    profiles,
    committedProfiles,
    catalog.models,
    catalogReady,
    committedProfileNames,
  )

  const updateSelectedProfile = (next: TeamProfileConfig): void => {
    setProfiles((current) => updateProfileMap(current, selectedName, () => next))
    setMessage(null)
    setError(null)
  }

  const addProfile = (): void => {
    const name = uniqueName(Object.keys(profiles), 'custom-profile')
    const next = cloneProfileMap(profiles)
    next[name] = createEmptyTeamProfile(name)
    setProfiles(next)
    setSelectedName(name)
    setMessage(null)
    setError(null)
  }

  const copyProfile = (): void => {
    if (selectedProfile === undefined) return
    const name = uniqueName(Object.keys(profiles), `${selectedName}-copy`)
    const next = cloneProfileMap(profiles)
    next[name] = cloneProfileMap({ [name]: selectedProfile })[name] ?? createEmptyTeamProfile(name)
    setProfiles(next)
    setSelectedName(name)
    setMessage(null)
    setError(null)
  }

  const removeProfile = (): void => {
    if (selectedProfile === undefined || selectedIsBuiltIn) return
    const next = cloneProfileMap(profiles)
    delete next[selectedName]
    const nextName = Object.keys(next)[0] ?? ''
    setProfiles(next)
    setCommittedProfileNames((current) => {
      const nextNames = { ...current }
      delete nextNames[selectedName]
      return nextNames
    })
    setSelectedName(nextName)
    setMessage(null)
    setError(null)
  }

  const restoreProfile = (): void => {
    const original = builtInProfiles[selectedName]
    if (!selectedIsBuiltIn || original === undefined) return
    setProfiles((current) => updateProfileMap(current, selectedName, () => cloneProfileMap({ [selectedName]: original })[selectedName] ?? original))
    setMessage(null)
    setError(null)
  }

  const renamedProfiles = (): RenamedProfilesResult | undefined => {
    if (selectedProfile === undefined || selectedIsBuiltIn) {
      return { profiles, committedProfileNames, selectedName }
    }
    const nextName = nameDraft.trim()
    if (nextName === selectedName) return { profiles, committedProfileNames, selectedName }
    if (nextName === '' || nextName.toLowerCase() === 'captain' || !/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u.test(nextName)) {
      setError(t('settings.profiles.invalidName'))
      return undefined
    }
    if (profiles[nextName] !== undefined) {
      setError(t('settings.profiles.duplicateName'))
      return undefined
    }
    const next = cloneProfileMap(profiles)
    const profile = next[selectedName]
    if (profile === undefined) return undefined
    delete next[selectedName]
    next[nextName] = profile
    return {
      profiles: next,
      committedProfileNames: renameCommittedProfileName(committedProfileNames, selectedName, nextName),
      selectedName: nextName,
    }
  }

  const renameProfile = (): boolean => {
    const renamed = renamedProfiles()
    if (renamed === undefined) return false
    if (renamed.profiles === profiles) return true
    setProfiles(renamed.profiles)
    setCommittedProfileNames(renamed.committedProfileNames)
    setSelectedName(renamed.selectedName)
    setNameDraft(renamed.selectedName)
    setMessage(null)
    setError(null)
    return true
  }

  const saveProfiles = async (): Promise<void> => {
    if (bridge?.setAgentTeamsProfiles === undefined || saving) return
    const renamed = renamedProfiles()
    if (renamed === undefined) return
    const nextProfiles = renamed.profiles
    if (nextProfiles !== profiles) {
      setProfiles(nextProfiles)
      setCommittedProfileNames(renamed.committedProfileNames)
    }
    setError(null)
    if (hasUnvalidatedExplicitRoleDraft(
      nextProfiles,
      committedProfiles,
      catalog.models,
      catalogReady,
      renamed.committedProfileNames,
    )) {
      setError(t('settings.profiles.explicitCatalogRequired'))
      return
    }
    const prepared = prepareProfileMapForSave(nextProfiles)
    if (!prepared.ok) {
      setError(prepared.error)
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const next = normalizeProfileSnapshot(await bridge.setAgentTeamsProfiles({
        schemaVersion: 2,
        profiles: prepared.profiles,
      }))
      setSnapshot(next)
      setProfiles(next.profiles)
      setCommittedProfiles(cloneProfileMap(next.profiles))
      setCommittedProfileNames(createCommittedProfileNameMap(next.profiles))
      setSelectedName((current) => next.profiles[current] === undefined ? Object.keys(next.profiles)[0] ?? '' : current)
      setMessage(t('settings.profiles.saved'))
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={`${css.section} ${css.profileSection}`} aria-labelledby="agent-teams-profiles-title">
      <div className={css.profileSectionHeader}>
        <div>
          <h3 id="agent-teams-profiles-title" className={css.sectionTitle}>{t('settings.profiles.title')}</h3>
          <p className={css.help}>{t('settings.profiles.help')}</p>
        </div>
        <span className={css.profileMarker}>PROFILE</span>
      </div>

      {loading && <p className={css.catalogStatus} role="status">{t('settings.profiles.loading')}</p>}
      {catalog.status === 'loading' && <p className={css.catalogStatus} role="status" aria-live="polite">{t('settings.catalog.loading')}</p>}
      {catalog.status === 'empty' && <p className={css.catalogStatus} role="status">{t('settings.catalog.empty')}</p>}
      {catalog.status === 'error' && (
        <div className={css.catalogError} role="alert">
          <span>{t('settings.catalog.error', { message: catalog.error })}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetryCatalog}>{t('settings.catalog.retry')}</Button>
        </div>
      )}
      {snapshot?.unsupportedPersistedVersion === true && (
        <p className={css.profileWarning} role="status">{t('settings.profiles.unsupportedPersistedVersion')}</p>
      )}
      {error !== null && <p className={css.profileError} role="alert">{t('settings.profiles.error', { message: error })}</p>}
      {message !== null && <p className={css.profileSaved} role="status">{message} {t('settings.profiles.restart')}</p>}
      {explicitRouteBlocked && <p className={css.profileWarning} role="status">{t('settings.profiles.explicitCatalogRequired')}</p>}

      <div className={css.profileToolbar}>
        <div className={css.profileList} role="listbox" aria-label={t('settings.profiles.listAria')}>
          {Object.keys(profiles).map((name) => (
            <button
              type="button"
              role="option"
              aria-selected={name === selectedName}
              disabled={controlsDisabled || (nameDraft !== selectedName && name !== selectedName)}
              className={`${css.profileListItem} ${name === selectedName ? css.profileListItemSelected : ''}`}
              key={name}
              onClick={() => { setSelectedName(name); setMessage(null); setError(null) }}
            >
              <span>{name}</span>
              <small>{builtInNames.includes(name) ? t('settings.profiles.builtIn') : t('settings.profiles.custom')}</small>
            </button>
          ))}
        </div>
        <div className={css.profileActions}>
          <Button type="button" variant="outline" size="sm" disabled={controlsDisabled} onClick={addProfile}>
            {t('settings.profiles.new')}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={controlsDisabled || selectedProfile === undefined} onClick={copyProfile}>
            {t('settings.profiles.copy')}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={controlsDisabled || selectedProfile === undefined || selectedIsBuiltIn} onClick={removeProfile}>
            {t('settings.profiles.delete')}
          </Button>
        </div>
      </div>

      {selectedProfile !== undefined && (
        <>
          <div className={css.profileIdentity}>
            <label className={css.field}>
              <span>{t('settings.profiles.name')}</span>
              <input
                className={css.profileInput}
                value={nameDraft}
                disabled={controlsDisabled || selectedIsBuiltIn}
                onChange={(event) => setNameDraft(event.currentTarget.value)}
              />
            </label>
            <div className={css.profileIdentityActions}>
              <span className={css.profileBadge}>{selectedIsBuiltIn ? t('settings.profiles.builtIn') : t('settings.profiles.custom')}</span>
              {!selectedIsBuiltIn && (
                <Button type="button" variant="outline" size="sm" disabled={controlsDisabled} onClick={renameProfile}>
                  {t('settings.profiles.rename')}
                </Button>
              )}
              {selectedIsBuiltIn && (
                <Button type="button" variant="outline" size="sm" disabled={controlsDisabled || !dirty} onClick={restoreProfile}>
                  {t('settings.profiles.restore')}
                </Button>
              )}
            </div>
          </div>
          <ProfileForm
             catalog={catalog.models}
             catalogReady={catalogReady}
            disabled={controlsDisabled}
            onChange={updateSelectedProfile}
            profile={selectedProfile}
            t={t}
          />
          <div className={css.profileSaveBar}>
            {dirty && <span className={css.profileDirty}>{t('settings.profiles.unsaved')}</span>}
             <Button type="button" variant="outline" size="sm" disabled={controlsDisabled || !dirty || explicitRouteBlocked} onClick={() => { void saveProfiles() }}>
              {saving ? t('settings.profiles.saving') : t('settings.profiles.save')}
            </Button>
          </div>
        </>
      )}
      {selectedProfile === undefined && !loading && <p className={css.profileHint}>{t('settings.profiles.empty')}</p>}
    </section>
  )
}
