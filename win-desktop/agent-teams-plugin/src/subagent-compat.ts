/** Captain-only compatibility for the official scope-local subagent tool. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { ToolArgsError, validateJsonSchemaValue, type ToolDispatchExecution } from '@deepseek-ai/dsh-tools'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { durableSessionId } from './agent-identity.ts'
import { agentTeamsSubagentGateway } from './subagent-gateway.ts'
import { resolveMemberLlmSelection, validateMemberLlmSelections } from './members.ts'
import { findTeamByParticipant, readTeam, withTeamLock } from './state.ts'
import { TERMINAL_TASK_STATUSES, type TeamState } from './types.ts'
import type { AgentTeamsSettingsRuntime } from './settings.ts'

interface NativeRequest {
  description: string
  prompt: string
  run_in_background?: boolean
  provider?: string
  model?: string
  reasoning_effort?: string
}

export type SubagentCompatibility = (exec: ToolDispatchExecution) => Promise<JsonValue>

/** Call the existing tools through their complete validation and policy pipeline. */
async function invoke(ctx: Context, exec: ToolDispatchExecution, name: string, args: Record<string, unknown>): Promise<Record<string, JsonValue>> {
  exec.signal.throwIfAborted()
  const result = await ctx.tools.execute({
    callId: ToolCallId(`${exec.callId}:agent-teams:${name}:${randomBytes(4).toString('hex')}`),
    rootCallId: exec.rootCallId,
    parent: exec.token,
    name,
    arguments: args,
    agent: exec.agent,
    signal: exec.signal,
  })
  if (result.isError) throw new Error(result.error.message)
  return result.value as Record<string, JsonValue>
}

function assertRunning(team: TeamState): void {
  if (team.phase === 'staged') throw new Error('Team plan is staged; wait for user approval before delegating with subagent')
  if (team.halted === true) throw new Error('Team is halted; use agent_teams_resume with an explicit reason before delegating with subagent')
}

/** Foreground means a completed durable task, never merely successful admission. */
async function waitForTask(ctx: Context, captain: Agent, root: string, teamId: string, taskId: string, memberId: string, signal: AbortSignal): Promise<JsonValue> {
  while (true) {
    signal.throwIfAborted()
    const team = await readTeam(root, teamId)
    if (team === undefined || team.captainSessionId !== durableSessionId(captain)) throw new Error('Team was removed while waiting for subagent')
    assertRunning(team)
    const task = team.tasks.find(candidate => candidate.id === taskId)
    const member = team.members.find(candidate => candidate.id === memberId)
    if (task === undefined || member === undefined || member.status === 'removed') throw new Error('Delegated task or member was removed; inspect agent_teams_status')
    if (task.status === 'completed') return { kind: 'foreground', runId: memberId, output: [{ type: 'text', text: task.output ?? '' }] }
    if (task.status === 'failed' || task.status === 'cancelled') throw new Error(`Team task ${taskId} ${task.status}; inspect agent_teams_status for its recorded result`)
    await delay(50, undefined, { signal })
  }
}

/** Only the official desktop continuable contract is adapted; Native is untouched. */
export function createSubagentCompatibility(ctx: Context, config: {
  stateDir: string; maxMembers: number; settings?: AgentTeamsSettingsRuntime
}): SubagentCompatibility {
  return async exec => {
    if (exec.agent === undefined) throw new Error('subagent requires a calling captain')
    const captain = agentTeamsSubagentGateway(ctx).resolveParent(exec.agent)
    const definition = captain.ctx.tools.get('subagent', captain)
    if (definition === undefined) throw new Error('official subagent tool is unavailable')
    const violations = validateJsonSchemaValue(definition.parameters, exec.arguments, '')
    if (violations.length > 0) throw new ToolArgsError(violations)
    const args = exec.arguments as NativeRequest
    const properties = definition.parameters['properties'] as Record<string, unknown> | undefined
    for (const key of ['provider', 'model', 'reasoning_effort'] as const) {
      if (args[key] !== undefined && !Object.hasOwn(properties ?? {}, key)) throw new Error(`subagent model selection is disabled; omit ${key}`)
      if (args[key] !== undefined && args[key]!.trim() === '') throw new Error(`subagent ${key} must not be blank`)
    }
    const backgroundParameter = properties?.['run_in_background'] as { description?: string } | undefined
    const continuableDefault = backgroundParameter?.description?.startsWith('Defaults to true.') === true
    if (args.run_in_background === true && backgroundParameter === undefined) throw new Error('run_in_background is disabled for this subagent tool')
    if (args.run_in_background === true && !continuableDefault) throw new Error('Team compatibility requires the official continuable subagent preset; use agent_teams_* for Team background work')
    if (args.description.trim() === '' || args.prompt.trim() === '') throw new Error('subagent description and prompt must not be blank')
    const provider = args.provider?.trim() || undefined
    const model = args.model?.trim() || undefined
    const effort = args.reasoning_effort?.trim() || undefined
    if ((provider === undefined) !== (model === undefined)) throw new Error('subagent provider and model must be supplied together')
    const route = captain.session.requestHeader()?.config ?? captain.options
    const explicitRoute = provider !== undefined || effort !== undefined
    const temporaryPolicy = config.settings?.get().temporaryMember
    // Host-owned defaults apply even when native model-selection arguments are
    // disabled. Tool-supplied overrides still use the official schema/allowlist.
    const selection = await resolveMemberLlmSelection(ctx, captain, !explicitRoute && temporaryPolicy !== undefined ? temporaryPolicy : {
      provider: effort === undefined ? provider : provider ?? route.provider,
      model: effort === undefined ? model : model ?? route.model,
      reasoningMode: effort === undefined ? 'target-default' : 'explicit',
      reasoningEffort: effort,
    }, exec.signal)
    // The official discovery definition owns the Session's captured allowlist.
    // Checking the exact route through it retains that authority without reading
    // or widening home settings, and happens before any durable Team write.
    if (provider !== undefined || effort !== undefined) {
      await invoke(ctx, exec, 'list_subagent_models', { provider: selection.provider, model: selection.model })
    }
    await validateMemberLlmSelections(ctx, [selection], exec.signal)
    const root = join(captain.session.header.cwd ?? process.cwd(), config.stateDir)
    const captainId = durableSessionId(captain)
    const admission = await withTeamLock(`subagent-compat:${root}:${captainId}`, async () => {
      exec.signal.throwIfAborted()
      let team = await findTeamByParticipant(root, captainId)
      if (team !== undefined && team.captainSessionId !== captainId) throw new Error('Team members cannot delegate through subagent; report to your captain')
      if (team === undefined) {
        const created = await invoke(ctx, exec, 'agent_teams_create', { description: args.description })
        team = await readTeam(root, String(created.team_id))
      }
      if (team === undefined) throw new Error('created Team could not be read')
      assertRunning(team)
      const pinSelection = explicitRoute || temporaryPolicy !== undefined
      // Reuse only our own idle compatibility members of the same role. Existing
      // Profile members retain their individual route, prompt and task ownership.
      let member = team.members.find(candidate => candidate.name.startsWith('subagent-')
        && candidate.role === args.description && candidate.status !== 'removed'
        && !team!.tasks.some(task => task.assignee === candidate.name && !TERMINAL_TASK_STATUSES.includes(task.status))
        && ctx.agents.get(candidate.id as import('@deepseek-ai/dsh-session').SessionId)?.status !== 'running'
        && (!pinSelection || (candidate.provider === selection.provider && candidate.model === selection.model
          && candidate.reasoningMode === selection.reasoningMode && candidate.reasoningEffort === selection.reasoningEffort)))
      if (member === undefined) {
        if (team.members.filter(candidate => candidate.status !== 'removed').length >= config.maxMembers) throw new Error('Team member limit reached; finish or remove an existing member before delegating another subagent')
        const added = await invoke(ctx, exec, 'agent_teams_add_member', {
          name: `subagent-${randomBytes(6).toString('hex')}`,
          role: args.description,
          ...(pinSelection ? {
            provider: selection.provider, model: selection.model, reasoning_mode: selection.reasoningMode,
            ...(selection.reasoningMode !== 'explicit' ? {} : { reasoning_effort: selection.reasoningEffort }),
          } : {}),
        })
        team = await readTeam(root, team.id)
        member = team?.members.find(candidate => candidate.id === added.member_id)
      }
      if (team === undefined || member === undefined || member.id === '') throw new Error('Team member startup did not produce a durable child session')
      const created = await invoke(ctx, exec, 'agent_teams_create_task', {
        subject: args.description, description: args.prompt, assignee: member.name,
      })
      const persisted = await readTeam(root, team.id)
      const task = persisted?.tasks.find(candidate => candidate.id === created.task_id)
      if (task === undefined || task.assignee !== member.name || task.status === 'failed' || task.status === 'cancelled') throw new Error('Team task admission failed; inspect agent_teams_status before retrying')
      return { teamId: team.id, taskId: task.id, memberId: member.id }
    })
    if (args.run_in_background === true || (args.run_in_background === undefined && continuableDefault)) return { kind: 'continuable', subagentId: admission.memberId }
    return waitForTask(ctx, captain, root, admission.teamId, admission.taskId, admission.memberId, exec.signal)
  }
}
