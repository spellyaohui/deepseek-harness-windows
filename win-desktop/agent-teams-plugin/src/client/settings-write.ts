import type {
  IApiClient, SettingsPathOpView,
} from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { AgentTeamsSettings, DelegationMode, MemberReasoningMode } from '../settings.ts'
import type { ModelCatalogEntry } from './model-catalog.ts'

const SETTINGS_NAMESPACE = 'agent-teams'

export type SettingsWriteState =
  | { status: 'ready'; error: null }
  | { status: 'error'; error: string }

export type SettingsWriteView =
  | { status: 'idle'; ops: null; error: null }
  | { status: 'busy'; ops: readonly SettingsPathOpView[]; error: null }
  | { status: 'error'; ops: readonly SettingsPathOpView[] | null; error: string }

export type SettingsPlanError = 'model-unavailable' | 'no-efforts' | 'no-models' | 'unsupported-effort'

export type SettingsWritePlan =
  | { ok: true; ops: readonly SettingsPathOpView[] }
  | { ok: false; error: SettingsPlanError }

type SettingsApi = Pick<IApiClient, 'settings'>
type SettingsReadScope = Pick<SettingsScope<AgentTeamsSettings>, 'getSnapshot'>

export interface AgentTeamsSettingsWriter {
  write(ops: readonly SettingsPathOpView[]): Promise<SettingsWriteState>
}

interface WriterOptions {
  api: SettingsApi
  scope: SettingsReadScope
  describe: Pick<SettingsDescribeFace, 'acceptView'>
  timeoutMs?: number
}

class BoundedCallError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`)
    this.name = 'BoundedCallError'
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function bounded<T>(promise: Promise<T>, label: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let open = true
    const timer = setTimeout(() => {
      if (!open) return
      open = false
      reject(new BoundedCallError(label, timeoutMs))
    }, timeoutMs)
    void promise.then((value) => {
      if (!open) return
      open = false
      clearTimeout(timer)
      resolve(value)
    }, (error: unknown) => {
      if (!open) return
      open = false
      clearTimeout(timer)
      reject(error)
    })
  })
}

function laterRevision(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.max(left, right)
}

class SerializedAgentTeamsSettingsWriter implements AgentTeamsSettingsWriter {
  private tail: Promise<void> = Promise.resolve()
  private revision: number | undefined
  private uncertain = false
  private generation = 0
  private readonly timeoutMs: number

  constructor(private readonly options: WriterOptions) {
    this.revision = options.scope.getSnapshot().revision
    this.timeoutMs = options.timeoutMs ?? 10_000
  }

  write(ops: readonly SettingsPathOpView[]): Promise<SettingsWriteState> {
    const run = this.tail.then(() => this.perform([...ops]))
    this.tail = run.then(() => undefined, () => undefined)
    return run
  }

  private async perform(ops: readonly SettingsPathOpView[]): Promise<SettingsWriteState> {
    if (this.uncertain) {
      const recoveryError = await this.recover()
      if (recoveryError !== null) {
        return { status: 'error', error: `settings recovery failed: ${recoveryError}` }
      }
    }

    this.revision = laterRevision(this.revision, this.options.scope.getSnapshot().revision)
    if (this.revision === undefined) {
      this.uncertain = true
      return { status: 'error', error: 'settings revision is not ready' }
    }

    const expectedRevision = this.revision
    const generation = ++this.generation
    let response: Awaited<ReturnType<SettingsApi['settings']['mutate']>>
    try {
      response = await bounded(this.options.api.settings.mutate({
        ns: SETTINGS_NAMESPACE,
        ops: [...ops],
        expectedRevision,
      }), 'settings mutation', this.timeoutMs)
    } catch (error: unknown) {
      if (generation === this.generation) this.generation += 1
      return this.failAndRecover(errorMessage(error))
    }

    if (!response.result.ok) {
      if (generation === this.generation) this.generation += 1
      return this.failAndRecover(response.result.error.message)
    }

    const next = response.result.value
    if (
      generation !== this.generation
      || next.ns !== SETTINGS_NAMESPACE
      || next.revision < expectedRevision
    ) {
      return this.failAndRecover('settings mutation returned a stale or mismatched view')
    }

    this.revision = next.revision
    this.uncertain = false
    this.options.describe.acceptView(next)
    return { status: 'ready', error: null }
  }

  private async failAndRecover(writeError: string): Promise<SettingsWriteState> {
    this.uncertain = true
    const recoveryError = await this.recover()
    return {
      status: 'error',
      error: recoveryError === null
        ? writeError
        : `${writeError}; recovery failed: ${recoveryError}`,
    }
  }

  private async recover(): Promise<string | null> {
    ++this.generation
    let response: Awaited<ReturnType<SettingsApi['settings']['describe']>>
    try {
      response = await bounded(
        this.options.api.settings.describe({}),
        'settings recovery',
        this.timeoutMs,
      )
    } catch (error: unknown) {
      return errorMessage(error)
    }
    if (!response.result.ok) return response.result.error.message

    const recovered = response.result.value.namespaces.find((entry) => entry.ns === SETTINGS_NAMESPACE)
    if (recovered === undefined) return 'agent-teams namespace is unavailable'

    const heldRevision = laterRevision(this.revision, this.options.scope.getSnapshot().revision)
    if (heldRevision === undefined || recovered.revision >= heldRevision) {
      this.options.describe.acceptView(recovered)
      this.revision = recovered.revision
    } else {
      this.revision = heldRevision
    }
    this.uncertain = false
    return null
  }
}

export function createAgentTeamsSettingsWriter(options: WriterOptions): AgentTeamsSettingsWriter {
  return new SerializedAgentTeamsSettingsWriter(options)
}

function set(field: keyof AgentTeamsSettings, value: unknown): SettingsPathOpView {
  return { op: 'set', path: [field], value }
}

function compareIds(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

function supportsEffort(model: ModelCatalogEntry | undefined, effort: string): boolean {
  return effort !== '' && model?.efforts.some((candidate) => candidate.id === effort) === true
}

function explicitReset(settings: AgentTeamsSettings, model: ModelCatalogEntry): SettingsPathOpView[] {
  return settings.memberReasoningMode === 'explicit'
    && !supportsEffort(model, settings.memberReasoningEffort)
    ? [
        set('memberReasoningEffort', ''),
        set('memberReasoningMode', 'target-default'),
      ]
    : []
}

export function planDelegationModeChange(mode: DelegationMode): SettingsWritePlan {
  return { ok: true, ops: [set('delegationMode', mode)] }
}

export function planProviderChange(
  settings: AgentTeamsSettings,
  provider: string,
  catalog: readonly ModelCatalogEntry[],
): SettingsWritePlan {
  if (provider === '') {
    const reset = settings.memberReasoningMode === 'explicit'
      ? [set('memberReasoningEffort', ''), set('memberReasoningMode', 'target-default')]
      : []
    return {
      ok: true,
      ops: [...reset, set('memberModel', ''), set('memberLlmProvider', '')],
    }
  }

  const models = catalog.filter((candidate) => candidate.provider === provider).sort(compareIds)
  const model = models.find((candidate) => candidate.id === settings.memberModel) ?? models[0]
  if (model === undefined) return { ok: false, error: 'no-models' }

  return {
    ok: true,
    ops: [
      ...explicitReset(settings, model),
      set('memberModel', model.id),
      set('memberLlmProvider', provider),
    ],
  }
}

export function planModelChange(
  settings: AgentTeamsSettings,
  provider: string,
  modelId: string,
  catalog: readonly ModelCatalogEntry[],
): SettingsWritePlan {
  const model = catalog.find((candidate) => candidate.provider === provider && candidate.id === modelId)
  if (model === undefined) return { ok: false, error: 'model-unavailable' }
  return {
    ok: true,
    ops: [
      ...explicitReset(settings, model),
      set('memberModel', model.id),
      set('memberLlmProvider', provider),
    ],
  }
}

export function planReasoningModeChange(
  settings: AgentTeamsSettings,
  mode: MemberReasoningMode,
  model: ModelCatalogEntry | undefined,
): SettingsWritePlan {
  if (mode === 'explicit') {
    if (model === undefined || model.efforts.length === 0) return { ok: false, error: 'no-efforts' }
    const effort = model.efforts.find((candidate) => candidate.id === settings.memberReasoningEffort)
      ?? model.efforts.find((candidate) => candidate.id === model.defaultEffort)
      ?? [...model.efforts].sort(compareIds)[0]
    if (effort === undefined) return { ok: false, error: 'no-efforts' }
    return {
      ok: true,
      ops: [set('memberReasoningEffort', effort.id), set('memberReasoningMode', 'explicit')],
    }
  }
  return {
    ok: true,
    ops: [set('memberReasoningEffort', ''), set('memberReasoningMode', mode)],
  }
}

export function planReasoningEffortChange(
  effort: string,
  model: ModelCatalogEntry | undefined,
): SettingsWritePlan {
  if (!supportsEffort(model, effort)) return { ok: false, error: 'unsupported-effort' }
  return {
    ok: true,
    ops: [set('memberReasoningEffort', effort), set('memberReasoningMode', 'explicit')],
  }
}

export async function runAgentTeamsSettingsAction(
  writer: AgentTeamsSettingsWriter,
  ops: readonly SettingsPathOpView[],
  publish: (state: SettingsWriteView) => void,
): Promise<SettingsWriteState> {
  const retryOps = [...ops]
  publish({ status: 'busy', ops: retryOps, error: null })
  let result: SettingsWriteState | undefined
  try {
    result = await writer.write(ops)
  } catch (error: unknown) {
    result = { status: 'error', error: errorMessage(error) }
  } finally {
    if (result === undefined) result = { status: 'error', error: 'settings write did not settle' }
    publish(result.status === 'ready'
      ? { status: 'idle', ops: null, error: null }
      : { status: 'error', ops: retryOps, error: result.error })
  }
  return result
}
