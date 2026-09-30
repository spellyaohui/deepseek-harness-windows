/**
 * The model list of one pi-ai provider profile, plus the action that asks the
 * provider what it serves.
 *
 * The list is the profile's `models` array as the card holds it: an empty list
 * means "serve this route's built-in catalog", and any entry replaces that
 * catalog, so a row is only ever added deliberately. Fetching asks the endpoint
 * **the form currently shows** — including a key typed but not yet saved — so
 * adding a provider is one pass instead of save-then-return; the reply is
 * candidates the user picks from, never configuration written behind them.
 *
 * A provider that cannot be interrogated (an unreachable endpoint, a protocol
 * with no readable listing) is not a dead end: the failure is shown next to the
 * rows the user can still fill in by hand.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LlmDiscoveredModel } from '@deepseek-ai/dsh-api-remotes/client'
import { Button, IconPlusOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { formatCapacity, parseCapacity } from './DeepSeekModelsEditor.tsx'
import type { ModelsOperations } from './operations.ts'
import type { DeepSeekModelDraft } from './DeepSeekModelsEditor.tsx'
import type { en } from './locales.ts'
import { ModelRow } from './ModelRow.tsx'
import { applyImageInputChoiceToAll } from './model-input.ts'
import { applyCapabilityProbeResult, capabilityResultStatus } from './model-capabilities.ts'
import type { CapabilityStatus, ModelCapabilityProbeResult } from '../capability-contract.ts'
import type { ModelCapabilityProbeRemote } from '../remote.ts'
import styles from './ModelsSection.module.css'

/**
 * One configured model row. Fields this card does not edit must survive an
 * edit rather than being dropped by a rebuild.
 */
export type ModelDraft = DeepSeekModelDraft

/** A row's text field, or the empty string when unset or not a string. */
function textOf(model: ModelDraft, key: string): string {
  const value = model[key]
  return typeof value === 'string' ? value : ''
}
/** A row's numeric field, or `undefined` when unset or not a number. */
function numberOf(model: ModelDraft, key: string): number | undefined {
  const value = model[key]
  return typeof value === 'number' ? value : undefined
}

/** What an interrogation needs, taken from the live form. */
export interface ProbeTarget {
  /** Settings namespace whose adapter family answers. */
  settingsNs: string
  /**
   * Route being edited, when the card edits one. An adapter that already
   * describes it answers from its own registry, so such a card can ask without
   * an endpoint at all.
   */
  provider?: string
  /** Endpoint as the form currently shows it. */
  baseURL?: string
  /** Wire protocol the form names, when it names one. */
  api?: string
  /** Key typed into the form and not yet stored, when there is one. */
  apiKey?: string
  /** Stored credential reference resolved only by the Host capability probe. */
  credentialRef?: string
}

/** Props of {@link ModelListEditor}. */
export interface ModelListEditorProps {
  /** The rows as currently drafted. */
  models: readonly ModelDraft[]
  /** Installed provider whose catalog supplies defaults without endpoint I/O. */
  catalogProvider?: string | undefined
  /** Route input types for models absent from the installed catalog. */
  defaultInput?: readonly string[] | undefined
  /** Whether the user layer currently owns the whole array; absent on a create. */
  overridden?: boolean
  /** Replace the drafted rows. */
  onChange: (models: ModelDraft[]) => void
  /** Remove the user-owned array and return to inheritance; absent on a create. */
  onReset?: () => void
  /** Endpoint facts for the fetch action. */
  probe: ProbeTarget
  /**
   * Copy key naming why the fetch action is unavailable, or `undefined` when
   * it is. The card owns this because the key it would send is judged there:
   * asking with a key the form has already refused spends a round trip to be
   * told what the field already says.
   */
  probeBlocked?: keyof typeof en | undefined
  /** The Host operations whose interrogation answers the fetch action. */
  operations: ModelsOperations
  /** Optional Host probe; normal model editing remains available while it mounts. */
  modelCapabilities?: ModelCapabilityProbeRemote
  /** Section copy. */
  t: (key: keyof typeof en) => string
  /** Disable every control (read-only deployment or a pending write). */
  disabled: boolean
  /**
   * Called once per change with whether an endpoint interrogation is in
   * flight. The owning card folds it into its own busy state so the surface
   * around the card — a mode switch, say — can refuse to move while the
   * answer, and the picker it opens, is still bound for this list.
   */
  onBusyChange?: (busy: boolean) => void
}

/** The two token counts edited as K/M-suffixed text behind a row's disclosure. */
type CapacityField = 'contextWindow' | 'maxTokens'

/**
 * What an empty capacity field is worth, shown as its placeholder so a row left
 * blank does not read as a model with no capacity at all.
 *
 * The magnitudes are the adapter's own route-level fallbacks (`llm-pi-ai`'s
 * `defaultContextWindow` and `defaultMaxTokens`), spelled the way a person
 * would say them. They are a hint, not a mirror: this page counts `K` as 1000,
 * so typing `256K` stores 256000 while leaving the field blank keeps the
 * adapter's 262144. A deployment that overrides those defaults is not
 * reflected here — nothing on this page can read them.
 */
const CAPACITY_HINT: Readonly<Record<CapacityField, string>> = {
  contextWindow: '256K',
  maxTokens: '32K',
}

/**
 * Spell a stored count for a field that may be unset. The spelling itself is
 * {@link formatCapacity}, shared with the DeepSeek catalog editor so both
 * surfaces read and write one K/M vocabulary.
 * @param value - stored capacity, or `undefined` for an unset field.
 * @returns the field text, empty when unset.
 */
function capacitySpelling(value: number | undefined): string {
  return value === undefined ? '' : formatCapacity(value)
}

/** Adopt a candidate, preserving disclosed capacities and input types. */
function adopt(candidate: LlmDiscoveredModel): ModelDraft {
  return {
    id: candidate.id,
    ...candidate.name === undefined ? {} : { name: candidate.name },
    ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow },
    ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens },
    ...candidate.inputModalities === undefined ? {} : { input: [...candidate.inputModalities] },
  }
}

/** Resolve the installed catalog's per-model input declaration before the route default. */
export function inputFallbackForModel(
  inputDefaults: ReadonlyMap<string, readonly string[] | undefined>,
  defaultInput: readonly string[] | undefined,
  modelId: string,
): readonly string[] | undefined {
  return inputDefaults.get(modelId) ?? defaultInput
}

/** Keep candidate filtering deterministic and independent of the picker presentation. */
export function filterModelCandidates(
  candidates: readonly LlmDiscoveredModel[],
  query: string,
): readonly LlmDiscoveredModel[] {
  const normalized = query.trim().toLowerCase()
  if (normalized.length === 0) return candidates
  return candidates.filter(candidate => candidate.id.toLowerCase().includes(normalized)
    || candidate.name?.toLowerCase().includes(normalized) === true)
}

function capabilityStatusKey(status: CapabilityStatus): keyof typeof en {
  switch (status) {
    case 'supported': return 'capabilitySupported'
    case 'unsupported': return 'capabilityUnsupported'
    case 'inconclusive': return 'capabilityInconclusive'
    case 'not-applicable': return 'capabilityNotApplicable'
  }
}

function capabilitySummary(result: ModelCapabilityProbeResult, t: (key: keyof typeof en) => string): string {
  const counts: Record<CapabilityStatus, number> = {
    supported: 0, unsupported: 0, inconclusive: 0, 'not-applicable': 0,
  }
  for (const check of Object.values(result.checks)) counts[check.status] += 1
  return [
    `${t('capabilitySupported')} ${String(counts.supported)}`,
    `${t('capabilityUnsupported')} ${String(counts.unsupported)}`,
    `${t('capabilityInconclusive')} ${String(counts.inconclusive)}`,
  ].join(' · ')
}

function probeCandidate(model: ModelDraft): Record<string, unknown> {
  return Object.hasOwn(model, 'reasoningEfforts') ? { reasoningEfforts: model['reasoningEfforts'] } : {}
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Construct the redacted client request; the Host resolves credentialRef. */
export function capabilityProbeRequestFor(
  modelId: string,
  protocol: string,
  baseURL: string,
  target: Pick<ProbeTarget, 'credentialRef' | 'apiKey'>,
  candidate: Record<string, unknown>,
) {
  return {
    modelId, protocol, baseURL,
    ...target.credentialRef === undefined ? {} : { credentialRef: target.credentialRef },
    ...target.apiKey === undefined ? {} : { apiKey: target.apiKey },
    candidate,
  }
}

/**
 * Render the model list with its fetch action.
 * @param props - the drafted rows, probe target, wire face, and copy.
 * @returns the model-list editor.
 */
export function ModelListEditor(props: ModelListEditorProps): ReactNode {
  const { models, onChange, probe, operations, modelCapabilities, t, disabled, onBusyChange } = props
  const { catalogProvider } = props
  const [busy, setBusy] = useState(false)
  const [probeBusy, setProbeBusy] = useState(false)
  useEffect(() => { onBusyChange?.(busy || probeBusy) }, [busy, probeBusy, onBusyChange])
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [inheritedCatalog, setInheritedCatalog] = useState<{
    provider: string
    models: readonly LlmDiscoveredModel[]
  } | undefined>(undefined)
  useEffect(() => {
    if (catalogProvider === undefined) return
    let current = true
    void operations.discoverModels(probe.settingsNs, { provider: catalogProvider }).then((answer) => {
      if (!current) return
      setInheritedCatalog({ provider: catalogProvider, models: answer.kind === 'found' ? answer.models : [] })
      setFailure(answer.kind === 'refused' ? answer.message : undefined)
    })
    return () => { current = false }
  }, [catalogProvider, operations, probe.settingsNs])
  const catalog = inheritedCatalog?.provider === catalogProvider ? inheritedCatalog?.models : undefined
  const inputDefaults = useMemo(() => new Map(catalog?.map(model => [model.id, model.inputModalities])), [catalog])
  const [candidates, setCandidates] = useState<readonly LlmDiscoveredModel[] | undefined>(undefined)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [candidateQuery, setCandidateQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [probeResults, setProbeResults] = useState<ReadonlyMap<string, ModelCapabilityProbeResult>>(new Map())
  const [overwriteExisting, setOverwriteExisting] = useState(false)
  const [probeFailure, setProbeFailure] = useState<string | undefined>(undefined)
  const [probeNotice, setProbeNotice] = useState<string | undefined>(undefined)
  const probeController = useRef<AbortController | null>(null)
  const modelsRef = useRef<readonly ModelDraft[]>(models)
  modelsRef.current = models
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set())
  // Capacities are edited as text, so a field's keystrokes are held here rather
  // than re-derived from the parsed count on every change — that would rewrite
  // `1000` to `1K` mid-word. Unreadable text is kept past blur so the refusal
  // names a row the user can still see, which is why this is one entry PER
  // FIELD: a single buffer would be displaced by editing any other field, and
  // the abandoned one would render its stored NaN as the literal `NaN`.
  const [editing, setEditing] = useState<ReadonlyMap<string, string>>(new Map())

  useEffect(() => () => { probeController.current?.abort() }, [])

  /** Buffer key for one capacity field; the row half moves when rows do. */
  const bufferKey = (index: number, field: CapacityField): string => `${String(index)}:${field}`

  const editCapacity = (index: number, field: CapacityField, text: string): void => {
    setEditing(current => new Map(current).set(bufferKey(index, field), text))
    patch(index, { [field]: parseCapacity(text) })
  }

  /** What a capacity field shows: the buffer while typing, else the stored count. */
  const capacityText = (model: ModelDraft, index: number, field: CapacityField): string =>
    editing.get(bufferKey(index, field)) ?? capacitySpelling(numberOf(model, field))

  /** Drop one row's entries and shift the rows after it down, in one pass. */
  const reindexOnRemove = (
    current: ReadonlyMap<string, string>,
    index: number,
  ): Map<string, string> => {
    const next = new Map<string, string>()
    for (const [key, value] of current) {
      const at = Number(key.slice(0, key.indexOf(':')))
      if (at === index) continue
      // Only the row number moves; the field half of the key is untouched.
      next.set(at > index ? key.replace(/^\d+/, String(at - 1)) : key, value)
    }
    return next
  }

  const toggleExpanded = (index: number): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(index)) next.add(index)
      return next
    })
  }

  const patch = (index: number, next: Record<string, string | number | undefined>): void => {
    onChange(models.map((model, at) => {
      if (at !== index) return model
      // Rebuilt rather than spread over: an emptied optional field has to leave
      // the profile, not be stored as a value its schema would reject.
      // Spread first so a field this card does not edit survives; an emptied
      // optional field is then dropped rather than stored as a value its
      // schema would reject.
      const cleared = new Set(
        Object.entries(next).filter(([, value]) => value === undefined || value === '').map(([key]) => key),
      )
      return Object.fromEntries(
        Object.entries({ ...model, ...next }).filter(([key]) => !cleared.has(key)),
      )
    }))
  }

  const selectableIds = models.map(model => textOf(model, 'id').trim()).filter(id => id.length > 0)
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
  const toggleSelected = (id: string): void => {
    setSelectedIds(current => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }
  const toggleAllSelected = (): void => { setSelectedIds(allSelected ? new Set() : new Set(selectableIds)) }
  const cancelProbe = (): void => { probeController.current?.abort() }

  const probeSelected = async (): Promise<void> => {
    if (modelCapabilities === undefined) return setProbeFailure(t('capabilityUnavailable'))
    const ids = [...selectedIds].filter(id => selectableIds.includes(id))
    if (ids.length === 0) return setProbeFailure(t('capabilitySelectModelFirst'))
    const baseURL = probe.baseURL?.trim() ?? ''
    if (baseURL.length === 0) return setProbeFailure(t('capabilityNeedsBaseUrl'))
    const controller = new AbortController()
    probeController.current = controller
    setProbeBusy(true)
    setProbeFailure(undefined)
    setProbeNotice(undefined)
    let completed = 0
    try {
      for (const id of ids) {
        if (controller.signal.aborted) break
        const model = modelsRef.current.find(candidate => textOf(candidate, 'id').trim() === id)
        if (model === undefined) continue
        const protocol = textOf(model, 'api').trim() || probe.api?.trim() || ''
        if (protocol.length === 0) {
          setProbeFailure(`${id}: ${t('capabilityNeedsProtocol')}`)
          continue
        }
        const response = await modelCapabilities.probe(
          capabilityProbeRequestFor(id, protocol, baseURL, probe, probeCandidate(model)),
          controller.signal,
        )
        if (!response.ok) {
          setProbeFailure(`${id}: ${response.error.message}`)
          continue
        }
        setProbeResults(current => new Map(current).set(id, response.value))
        const updated = applyCapabilityProbeResult(modelsRef.current, response.value, overwriteExisting)
        modelsRef.current = updated
        onChange(updated)
        completed += 1
      }
      setProbeNotice(controller.signal.aborted
        ? t('capabilityCancelled')
        : `${t('capabilityCompleted')} ${String(completed)}/${String(ids.length)}`)
    } catch (error) {
      if (controller.signal.aborted) setProbeNotice(t('capabilityCancelled'))
      else setProbeFailure(messageOf(error))
    } finally {
      if (probeController.current === controller) probeController.current = null
      setProbeBusy(false)
    }
  }

  const fetchModels = async (): Promise<void> => {
    setBusy(true)
    setFailure(undefined)
    try {
      const answer = await operations.discoverModels(probe.settingsNs, {
        ...probe.provider === undefined ? {} : { provider: probe.provider },
        ...probe.baseURL === undefined || probe.baseURL.length === 0 ? {} : { baseURL: probe.baseURL },
        ...probe.api === undefined ? {} : { api: probe.api },
        ...probe.apiKey === undefined ? {} : { apiKey: probe.apiKey },
      })
      if (answer.kind === 'refused') {
        setFailure(answer.message)
        return
      }
      const found = answer.models
      if (catalogProvider !== undefined) setInheritedCatalog({ provider: catalogProvider, models: found })
      if (found.length === 0) {
        setFailure(t('fetchEmpty'))
        return
      }
      // Everything already configured starts unchecked, so adopting a
      // selection never silently rewrites a capacity the user corrected.
      const known = new Set(models.map(model => textOf(model, 'id')))
      setCandidateQuery('')
      setCandidates(found)
      setPicked(new Set(found.filter(model => !known.has(model.id)).map(model => model.id)))
    } finally {
      setBusy(false)
    }
  }

  const closePicker = (): void => {
    setCandidates(undefined)
    setPicked(new Set())
    setCandidateQuery('')
  }

  const adoptPicked = (): void => {
    /* v8 ignore next -- the dialog only renders with candidates loaded */
    if (candidates === undefined) return
    const byId = new Map(models.map(model => [textOf(model, 'id'), model]))
    for (const candidate of candidates) {
      if (!picked.has(candidate.id)) continue
      // A row the user already tuned wins over the provider's own numbers.
      // Keyed by id, so a half-typed row whose id is still empty is not a
      // match and the candidate joins as its own row — correct, since a row
      // without an id is not yet a model and the create/apply gates refuse it.
      byId.set(candidate.id, byId.get(candidate.id) ?? adopt(candidate))
    }
    onChange([...byId.values()])
    closePicker()
  }

  const toggle = (id: string): void => {
    setPicked((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  const activeCandidates = candidates ?? []
  const visibleCandidates = filterModelCandidates(activeCandidates, candidateQuery)
  const allVisibleCandidatesPicked = visibleCandidates.length > 0
    && visibleCandidates.every(candidate => picked.has(candidate.id))

  const toggleVisibleCandidates = (): void => {
    setPicked((current) => {
      if (visibleCandidates.every(candidate => current.has(candidate.id))) {
        return new Set()
      }
      const next = new Set(current)
      for (const candidate of visibleCandidates) next.add(candidate.id)
      return next
    })
  }

  // A route the adapter already describes answers without an endpoint; only a
  // draft with neither has nothing to ask about.
  const askable = probe.provider !== undefined || (probe.baseURL !== undefined && probe.baseURL.length > 0)
  return (
    <section className={styles['modelCatalog']} aria-label={t('models')}>
      <div className={styles['modelListHead']}>
        <div className={styles['modelCatalogHeading']}>
          <span className={styles['modelCatalogTitle']}>{t('models')}</span>
          {props.overridden === undefined
            ? null
            : (
              <span className={styles['modelCatalogMeta']}>
                {props.overridden ? t('modelsCustomized') : t('modelsInherited')}
              </span>
            )}
        </div>
        <div className={styles['modelListActions']}>
          <button
            type="button"
            className={styles['linkButton']}
            disabled={disabled || probeBusy || models.length === 0}
            onClick={() => { onChange(applyImageInputChoiceToAll(models, 'image')) }}
          >
            {t('setAllModelsToImage')}
          </button>
          <button
            type="button"
            className={styles['linkButton']}
            disabled={disabled || probeBusy || models.length === 0}
            onClick={() => { onChange(applyImageInputChoiceToAll(models, 'auto')) }}
          >
            {t('restoreAllModelsToAuto')}
          </button>
          {props.overridden === true && props.onReset !== undefined
          ? (
            <button
              type="button"
              className={styles['linkButton']}
              disabled={disabled || probeBusy}
              onClick={props.onReset}
            >
              {t('resetModels')}
            </button>
          )
          : null}
          <button
            type="button"
            className={styles['linkButton']}
            disabled={disabled || busy || probeBusy || !askable || props.probeBlocked !== undefined}
            title={props.probeBlocked !== undefined
              ? t(props.probeBlocked)
              : askable ? undefined : t('fetchNeedsBaseUrl')}
            onClick={() => { void fetchModels() }}
          >
            {busy ? t('fetching') : t('fetchModels')}
          </button>
        </div>
      </div>
      <div className={styles['capabilityProbe']} aria-label={t('capabilityTitle')}>
        <div className={styles['capabilityProbeHead']}>
          <span className={styles['modelCatalogTitle']}>{t('capabilityTitle')}</span>
          <span className={styles['modelCatalogMeta']}>{`${t('capabilitySelected')} ${String(selectedIds.size)}/${String(selectableIds.length)}`}</span>
        </div>
        <div className={styles['capabilityProbeActions']}>
          <button type="button" className={styles['linkButton']}
            disabled={disabled || busy || probeBusy || modelCapabilities === undefined || selectableIds.length === 0}
            onClick={toggleAllSelected}>
            {t(allSelected ? 'capabilityDeselectAll' : 'capabilitySelectAll')}
          </button>
          <label className={styles['capabilityOverwrite']}>
            <input type="checkbox" checked={overwriteExisting} disabled={disabled || busy || probeBusy || modelCapabilities === undefined}
              onChange={(event) => { setOverwriteExisting(event.target.checked) }} />
            <span>{t('capabilityOverwrite')}</span>
          </label>
          {probeBusy
            ? <button type="button" className={styles['secondaryButton']} onClick={cancelProbe}>{t('capabilityCancel')}</button>
            : <button type="button" className={styles['primaryButton']} disabled={disabled || busy || modelCapabilities === undefined || selectedIds.size === 0}
              onClick={() => { void probeSelected() }}>{t('capabilityProbe')}</button>}
        </div>
        <p className={styles['advancedHint']}>{t('capabilityDraftHint')}</p>
        {!overwriteExisting ? <p className={styles['advancedHint']} role="note">{t('capabilityPreserveHint')}</p> : null}
        {modelCapabilities === undefined ? <p className={styles['error']} role="status">{t('capabilityUnavailable')}</p> : null}
        {probeNotice === undefined ? null : <p className={styles['savedNotice']} role="status" aria-live="polite">{probeNotice}</p>}
        {probeFailure === undefined ? null : <p className={styles['error']} role="alert">{probeFailure}</p>}
      </div>
      {models.length === 0 ? <p className={styles['modelEmpty']}>{t('modelsEmpty')}</p> : null}
      <div className={styles['modelList']}>
        {models.map((model, index) => (
          <ModelRow
            key={index}
            model={model}
            position={index + 1}
            leadingControl={(
              <input
                type="checkbox"
                checked={selectedIds.has(textOf(model, 'id').trim()) && textOf(model, 'id').trim().length > 0}
                aria-label={`${t('capabilitySelectModel')} ${String(index + 1)}`}
                disabled={disabled || probeBusy || modelCapabilities === undefined || textOf(model, 'id').trim().length === 0}
                onChange={() => { toggleSelected(textOf(model, 'id').trim()) }}
              />
            )}
            inputField="input"
            inputFallback={inputFallbackForModel(inputDefaults, props.defaultInput, textOf(model, 'id'))}
            inputLoading={catalogProvider !== undefined && catalog === undefined}
            expanded={expanded.has(index)}
            disabled={disabled || probeBusy}
            t={t}
            contextWindow={{
              value: capacityText(model, index, 'contextWindow'),
              placeholder: CAPACITY_HINT.contextWindow,
              onChange: (text) => { editCapacity(index, 'contextWindow', text) },
            }}
            maxTokens={{
              value: capacityText(model, index, 'maxTokens'),
              placeholder: CAPACITY_HINT.maxTokens,
              onChange: (text) => { editCapacity(index, 'maxTokens', text) },
            }}
            onFieldChange={(field, value) => { patch(index, { [field]: value }) }}
            onChange={(next) => {
              const updated = models.map((row, at) => at === index ? next : row)
              modelsRef.current = updated
              onChange(updated)
            }}
            onToggle={() => { toggleExpanded(index) }}
            onRemove={() => {
              onChange(models.filter((_model, at) => at !== index))
              setExpanded((current) => {
                const next = new Set<number>()
                for (const at of current) {
                  if (at < index) next.add(at)
                  else if (at > index) next.add(at - 1)
                }
                return next
              })
              setEditing(current => reindexOnRemove(current, index))
            }}
            footer={(() => {
              const id = textOf(model, 'id').trim()
              const result = id.length === 0 ? undefined : probeResults.get(id)
              if (result === undefined) return null
              const status = capabilityResultStatus(result)
              return (
                <div className={`${styles['capabilityStatus']} ${styles[`capabilityStatus_${status.replace('-', '_')}`]}`} data-status={status} role="status">
                  <span>{t(capabilityStatusKey(status))}</span>
                  <span>{capabilitySummary(result, t)}</span>
                </div>
              )
            })()}
          />
        ))}
      </div>
      <button
        type="button"
        className={styles['addModelButton']}
        disabled={disabled}
        onClick={() => { onChange([...models, { id: '' }]) }}
      >
        <IconPlusOutlineRegular size={14} />
        {t('addModel')}
      </button>
      {failure !== undefined ? <p className={styles['error']}>{failure}</p> : null}
      <Modal
        open={candidates !== undefined}
        onClose={closePicker}
        title={t('fetchTitle')}
        closeLabel={t('close')}
        description={t('fetchDescription')}
        className={styles['fetchDialog'] as string}
        footer={(
          <>
            <Button variant="outline" onClick={closePicker}>{t('cancel')}</Button>
            <Button variant="outline" onClick={adoptPicked}>{t('fetchAdopt')}</Button>
          </>
        )}
      >
        <div className={styles['candidateToolbar']}>
          <input
            className={`${styles['input']} ${styles['candidateSearch']}`}
            type="search"
            value={candidateQuery}
            placeholder={t('fetchSearch')}
            aria-label={t('fetchSearch')}
            onChange={(event) => { setCandidateQuery(event.target.value) }}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={visibleCandidates.length === 0}
            onClick={toggleVisibleCandidates}
          >
            {t(allVisibleCandidatesPicked ? 'fetchDeselectAll' : 'fetchSelectAll')}
          </Button>
        </div>
        {visibleCandidates.length === 0
          ? <p className={styles['candidateEmpty']} role="status">{t('fetchNoMatches')}</p>
          : (
            <ul className={styles['candidateList']}>
              {visibleCandidates.map(candidate => (
                <li key={candidate.id} className={styles['candidate']}>
                  <label className={styles['candidateLabel']}>
                    <input
                      type="checkbox"
                      checked={picked.has(candidate.id)}
                      onChange={() => { toggle(candidate.id) }}
                    />
                    <span className={styles['candidateId']} title={candidate.name ?? candidate.id}>
                      {candidate.id}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
      </Modal>
    </section>
  )
}
