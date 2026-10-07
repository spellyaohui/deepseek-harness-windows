/** Browser-safe versioned attempt audit data. No storage or runtime owner. */
import type { TeamTask } from './types.ts'

export function contractIdentity(task: TeamTask): string {
  return JSON.stringify([task.kind, task.objective, task.inScope, task.outOfScope, task.acceptance,
    task.verify, task.deliverables, task.nonGoals, task.reviewedTaskId, task.revisions?.length ?? 0])
}

export interface ReviewBasis {
  schemaVersion: 1
  reviewedTaskId: string
  targetAttemptId: string
  targetContract: string
  codeVersion: string
  reviewer: string
}

export function isReviewBasis(value: unknown): value is ReviewBasis {
  if (typeof value !== 'object' || value === null) return false
  const row = value as ReviewBasis
  return row.schemaVersion === 1 && [row.reviewedTaskId, row.targetAttemptId, row.targetContract, row.codeVersion, row.reviewer]
    .every(item => typeof item === 'string' && item !== '')
}
export interface SerializedWorkspaceSnapshot {
  head: string
  files: [string, string][]
}

export interface AttemptWorkspaceAudit {
  schemaVersion: 1
  workspace: string
  teamId: string
  taskId: string
  attemptId: string
  startedAt: number
  status: 'observed' | 'not-git'
  baseline?: SerializedWorkspaceSnapshot
  completed?: SerializedWorkspaceSnapshot
  operations?: ObservedWorkspaceOperation[]
}

export interface ObservedWorkspaceOperation {
  callId: string
  actor: string
  at: number
  contractHash: string
  paths: [string, string][]
}

export interface ExecutorCommandEvidence {
  schemaVersion: 1
  source: 'executor'
  callId: string
  command: string
  exitCode: number
  attemptId: string
  contractHash: string
  codeVersion: string
  at: number
}
export interface CompletionReportBasis {
  schemaVersion: 1
  source: 'member-report'
  attemptId: string
  contractHash: string
  codeVersion: string
  at: number
}
export function isCompletionReportBasis(value: unknown): value is CompletionReportBasis {
  if (typeof value !== 'object' || value === null) return false
  const row = value as CompletionReportBasis
  return row.schemaVersion === 1 && row.source === 'member-report'
    && [row.attemptId, row.contractHash, row.codeVersion].every(item => typeof item === 'string' && item !== '')
    && Number.isSafeInteger(row.at) && row.at > 0
}

export function isExecutorCommandEvidence(value: unknown): value is ExecutorCommandEvidence {
  if (typeof value !== 'object' || value === null) return false
  const row = value as ExecutorCommandEvidence
  return row.schemaVersion === 1 && row.source === 'executor'
    && [row.callId, row.command, row.attemptId, row.contractHash, row.codeVersion].every(item => typeof item === 'string' && item !== '')
    && Number.isSafeInteger(row.exitCode) && Number.isSafeInteger(row.at) && row.at > 0
}
