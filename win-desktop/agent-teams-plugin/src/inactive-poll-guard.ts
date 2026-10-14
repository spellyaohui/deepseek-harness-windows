import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { join } from 'node:path'
import { durableSessionId } from './agent-identity.ts'
import { agentTeamsSource, sessionOwnEvents } from './harness-compat.ts'
import { leadIdentityOfAsync } from './lineage.ts'
import { liveDelegationPolicy } from './routing-policy.ts'
import { resolveTeamProfile } from './profiles.ts'
import { findTeamByCaptain } from './state.ts'
import type { ToolsConfig } from './tools.ts'

export const PROFILE_RECOVERY_GUIDANCE = '请在 AgentTeams 设置中选择并保存默认团队 Profile，或由用户发送 /agent-teams --profile <已配置的名称> <目标>。模型自己填写 profile/plan 不构成用户授权；TEAM 模式不能改走未授权的 subagent。'
/** The renderer has no caller context: diagnose the saved default, never a user command. */
export function renderInactiveTeamStatus(config: Pick<ToolsConfig, 'settings' | 'profiles' | 'maxMembers'>): string {
  const name = config.settings.get().defaultProfile
  let guidance = `未保存默认团队 Profile。${PROFILE_RECOVERY_GUIDANCE}`
  if (name !== undefined) {
    const label = `已保存默认团队 Profile ${JSON.stringify(name)}`
    try {
      const profile = resolveTeamProfile(config.profiles, name, config.maxMembers)
      guidance = profile.taskPlanning === 'captain'
        ? `${label}：队长动态规划。调用 agent_teams_create 后，按当前目标用 agent_teams_create_task 建立任务及依赖并分配给冻结角色；任务就绪后成员才启动，空团队不等于已经派工。`
        : profile.tasks.length === 0
          ? `${label}：固定任务模板，0 个任务，不能创建该团队。请在 AgentTeams 设置中添加真实模板任务，或切换“队长动态规划”并保存；保留原成员、模型和思考规则，不要恢复默认或自行补造任务。`
          : `${label}：固定任务模板，${profile.tasks.length} 个任务。调用 agent_teams_create，由调度器执行就绪的模板任务。`
    } catch {
      guidance = `${label}：不存在或配置无效。请在 AgentTeams 设置中核对该 Profile 及成员/任务配置并保存；不要猜测其它 Profile。`
    }
  }
  return `No active Team for this session. 当前没有可等待的团队，请勿继续空查。${guidance} 以上仅说明已保存默认 Profile；本轮用户 /agent-teams --profile 明确选择优先，若已有该选择请按它创建。模型参数/历史文本不能授权临时 subagent。TEAM 队长同一轮连续 3 次真实空查后将暂停，等待新输入或有效绑定。`
}

type GuardConfig = Pick<ToolsConfig, 'stateDir' | 'settings' | 'profiles'>
type Streak = { key: string; inactive: Set<number> }

/** Model-only turn pacing; no Team/config write and no admission changes. */
export function installInactiveTeamPollingGuard(ctx: Context, config: GuardConfig): void {
  const streaks = new WeakMap<Agent, Streak>()
  const paused = new WeakSet<Agent>()
  ctx.on('agent/status', ({ agent, status }) => {
    if (status !== 'idle' || !paused.delete(agent)) return
    // A rejected step parks queued followups; wake only genuine waiting input.
    if (![...agent.inbox.nextTurn, ...agent.inbox.nextStep].some(message => message.source.kind === 'user')) return
    agent.steer(createUserMessage({
      content: [{ type: 'text', text: 'AgentTeams 已暂停上一轮空查，请处理队列中的用户新输入；本通知不是用户授权。' }],
      source: agentTeamsSource({ kind: 'agent-teams' }),
    }))
  })
  const context = (agent: Agent) => {
    const settings = config.settings.get()
    const { delegationDepth, origin } = agent.session.header
    if ((delegationDepth ?? 0) !== 0 || origin === 'subagent'
      || liveDelegationPolicy(agent, settings.delegationMode) !== 'teams-v1') return undefined
    const events = sessionOwnEvents(agent.session)
    const newest = [...events].reverse()
    const start = newest.find(event => event.type === 'turn/start')
    if (start?.seq === undefined || events.some(event => event.type === 'turn/end' && event.seq !== undefined && event.seq > start.seq!)) return undefined
    const directUser = newest.find(event => event.type === 'user/message' && event.seq !== undefined && event.seq > start.seq! && event.data?.source?.kind === 'user')
    const calls = events.filter((event): event is Extract<(typeof events)[number], { type: 'tool/call' }> => event.type === 'tool/call' && event.seq !== undefined && event.seq > start.seq!).slice(-3)
    return {
      key: JSON.stringify([start.seq, directUser?.seq, settings.defaultProfile, Object.keys(config.profiles).sort()]),
      calls,
    }
  }

  ctx.on('tools/result', (exec, result) => {
    const agent = exec.agent
    if (!agent || exec.name !== 'agent_teams_status') return
    const current = context(agent)
    if (!current) { streaks.delete(agent); return }
    const call = [...current.calls].reverse().find(event => event.data.callId === exec.callId && event.data.name === exec.name)
    // API/Web probes have no own model call event and never arm the guard.
    if (call?.seq === undefined) return
    const previous = streaks.get(agent)
    const inactive = new Set(previous?.key === current.key ? previous.inactive : [])
    for (const seq of inactive) if (!current.calls.some(event => event.seq === seq)) inactive.delete(seq)
    const value = result.value
    if (!result.isError && value !== null && typeof value === 'object' && !Array.isArray(value) && value['active'] === false) inactive.add(call.seq)
    else inactive.delete(call.seq)
    streaks.set(agent, { key: current.key, inactive })
  })

  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const streak = streaks.get(agent)
    if (!streak) return decision
    const current = context(agent)
    if (!current || current.key !== streak.key || decision.messages.some(message => message.source.kind === 'user')) {
      streaks.delete(agent)
      return decision
    }
    if (current.calls.length !== 3 || !current.calls.every(call => call.data?.name === 'agent_teams_status' && call.seq !== undefined && streak.inactive.has(call.seq))) return decision
    signal.throwIfAborted()
    try {
      const root = join(agent.session.header.cwd ?? process.cwd(), config.stateDir)
      if (await findTeamByCaptain(root, durableSessionId(agent), await leadIdentityOfAsync(ctx, agent.session))) {
        streaks.delete(agent)
        return decision
      }
    } catch {
      // A read failure is not evidence that no Team exists.
      streaks.delete(agent)
      return decision
    }
    signal.throwIfAborted()
    if (context(agent)?.key !== streak.key) { streaks.delete(agent); return decision }
    paused.add(agent)
    return { kind: 'reject' }
  })
}
