import type {
  SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConfigForm, SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { AgentTeamsSettings, DelegationMode } from '../settings.ts'
import { validateMemberRolePolicy, type MemberRolePolicy } from '../selection-policy.ts'
import type { TeamProfileConfig } from './profile-editor.ts'

export type AgentTeamsEditorSettings = AgentTeamsSettings & { profiles?: Record<string, TeamProfileConfig> }

const SETTINGS_NAMESPACE = 'agent-teams'
export const PROFILE_DRAFT_CONFLICT = 'Profile configuration changed while this draft was being edited; reload the current configuration before saving.'

export type SettingsWriteState =
  | { status: 'ready'; error: null }
  | { status: 'error'; error: string }

export type SettingsWriteView =
  | { status: 'idle'; ops: null; error: null }
  | { status: 'busy'; ops: readonly SettingsPathOpView[]; error: null }
  | { status: 'error'; ops: readonly SettingsPathOpView[] | null; error: string }

/** Editing or cancelling a failed temporary draft must retire its retry payload. */
export function discardTemporaryMemberWrite(view: SettingsWriteView): SettingsWriteView {
  return view.status === 'error' && view.ops?.some(op => op.path[0] === 'temporaryMember')
    ? { status: 'idle', ops: null, error: null }
    : view
}

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
type SettingsReadScope = Pick<ConfigForm<AgentTeamsEditorSettings>, 'getSnapshot'>

/** A stable signature of a draft's effective Profile baseline, independent of key order. */
export function profileSettingsSignature(value: unknown): string {
  const ordered = (entry: unknown): unknown => Array.isArray(entry)
    ? entry.map(ordered)
    : typeof entry === 'object' && entry !== null
      ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, ordered(child)]))
      : entry
  return JSON.stringify(ordered(value ?? {}))
}

export interface AgentTeamsSettingsWriter {
  write(ops: readonly SettingsPathOpView[], expectedProfilesSignature?: string): Promise<SettingsWriteState>
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

  write(ops: readonly SettingsPathOpView[], expectedProfilesSignature?: string): Promise<SettingsWriteState> {
    const run = this.tail.then(() => this.perform([...ops], expectedProfilesSignature))
    this.tail = run.then(() => undefined, () => undefined)
    return run
  }

  private async perform(ops: readonly SettingsPathOpView[], expectedProfilesSignature?: string): Promise<SettingsWriteState> {
    if (this.uncertain) {
      const recoveryError = await this.recover()
      if (recoveryError !== null) {
        return { status: 'error', error: `settings recovery failed: ${recoveryError}` }
      }
    }

    const snapshot = this.options.scope.getSnapshot()
    this.revision = laterRevision(this.revision, snapshot.revision)
    if (expectedProfilesSignature !== undefined
      && profileSettingsSignature(snapshot.value?.profiles) !== expectedProfilesSignature) {
      return { status: 'error', error: PROFILE_DRAFT_CONFLICT }
    }
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

export function planTemporaryMemberChange(policy: MemberRolePolicy): SettingsWritePlan {
  validateMemberRolePolicy(policy)
  const value = {
    reasoningMode: policy.reasoningMode,
    ...(policy.provider?.trim() ? { provider: policy.provider.trim(), model: policy.model!.trim() } : {}),
    ...(policy.reasoningMode === 'explicit' ? { reasoningEffort: policy.reasoningEffort!.trim() } : {}),
  }
  return { ok: true, ops: [{ op: 'set', path: ['temporaryMember'], value }] }
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
