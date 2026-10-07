/** Observations at the official Tools dispatch boundary, committed by Team state. */
import type { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { TeamTask } from './types.ts'
import { durableSessionId } from './agent-identity.ts'
import { findTeamByParticipant, readTeam, withTeamLock, writeTeam } from './state.ts'
import { classifyChangedPath } from './quality-gates.ts'
import { changedSince, observeWorkspace, type WorkspaceSnapshot } from './workspace-audit.ts'
import type { SerializedWorkspaceSnapshot } from './audit-contract.ts'

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function taskContractHash(task: TeamTask): string {
  return digest([task.kind, task.objective, task.inScope, task.outOfScope, task.acceptance,
    task.verify, task.deliverables, task.nonGoals, task.reviewedTaskId, task.revisions?.length ?? 0])
}
export function workspaceCodeVersion(snapshot: WorkspaceSnapshot | SerializedWorkspaceSnapshot): string {
  const files = snapshot.files instanceof Map ? [...snapshot.files] : snapshot.files
  return digest([snapshot.head, [...files].sort(([a], [b]) => a.localeCompare(b))])
}
export function currentExecutorEvidence(task: TeamTask, codeVersion: string) {
  return (task.executorEvidence ?? []).filter(row => row.attemptId === task.attemptId
    && row.contractHash === taskContractHash(task) && row.codeVersion === codeVersion)
}
const fingerprint = (snapshot: SerializedWorkspaceSnapshot, path: string): string =>
  new Map(snapshot.files).get(path) ?? `clean:${snapshot.head}`

/** Completed and running attempts use the same exact observation contract. */
export function attributedConcurrentPaths(task: TeamTask, others: readonly TeamTask[], current: SerializedWorkspaceSnapshot): string[] {
  const paths = new Set<string>()
  for (const other of others) {
    if (other.id === task.id || !other.attemptId || !['implementation', 'repair'].includes(other.kind)) continue
    const audit = other.workspaceAudit
    if (!audit || audit.attemptId !== other.attemptId || audit.workspace !== task.workspaceAudit?.workspace
      || audit.teamId !== task.workspaceAudit?.teamId) continue
    for (const operation of audit.operations ?? []) {
      if (operation.at < (task.workspaceAudit?.startedAt ?? Infinity) || operation.contractHash !== taskContractHash(other)) continue
      for (const [path, hash] of operation.paths) {
        if (classifyChangedPath(path, other.inScope, other.outOfScope) === 'in_scope'
          && classifyChangedPath(path, task.inScope, task.outOfScope) === 'undeclared'
          && fingerprint(current, path) === hash) paths.add(path)
      }
    }
  }
  return [...paths]
}

const INSTALL_KEY = Symbol.for('dsh-agent-teams.attempt-evidence')
/** Serialize observed bodies using the existing queue; no new state store. */
export function installAttemptEvidence(ctx: Context, stateDir: string): void {
  const owner = ctx as Context & { [INSTALL_KEY]?: () => void }
  owner[INSTALL_KEY]?.()
  const dispose = ctx.on('tools/execute', async (exec, next) => {
    if (!exec.agent || exec.name.startsWith('agent_teams_') || exec.name === 'subagent' || exec.name === 'run_code') return next()
    const actor = durableSessionId(exec.agent)
    const workspace = exec.agent.session.header.cwd ?? process.cwd()
    const root = join(workspace, stateDir)
    const team = await findTeamByParticipant(root, actor)
    if (!team || team.phase !== 'running') return next()
    const name = team.captainSessionId === actor ? 'captain' : team.members.find(member => member.id === actor && member.status !== 'removed')?.name
    const task = team.tasks.find(item => item.assignee === name && item.status === 'in_progress' && item.kind !== 'work')
    if (!task?.attemptId) return next()
    const attemptId = task.attemptId
    const contractHash = taskContractHash(task)
    return withTeamLock(`audit-workspace:${workspace}`, async () => {
      const before = await observeWorkspace(workspace)
      if (before.status === 'failed') throw new Error(`cannot observe task execution: ${before.error}`)
      const result = await next()
      const after = await observeWorkspace(workspace)
      if (after.status === 'failed') throw new Error(`task execution occurred but Git observation failed: ${after.error}; do not claim completion`)
      if (before.status !== after.status) throw new Error('Git applicability changed during tool execution; retry task with a fresh attempt')
      const observed = after.status === 'observed' ? {
        head: after.snapshot.head,
        files: new Map([...after.snapshot.files].filter(([path]) => !path.startsWith(`${stateDir}/`))),
      } : undefined
      const changed = before.status === 'observed' && observed
        ? (await changedSince(workspace, before.snapshot, observed))!.filter(path => !path.startsWith(`${stateDir}/`)) : []
      await withTeamLock(`team:${root}:${team.id}`, async () => {
        const fresh = await readTeam(root, team.id)
        const current = fresh?.tasks.find(item => item.id === task.id)
        if (!fresh || !current || current.attemptId !== attemptId || current.status !== 'in_progress'
          || taskContractHash(current) !== contractHash) throw new Error('execution observation belongs to a retired attempt or changed contract')
        let changedRecord = false
        if (changed.length && current.workspaceAudit?.status === 'observed' && observed) {
          const operations = current.workspaceAudit.operations ?? []
          if (operations.length >= 256) throw new Error('attempt execution audit is full; report to captain instead of discarding evidence')
          current.workspaceAudit.operations = [...operations, { callId: exec.callId, actor, at: Date.now(), contractHash,
            paths: changed.map(path => [path, observed.files.get(path) ?? `clean:${observed.head}`]) }]
          changedRecord = true
        }
        const args = exec.arguments as { command?: unknown }
        const value = !result.isError && typeof result.value === 'object' && result.value !== null && !Array.isArray(result.value)
          ? result.value as Record<string, unknown> : undefined
        // Only the actual foreground executor DTO yields a trusted exit code.
        // Promoted jobs, MCP prose and member commandsRun remain self-reports.
        if (exec.name === 'bash' && typeof args?.command === 'string' && value?.kind === 'foreground'
          && Number.isSafeInteger(value.exitCode) && value.timedOut === false && value.aborted === false) {
          const evidence = current.executorEvidence ?? []
          if (evidence.length >= 256) throw new Error('attempt command evidence is full; report to captain')
          current.executorEvidence = [...evidence, { schemaVersion: 1, source: 'executor', callId: exec.callId,
            command: args.command, exitCode: value.exitCode as number, attemptId, contractHash,
            codeVersion: observed ? workspaceCodeVersion(observed) : 'not-git', at: Date.now() }]
          changedRecord = true
        }
        if (changedRecord) await writeTeam(root, fresh)
      })
      return result
    })
  })
  owner[INSTALL_KEY] = dispose
  const effect = (ctx as unknown as { effect?: (setup: () => () => void) => unknown }).effect
  effect?.call(ctx, () => () => { dispose(); if (owner[INSTALL_KEY] === dispose) delete owner[INSTALL_KEY] })
}
