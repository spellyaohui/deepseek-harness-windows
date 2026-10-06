/**
 * Git working-tree snapshots used to audit an implementation attempt.
 *
 * A member's own `changedPaths` report cannot prove completeness: shell
 * commands (npm install, scripted renames) change files without any file
 * tool call, and a rejected report can simply be retried with the offending
 * paths removed. The snapshot taken when the attempt enters `in_progress` and
 * the one taken at completion yield the files that actually changed in
 * between. Non-Git workspaces and Git failures return `undefined`, so the
 * audit is skipped rather than blocking work it cannot observe.
 * @module dsh-agent-teams/workspace-audit
 */

import { execFile } from 'node:child_process'

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
    }, (error, stdout) => error ? reject(error) : resolve(stdout))
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

export async function snapshotWorkspace(workspace: string): Promise<WorkspaceSnapshot | undefined> {
  try {
    const top = (await git(workspace, ['rev-parse', '--show-toplevel'])).trim()
    const prefix = (await git(workspace, ['rev-parse', '--show-prefix'])).trim()
    const head = (await git(top, ['rev-parse', '--verify', '-q', 'HEAD']).catch(() => '')).trim()
    const entries = porcelainPaths(await git(top, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']))
      .filter(entry => entry.path.startsWith(prefix) && !entry.path.endsWith('/'))
    const present = entries.filter(entry => !entry.deleted)
    const hashes = present.length === 0
      ? []
      : (await git(top, ['hash-object', '--stdin-paths'], `${present.map(entry => entry.path).join('\n')}\n`)).trim().split(/\r?\n/u)
    const files = new Map<string, string>()
    present.forEach((entry, index) => files.set(entry.path.slice(prefix.length), hashes[index] ?? ''))
    for (const entry of entries.filter(item => item.deleted)) files.set(entry.path.slice(prefix.length), DELETED)
    return { head, files }
  } catch {
    return undefined
  }
}

/** Files whose content differs between two snapshots, including commits made in between. */
export async function changedSince(workspace: string, base: WorkspaceSnapshot): Promise<string[] | undefined> {
  const current = await snapshotWorkspace(workspace)
  if (current === undefined) return undefined
  const changed = new Set<string>()
  for (const [path, hash] of current.files) if (base.files.get(path) !== hash) changed.add(path)
  // A file dirty at the start and clean now was reverted or committed: both changed it.
  for (const path of base.files.keys()) if (!current.files.has(path)) changed.add(path)
  if (base.head !== '' && current.head !== '' && base.head !== current.head) {
    try {
      const committed = await git(workspace, ['diff', '--name-only', '--relative', '-z', base.head, current.head])
      for (const path of committed.split('\0')) if (path !== '') changed.add(path)
    } catch {
      return undefined
    }
  }
  return [...changed].sort()
}
