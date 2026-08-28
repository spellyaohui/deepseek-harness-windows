/** Host-boundary parsing for untrusted staged-plan browser mutations. */

import type { StagedPlanMutation } from './tools.ts'
import { TASK_KINDS, type TaskKind } from './types.ts'

function requiredPayloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key]
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${key} is required`)
  return value.trim()
}

function optionalPayloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null | undefined {
  if (!(key in payload)) return undefined
  const value = payload[key]
  if (value === null || typeof value === 'string') return value
  throw new Error(`${key} must be a string or null`)
}

function optionalPayloadStringList(
  payload: Record<string, unknown>,
  key: string,
): string[] | null | undefined {
  if (!(key in payload)) return undefined
  const value = payload[key]
  if (value === null) return null
  if (!Array.isArray(value)) throw new Error(`${key} must be an array or null`)
  if (!value.every((item): item is string => typeof item === 'string')) {
    throw new Error(`${key} must contain only strings`)
  }
  return value
}

function optionalPayloadTaskKind(payload: Record<string, unknown>): TaskKind | undefined {
  if (!('kind' in payload)) return undefined
  const value = payload['kind']
  if (typeof value !== 'string' || !(TASK_KINDS as readonly string[]).includes(value)) {
    throw new Error(`kind must be one of ${TASK_KINDS.join(', ')}`)
  }
  return value as TaskKind
}

function optionalPayloadRound(payload: Record<string, unknown>): number | null | undefined {
  if (!('round' in payload)) return undefined
  const value = payload['round']
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error('round must be a positive integer or null')
  }
  return value
}

type StagedTaskContract = Omit<
Extract<StagedPlanMutation, { action: 'update_task' }>,
'action' | 'taskId' | 'subject'
>

function taskContractFromPayload(payload: Record<string, unknown>): StagedTaskContract {
  const dependencies = optionalPayloadStringList(payload, 'dependencies')
  const kind = optionalPayloadTaskKind(payload)
  const round = optionalPayloadRound(payload)
  const description = optionalPayloadString(payload, 'description')
  const assignee = optionalPayloadString(payload, 'assignee')
  const objective = optionalPayloadString(payload, 'objective')
  const inScope = optionalPayloadStringList(payload, 'inScope')
  const outOfScope = optionalPayloadStringList(payload, 'outOfScope')
  const acceptance = optionalPayloadStringList(payload, 'acceptance')
  const verify = optionalPayloadStringList(payload, 'verify')
  const deliverables = optionalPayloadStringList(payload, 'deliverables')
  const nonGoals = optionalPayloadStringList(payload, 'nonGoals')
  const reviewedTaskId = optionalPayloadString(payload, 'reviewedTaskId')
  const sourceTaskId = optionalPayloadString(payload, 'sourceTaskId')
  const sourceFindingIds = optionalPayloadStringList(payload, 'sourceFindingIds')
  const coverageOf = optionalPayloadStringList(payload, 'coverageOf')
  return {
    ...(dependencies === undefined || dependencies === null ? {} : { dependencies }),
    ...(kind === undefined ? {} : { kind }),
    ...(round === undefined ? {} : { round }),
    ...(description === undefined ? {} : { description }),
    ...(assignee === undefined ? {} : { assignee }),
    ...(objective === undefined ? {} : { objective }),
    ...(inScope === undefined ? {} : { inScope }),
    ...(outOfScope === undefined ? {} : { outOfScope }),
    ...(acceptance === undefined ? {} : { acceptance }),
    ...(verify === undefined ? {} : { verify }),
    ...(deliverables === undefined ? {} : { deliverables }),
    ...(nonGoals === undefined ? {} : { nonGoals }),
    ...(reviewedTaskId === undefined ? {} : { reviewedTaskId }),
    ...(sourceTaskId === undefined ? {} : { sourceTaskId }),
    ...(sourceFindingIds === undefined ? {} : { sourceFindingIds }),
    ...(coverageOf === undefined ? {} : { coverageOf }),
  }
}

/** Parse one untrusted staging editor payload into the runtime mutation contract. */
export function stagedPlanMutationFromPayload(payload: Record<string, unknown>): StagedPlanMutation {
  const action = requiredPayloadString(payload, 'action')
  if (action === 'update_member') {
    const reasoningMode = payload['reasoningMode']
    if (reasoningMode !== 'target-default' && reasoningMode !== 'route-aware' && reasoningMode !== 'explicit') {
      throw new Error('reasoningMode must be target-default, route-aware, or explicit')
    }
    const effort = optionalPayloadString(payload, 'reasoningEffort')
    if (reasoningMode === 'explicit' && (effort === undefined || effort === null || effort.trim() === '')) {
      throw new Error('explicit reasoningMode requires reasoningEffort')
    }
    const role = optionalPayloadString(payload, 'role')
    const executionPrompt = optionalPayloadString(payload, 'executionPrompt')
    return {
      action,
      memberName: requiredPayloadString(payload, 'memberName'),
      provider: requiredPayloadString(payload, 'provider'),
      model: requiredPayloadString(payload, 'model'),
      reasoningMode,
      ...(reasoningMode === 'explicit' ? { reasoningEffort: effort } : {}),
      ...(role === undefined ? {} : { role }),
      ...(executionPrompt === undefined ? {} : { executionPrompt }),
    }
  }
  if (action === 'update_task') {
    return {
      action,
      taskId: requiredPayloadString(payload, 'taskId'),
      subject: requiredPayloadString(payload, 'subject'),
      ...taskContractFromPayload(payload),
    }
  }
  if (action === 'add_task') {
    return {
      action,
      subject: requiredPayloadString(payload, 'subject'),
      ...taskContractFromPayload(payload),
    }
  }
  if (action === 'remove_task') {
    return { action, taskId: requiredPayloadString(payload, 'taskId') }
  }
  if (action === 'remove_member') {
    return { action, memberName: requiredPayloadString(payload, 'memberName') }
  }
  throw new Error(`unknown plan action "${action}"`)
}
