import type {
  SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsDescribeFace, SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { AgentTeamsSettings, DelegationMode } from '../settings.ts'

const SETTINGS_NAMESPACE = 'agent-teams'

export type SettingsWriteState =
  | { status: 'ready'; error: null }
  | { status: 'error'; error: string }

export type SettingsWriteView =
  | { status: 'idle'; ops: null; error: null }
  | { status: 'busy'; ops: readonly SettingsPathOpView[]; error: null }
  | { status: 'error'; ops: readonly SettingsPathOpView[] | null; error: string }

export type SettingsWritePlan =
  | { ok: true; ops: readonly SettingsPathOpView[] }

type RemoteResult<Value> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
export interface SettingsApi {
  readonly settings: {
    mutate(
      ns: string,
      ops: SettingsPathOpView[],
      expectedRevision: number | undefined,
    ): Promise<RemoteResult<SettingsNamespaceView>>
    describe(): Promise<RemoteResult<SettingsDescribeValue>>
  }
}
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
      response = await bounded(
        this.options.api.settings.mutate(SETTINGS_NAMESPACE, [...ops], expectedRevision),
        'settings mutation',
        this.timeoutMs,
      )
    } catch (error: unknown) {
      if (generation === this.generation) this.generation += 1
      return this.failAndRecover(errorMessage(error))
    }

    if (!response.ok) {
      if (generation === this.generation) this.generation += 1
      return this.failAndRecover(response.error.message)
    }

    const next = response.value
    const knownRevision = laterRevision(
      expectedRevision,
      laterRevision(this.revision, this.options.scope.getSnapshot().revision),
    ) ?? expectedRevision
    if (
      generation !== this.generation
      || next.ns !== SETTINGS_NAMESPACE
      || next.revision < knownRevision
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
        this.options.api.settings.describe(),
        'settings recovery',
        this.timeoutMs,
      )
    } catch (error: unknown) {
      return errorMessage(error)
    }
    if (!response.ok) return response.error.message

    const recovered = response.value.namespaces.find((entry) => entry.ns === SETTINGS_NAMESPACE)
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

function set(field: keyof Pick<AgentTeamsSettings, 'delegationMode'>, value: JsonValue): SettingsPathOpView {
  return { op: 'set', path: [field], value }
}

export function planDelegationModeChange(mode: DelegationMode): SettingsWritePlan {
  return { ok: true, ops: [set('delegationMode', mode)] }
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
