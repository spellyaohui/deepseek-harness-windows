/** Browser-side construction of the complete staged-task Host mutation. */

import type { TaskKind } from '../types.ts'

export interface StagedTaskMutationDraft {
  readonly sessionId: string
  readonly teamId: string
  readonly taskId: string
  readonly subject: string
  readonly description: string
  readonly assignee: string
  readonly dependencies: string
  readonly kind: TaskKind
  readonly round: string
  readonly objective: string
  readonly inScope: string
  readonly outOfScope: string
  readonly acceptance: string
  readonly verify: string
  readonly deliverables: string
  readonly nonGoals: string
  readonly reviewedTaskId: string
  readonly sourceTaskId: string
  readonly sourceFindingIds: string
  readonly coverageOf: string
}

function parseLineList(value: string): string[] {
  return [...new Set(value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))]
}

/** Build the exact payload submitted by the staged task editor. */
export function buildStagedTaskMutationPayload(draft: StagedTaskMutationDraft): Record<string, unknown> {
  return {
    sessionId: draft.sessionId,
    teamId: draft.teamId,
    action: 'update_task',
    taskId: draft.taskId,
    subject: draft.subject,
    description: draft.description,
    assignee: draft.assignee,
    dependencies: draft.dependencies.split(',').map((item) => item.trim()).filter(Boolean),
    kind: draft.kind,
    round: draft.round.trim() === '' ? null : Number.parseInt(draft.round, 10),
    objective: draft.objective,
    inScope: parseLineList(draft.inScope),
    outOfScope: parseLineList(draft.outOfScope),
    acceptance: parseLineList(draft.acceptance),
    verify: parseLineList(draft.verify),
    deliverables: parseLineList(draft.deliverables),
    nonGoals: parseLineList(draft.nonGoals),
    reviewedTaskId: draft.reviewedTaskId,
    sourceTaskId: draft.sourceTaskId,
    sourceFindingIds: parseLineList(draft.sourceFindingIds),
    coverageOf: parseLineList(draft.coverageOf),
  }
}
