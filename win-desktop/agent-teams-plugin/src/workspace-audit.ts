/**
 * Git working-tree snapshots used to audit an implementation attempt.
 *
 * A member's own `changedPaths` report cannot prove completeness: shell
 * commands (npm install, scripted renames) change files without any file
 * tool call, and a rejected report can simply be retried with the offending
 * paths removed. The snapshot taken when the attempt enters `in_progress` and
 * the one taken at completion yield the files that actually changed in
 * between. Non-Git applicability is explicit; missing or failed Git evidence
 * fails closed. The baseline belongs to the durable task attempt, not a Map.
 * @module dsh-agent-teams/workspace-audit
 */

import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import type { TeamTask } from './types.ts'
import type { AttemptWorkspaceAudit, SerializedWorkspaceSnapshot } from './audit-contract.ts'
export type { AttemptWorkspaceAudit, SerializedWorkspaceSnapshot } from './audit-contract.ts'

/** Workspace-relative POSIX path → blob hash (or a deletion marker) for every dirty file. */
export interface WorkspaceSnapshot {
  readonly head: string
  readonly files: ReadonlyMap<string, string>
}

const GIT_TIMEOUT_MS = 15_000
const GIT_MAX_BUFFER = 64 * 1024 * 1024
const DELETED = 'deleted'

function git(cwd: string, args: readonly string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile('git', ['-c', 'core.quotepath=off', ...args], {
      cwd,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER,
      windowsHide: true,
    }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stderr })) : resolve(stdout))
    if (input !== undefined) child.stdin?.end(input)
  })
}

/** Paths of `git status --porcelain=v1 -z` entries, relative to the repository root. */
function porcelainPaths(output: string): { path: string; deleted: boolean }[] {
  const fields = output.split('\0')
  const entries: { path: string; deleted: boolean }[] = []
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]!
    if (field.length < 4) continue
    const status = field.slice(0, 2)
    entries.push({ path: field.slice(3), deleted: status.includes('D') })
    // Rename/copy records carry the original path as the next field.
    if (status.includes('R') || status.includes('C')) {
      const original = fields[++index]
      if (original !== undefined && original !== '') entries.push({ path: original, deleted: true })
    }
  }
  return entries
}

export type WorkspaceObservation =
  | { status: 'observed'; snapshot: WorkspaceSnapshot }
  | { status: 'not-git' }
  | { status: 'failed'; error: string }

export async function observeWorkspace(workspace: string, runGit: typeof git = git): Promise<WorkspaceObservation> {
  try {
    const top = (await runGit(workspace, ['rev-parse', '--show-toplevel'])).trim()
    const prefix = (await runGit(workspace, ['rev-parse', '--show-prefix'])).trim()
    const head = (await runGit(top, ['rev-parse', '--verify', '-q', 'HEAD']).catch((error: unknown) => {
      if ((error as { code?: unknown; stderr?: unknown }).code === 1 && !(error as { stderr?: unknown }).stderr) return ''
      throw error
    })).trim()
    const entries = porcelainPaths(await runGit(top, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']))
      .filter(entry => entry.path.startsWith(prefix) && !entry.path.endsWith('/'))
    if (entries.some(entry => /[\r\n]/u.test(entry.path))) throw new Error('Git audit cannot hash newline-containing paths safely')
    const present = entries.filter(entry => !entry.deleted)
    const hashes = present.length === 0
      ? []
      : (await runGit(top, ['hash-object', '--stdin-paths'], `${present.map(entry => entry.path).join('\n')}\n`)).trim().split(/\r?\n/u)
    if (hashes.length !== present.length || hashes.some(hash => !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(hash))) throw new Error('Git returned incomplete file hashes')
    const files = new Map<string, string>()
    present.forEach((entry, index) => files.set(entry.path.slice(prefix.length), hashes[index] ?? ''))
    for (const entry of entries.filter(item => item.deleted)) files.set(entry.path.slice(prefix.length), DELETED)
    return { status: 'observed', snapshot: { head, files } }
  } catch (error: unknown) {
    const detail = error as { code?: unknown; stderr?: unknown; message?: unknown }
    if (detail.code === 128 && typeof detail.stderr === 'string' && /fatal: not a git repository/u.test(detail.stderr)) return { status: 'not-git' }
    return { status: 'failed', error: String(detail.message ?? error) }
  }
}

export async function snapshotWorkspace(workspace: string): Promise<WorkspaceSnapshot | undefined> {
  const result = await observeWorkspace(workspace)
  if (result.status === 'failed') throw new Error(`Git audit failed: ${result.error}`)
  return result.status === 'observed' ? result.snapshot : undefined
}

const serialize = (snapshot: WorkspaceSnapshot): SerializedWorkspaceSnapshot => ({ head: snapshot.head, files: [...snapshot.files] })
const deserialize = (snapshot: SerializedWorkspaceSnapshot): WorkspaceSnapshot => ({ head: snapshot.head, files: new Map(snapshot.files) })
const identity = async (workspace: string): Promise<string> => {
  const path = await realpath(workspace)
  return process.platform === 'win32' ? path.toLowerCase() : path
}

export function isAttemptWorkspaceAudit(value: unknown): value is AttemptWorkspaceAudit {
  if (typeof value !== 'object' || value === null) return false
  const row = value as AttemptWorkspaceAudit
  const validSnapshot = (snapshot: SerializedWorkspaceSnapshot | undefined): boolean => snapshot !== undefined
    && typeof snapshot.head === 'string' && Array.isArray(snapshot.files)
    && snapshot.files.every(entry => Array.isArray(entry) && entry.length === 2 && entry.every(item => typeof item === 'string' && item !== ''))
    && new Set(snapshot.files.map(entry => entry[0])).size === snapshot.files.length
  return row.schemaVersion === 1 && [row.workspace, row.teamId, row.taskId, row.attemptId].every(item => typeof item === 'string' && item !== '')
    && Number.isSafeInteger(row.startedAt) && row.startedAt > 0
    && (row.operations === undefined || (Array.isArray(row.operations) && row.operations.length <= 256 && row.operations.every(operation =>
      typeof operation.callId === 'string' && operation.callId !== '' && typeof operation.actor === 'string' && operation.actor !== ''
      && typeof operation.contractHash === 'string' && operation.contractHash !== '' && Number.isSafeInteger(operation.at)
      && Array.isArray(operation.paths) && operation.paths.every(entry => Array.isArray(entry) && entry.length === 2 && entry.every(item => typeof item === 'string' && item !== '')))))
    && (row.status === 'not-git' ? row.baseline === undefined && row.completed === undefined
      : row.status === 'observed' && validSnapshot(row.baseline) && (row.completed === undefined || validSnapshot(row.completed)))
}

export async function captureAttemptAudit(workspace: string, teamId: string, task: Pick<TeamTask, 'id' | 'attemptId'>, ignoredPrefix = ''): Promise<AttemptWorkspaceAudit> {
  if (!task.attemptId) throw new Error('attempt identity is required before capturing a baseline')
  const observed = await observeWorkspace(workspace)
  if (observed.status === 'failed') throw new Error(`Git audit failed before start: ${observed.error}`)
  if (observed.status === 'observed' && ignoredPrefix) {
    observed.snapshot = { ...observed.snapshot, files: new Map([...observed.snapshot.files].filter(([path]) => !path.startsWith(ignoredPrefix))) }
  }
  return { schemaVersion: 1, workspace: await identity(workspace), teamId, taskId: task.id, attemptId: task.attemptId,
    startedAt: Date.now(), status: observed.status,
    ...observed.status === 'observed' ? { baseline: serialize(observed.snapshot) } : {} }
}

export async function observeAttemptChanges(workspace: string, teamId: string, task: Pick<TeamTask, 'id' | 'attemptId' | 'workspaceAudit'>, ignoredPrefix = ''): Promise<
  { status: 'not-git'; actual: undefined } | { status: 'observed'; actual: string[]; current: SerializedWorkspaceSnapshot }
> {
  const audit = task.workspaceAudit
  if (audit === undefined) throw new Error('attempt audit baseline is missing; retry with a fresh attempt instead of inventing prior history')
  if (!isAttemptWorkspaceAudit(audit) || audit.teamId !== teamId || audit.taskId !== task.id
    || audit.attemptId !== task.attemptId || audit.workspace !== await identity(workspace)) throw new Error('attempt audit identity does not match workspace/team/task/attempt')
  const observation = await observeWorkspace(workspace)
  if (observation.status === 'failed') throw new Error(`Git audit failed at completion: ${observation.error}`)
  if (audit.status === 'not-git' && observation.status === 'not-git') return { status: 'not-git', actual: undefined }
  if (audit.status !== 'observed' || observation.status !== 'observed') throw new Error('workspace Git applicability changed during attempt; start a fresh attempt')
  const actual = await changedSince(workspace, deserialize(audit.baseline!), observation.snapshot)
  return { status: 'observed', actual: actual!.filter(path => !ignoredPrefix || !path.startsWith(ignoredPrefix)), current: serialize(observation.snapshot) }
}

/** Files whose content differs between two snapshots, including commits made in between. */
export async function changedSince(workspace: string, base: WorkspaceSnapshot, observed?: WorkspaceSnapshot): Promise<string[] | undefined> {
  const current = observed ?? await snapshotWorkspace(workspace)
  if (current === undefined) return undefined
  const changed = new Set<string>()
  for (const [path, hash] of current.files) if (base.files.get(path) !== hash) changed.add(path)
  // A file dirty at the start and clean now was reverted or committed: both changed it.
  for (const path of base.files.keys()) if (!current.files.has(path)) changed.add(path)
  if (base.head !== '' && current.head !== '' && base.head !== current.head) {
    try {
      const committed = await git(workspace, ['diff', '--name-only', '--relative', '-z', base.head, current.head])
      for (const path of committed.split('\0')) if (path !== '') changed.add(path)
    } catch (error: unknown) {
      throw new Error(`Git audit failed comparing revisions: ${String(error)}`)
    }
  }
  return [...changed].sort()
}
