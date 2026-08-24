import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { mergeCpaCandidates } from '../profile.ts'
import type { CpaModelCandidate } from '../types.ts'
import {
  applyCapacityDrafts,
  capacityDraftsFromModels,
  mergeCapacityDrafts,
  type CpaCapacityDraft,
  type CpaCapacityField,
} from './capacity.ts'
import { createCpaController } from './controller.ts'
import type { CpaProviderCardProps } from './index.tsx'
import { cpaSettingsView } from './view-model.ts'
import styles from './CpaProviderCard.module.css'

type OperationState =
  | { kind: 'idle' }
  | { kind: 'discovering' }
  | { kind: 'saving-profile' }
  | { kind: 'saving-credential' }
  | { kind: 'saved' }
  | { kind: 'error'; stage: 'discovery' | 'profile' | 'credential'; message: string }

export function CpaProviderCard(props: CpaProviderCardProps): ReactNode {
  const { api, controller, useSnapshot, cpaT, cardName } = props
  const snapshot = useSnapshot(state => state)
  const view = cpaSettingsView(snapshot)
  const cpa = useMemo(() => createCpaController(api), [api])
  const initialized = useRef(false)
  const [baseURL, setBaseURL] = useState('')
  const [token, setToken] = useState('')
  const [models, setModels] = useState<CpaModelCandidate[]>([])
  const [capacities, setCapacities] = useState<Map<string, CpaCapacityDraft>>(new Map())
  const [operation, setOperation] = useState<OperationState>({ kind: 'idle' })
  const [profileLocked, setProfileLocked] = useState(false)

  useEffect(() => {
    if (initialized.current || view.status !== 'ready') return
    initialized.current = true
    setBaseURL(view.baseURL)
    setModels(view.models)
    setCapacities(capacityDraftsFromModels(view.models))
  }, [view])

  const busy = operation.kind === 'discovering'
    || operation.kind === 'saving-profile'
    || operation.kind === 'saving-credential'
  const selectedCount = models.filter(model => model.selected !== false).length
  const tokenAvailable = token.trim() !== '' || view.credentialConfigured
  const editable = view.writable && !busy
  const canDiscover = editable && !profileLocked && baseURL.trim() !== '' && tokenAvailable
  const canApply = editable && baseURL.trim() !== '' && tokenAvailable && selectedCount > 0

  const discover = async (): Promise<void> => {
    setOperation({ kind: 'discovering' })
    try {
      const found = await cpa.discover({ baseURL, token })
      setModels(current => mergeCpaCandidates(current, found))
      setCapacities(current => mergeCapacityDrafts(current, found))
      setOperation({ kind: 'idle' })
    } catch (error) {
      setOperation({
        kind: 'error',
        stage: 'discovery',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const save = async (): Promise<void> => {
    if (view.revision === undefined) return
    const parsed = applyCapacityDrafts(models, capacities)
    if (!parsed.ok) {
      const field = cpaT(parsed.field === 'contextWindow' ? 'modelContextWindow' : 'modelMaxTokens')
      setOperation({
        kind: 'error',
        stage: 'profile',
        message: `${parsed.modelId}: ${field} ${cpaT('capacityInvalid')}`,
      })
      return
    }
    const result = await cpa.save({ baseURL, token, models: parsed.models }, view.revision, (stage) => {
      setOperation({ kind: stage === 'profile' ? 'saving-profile' : 'saving-credential' })
    })
    if (!result.ok) {
      if (result.stage === 'credential') setProfileLocked(true)
      setOperation({ kind: 'error', stage: result.stage, message: result.message })
      return
    }
    setProfileLocked(false)
    setToken('')
    setOperation({ kind: 'saved' })
    await controller.load()
  }

  const toggleModel = (id: string): void => {
    setModels(current => current.map(model => (
      model.id === id ? { ...model, selected: model.selected === false } : model
    )))
  }

  const editCapacity = (id: string, field: CpaCapacityField, value: string): void => {
    setCapacities(current => {
      const next = new Map(current)
      const draft = next.get(id) ?? { contextWindow: '', maxTokens: '' }
      next.set(id, { ...draft, [field]: value })
      return next
    })
  }

  if (view.status === 'idle' || view.status === 'loading') {
    return <section className={styles['card']}><p role="status">{cpaT('loading')}</p></section>
  }
  if (view.status === 'error' || view.revision === undefined) {
    return <section className={styles['card']}><p role="alert">{cpaT('unavailable')}</p></section>
  }

  const validation = baseURL.trim() === '' ? cpaT('addressRequired')
    : !tokenAvailable ? cpaT('tokenRequired')
      : selectedCount === 0 ? cpaT('modelRequired') : undefined
  const operationText = operation.kind === 'discovering' ? cpaT('fetchingModels')
    : operation.kind === 'saving-profile' ? cpaT('savingProfile')
      : operation.kind === 'saving-credential' ? cpaT('savingCredential')
        : operation.kind === 'saved' ? cpaT('saved') : undefined

  return (
    <section className={styles['card']} aria-busy={busy} aria-labelledby="cpa-provider-title">
      <header className={styles['header']}>
        <div>
          <h3 id="cpa-provider-title" className={styles['title']}>{cardName}</h3>
          <p className={styles['intro']}>{cpaT('intro')}</p>
        </div>
        <span className={styles['credential']}>
          <span className={view.credentialConfigured ? styles['dotReady'] : styles['dotMissing']} aria-hidden="true" />
          {cpaT(view.credentialConfigured ? 'credentialConfigured' : 'credentialMissing')}
        </span>
      </header>
      {!view.writable ? <p className={styles['notice']}>{cpaT('readOnly')}</p> : null}
      <div className={styles['fields']}>
        <label className={styles['field']} htmlFor="cpa-base-url">
          <span>{cpaT('apiAddress')}</span>
          <input
            id="cpa-base-url"
            className={styles['input']}
            value={baseURL}
            placeholder={cpaT('apiPlaceholder')}
            disabled={!editable || profileLocked}
            onChange={event => { setBaseURL(event.currentTarget.value) }}
          />
        </label>
        <label className={styles['field']} htmlFor="cpa-token">
          <span>{cpaT('token')}</span>
          <input
            id="cpa-token"
            className={styles['input']}
            type="password"
            autoComplete="off"
            value={token}
            placeholder={cpaT('tokenPlaceholder')}
            disabled={!editable}
            onChange={event => { setToken(event.currentTarget.value) }}
          />
        </label>
      </div>
      <div className={styles['modelHeader']}>
        <span>{cpaT('models')}</span>
        <div className={styles['actions']}>
          <button type="button" className={styles['linkButton']} disabled={!canDiscover} onClick={() => { void discover() }}>
            {operation.kind === 'discovering' ? cpaT('fetchingModels') : cpaT('fetchModels')}
          </button>
          <button type="button" className={styles['linkButton']} disabled={!editable || profileLocked || models.length === 0} onClick={() => { setModels(current => current.map(model => ({ ...model, selected: true }))) }}>
            {cpaT('selectAll')}
          </button>
          <button type="button" className={styles['linkButton']} disabled={!editable || profileLocked || models.length === 0} onClick={() => { setModels(current => current.map(model => ({ ...model, selected: false }))) }}>
            {cpaT('clearAll')}
          </button>
        </div>
      </div>
      {models.length === 0
        ? <p className={styles['empty']}>{cpaT('emptyModels')}</p>
        : (
          <ul className={styles['models']}>
            {models.map(model => (
              <li key={model.id}>
                <div className={styles['model']}>
                  <label className={styles['modelIdentity']}>
                    <input type="checkbox" checked={model.selected !== false} disabled={!editable || profileLocked} onChange={() => { toggleModel(model.id) }} />
                    <span>{model.name || model.id}</span>
                    <code>{model.id}</code>
                  </label>
                  <div className={styles['modelCapacities']}>
                    <label className={styles['capacityField']}>
                      <span>{cpaT('modelContextWindow')}</span>
                      <input
                        className={styles['capacityInput']}
                        type="text"
                        inputMode="numeric"
                        value={capacities.get(model.id)?.contextWindow ?? ''}
                        disabled={!editable || profileLocked}
                        onChange={event => { editCapacity(model.id, 'contextWindow', event.currentTarget.value) }}
                      />
                    </label>
                    <label className={styles['capacityField']}>
                      <span>{cpaT('modelMaxTokens')}</span>
                      <input
                        className={styles['capacityInput']}
                        type="text"
                        inputMode="numeric"
                        value={capacities.get(model.id)?.maxTokens ?? ''}
                        disabled={!editable || profileLocked}
                        onChange={event => { editCapacity(model.id, 'maxTokens', event.currentTarget.value) }}
                      />
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      <p className={styles['help']}>{cpaT('reasoningHelp')}</p>
      {operation.kind === 'error' ? <p className={styles['error']} role="alert">{operation.message}</p> : null}
      {operationText === undefined ? null : <p className={styles['status']} role="status" aria-live="polite">{operationText}</p>}
      <footer className={styles['footer']}>
        {validation === undefined ? null : <span className={styles['validation']}>{validation}</span>}
        <button type="button" className={styles['primaryButton']} disabled={!canApply} onClick={() => { void save() }}>
          {operation.kind === 'error' ? cpaT('retry') : cpaT('apply')}
        </button>
      </footer>
    </section>
  )
}
