import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
// Declaration merge only: makes agent.ctx.systemPrompt and agent.ctx.tools visible.
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import type { DelegationMode } from './settings.ts'
import { onAgentReady, sessionOwnEvents } from './harness-compat.ts'
import { CAPTAIN_TOOL_NAMES } from './tool-names.ts'
import type { SubagentCompatibility } from './subagent-compat.ts'

export type DelegationPolicyId = 'teams-v1' | 'native-v1'
export const POLICY_PREFIX = 'AgentTeams delegation policy:'
export const NATIVE_DELEGATION_TOOLS = [
  'subagent', 'subagent_fork', 'subagent_codex', 'subagent_claude_code',
  'list_agents', 'send_message', 'interrupt_agent', 'workflow', 'ralph',
] as const
const nativeDelegationToolNames = new Set<string>(NATIVE_DELEGATION_TOOLS)

export function policyMarker(policy: DelegationPolicyId): string {
  return `${POLICY_PREFIX} ${policy}`
}

/** Policy-specific activation guidance placed before the shared AgentTeams protocol. */
export function delegationPolicyUsagePreamble(policy: DelegationPolicyId): string {
  return policy === 'teams-v1'
    ? 'AgentTeams owns delegation. Captain subagent calls route to real Team members/tasks; coordinate them with agent_teams_* tools. Ordinary single-agent work needs no Team. When delegating, you are the captain.'
    : 'When the user asks to run something with AgentTeams (e.g. "use AgentTeams to do X"), or an activation message from the /agent-teams slash command arrives, you are the captain of a multi-agent team.'
}

/** Read the durable system prompt across the V2 header and V3 system-message layouts. */
function persistedSystemText(event: SessionEvent): string | undefined {
  if (event.type === 'request/header') {
    // Session format V3 retires header.system; retain a narrow read only for
    // legacy logs that reached this plugin before the official migration.
    const legacy = event.data.header as typeof event.data.header & { readonly system?: unknown }
    return typeof legacy.system === 'string' ? legacy.system : undefined
  }
  if (event.type !== 'system/message' || event.data.message.role !== 'system') return undefined
  const text = event.data.message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
  return text.length > 0 ? text.join('\n') : undefined
}

export function persistedPolicy(events: readonly SessionEvent[]): DelegationPolicyId | undefined {
  let persisted: DelegationPolicyId | undefined
  for (const event of events) {
    const system = persistedSystemText(event)
    if (system === undefined) continue
    for (const line of system.split(/\r\n?|\n/u)) {
      const match = /^AgentTeams delegation policy: (\S+)$/u.exec(line)
      if (match?.[1] === undefined) continue
      if (match[1] === 'teams-v1' || match[1] === 'native-v1') {
        persisted = match[1]
        continue
      }
      throw new Error('agent-teams: request header contains an unknown delegation policy marker')
    }
  }
  return persisted
}

export function resolveDelegationPolicy(input: {
  events: readonly SessionEvent[]
  defaultMode: DelegationMode
  parentPolicy?: DelegationPolicyId
}): DelegationPolicyId {
  return persistedPolicy(input.events)
    ?? input.parentPolicy
    ?? (input.defaultMode === 'teams' ? 'teams-v1' : 'native-v1')
}

const installedPolicies = new WeakMap<Agent, DelegationPolicyId>()
const compatibleCaptains = new WeakSet<Agent>()

function hiddenTeamTool(agent: Agent, name: string): boolean {
  return installedPolicies.get(agent) === 'teams-v1' && nativeDelegationToolNames.has(name)
    && !(name === 'subagent' && compatibleCaptains.has(agent))
}

/** Make the official continuation capability lookup agree with Team admission.
 * Scope-local registrations survive restrict(); Native and global lookups stay unchanged.
 */
function installTeamToolLookup(ctx: Context): () => void {
  const tools = ctx.tools
  if (typeof tools?.get !== 'function') return () => undefined
  const original = tools.get
  const descriptor = Object.getOwnPropertyDescriptor(tools, 'get')
  let active = true
  const lookup: typeof original = function (this: typeof tools, name, scope) {
    if (active && scope !== undefined && hiddenTeamTool(scope as Agent, name)) return undefined
    return original.call(this, name, scope)
  }
  tools.get = lookup
  return () => {
    active = false
    if (Object.getOwnPropertyDescriptor(tools, 'get')?.value !== lookup) return
    if (descriptor === undefined) Reflect.deleteProperty(tools, 'get')
    else Object.defineProperty(tools, 'get', descriptor)
  }
}

function sessionEvents(agent: Agent): readonly SessionEvent[] {
  const session = agent.session as typeof agent.session & { readonly events?: readonly SessionEvent[] }
  return typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : session.events ?? []
}

/** Return the in-scope policy already installed before an Agent's first request. */
export function installedDelegationPolicy(agent: Agent): DelegationPolicyId | undefined {
  return installedPolicies.get(agent)
}

/** Resolve a live Agent's durable policy, including its unpublished installation. */
export function liveDelegationPolicy(agent: Agent, defaultMode: DelegationMode): DelegationPolicyId {
  const events = sessionEvents(agent)
  return persistedPolicy(events)
    ?? installedDelegationPolicy(agent)
    ?? resolveDelegationPolicy({ events, defaultMode })
}

/** Live settings and policy-specific prompt renderer shared by captains and members. */
export interface DelegationPolicyRuntime {
  defaultMode(): DelegationMode
  order: number
  text(policy: DelegationPolicyId): string
  /** Fixed member-scoped prompt, so children never receive captain rules. */
  memberText?: (policy: DelegationPolicyId) => string
  subagentCompatibility?: SubagentCompatibility
}

/** Install one policy prompt plus Team-mode native-delegation enforcement in an Agent scope. */
export function installDelegationPolicy(input: {
  agent: Agent
  policy: DelegationPolicyId
  order: number
  text: string
  member?: boolean
  subagentCompatibility?: SubagentCompatibility
}): () => void {
  const { agent, policy } = input
  const installed = installedPolicies.get(agent)
  if (installed !== undefined) {
    if (installed !== policy) {
      throw new Error(`agent-teams: agent already has delegation policy ${installed}, cannot install ${policy}`)
    }
    return () => undefined
  }

  const disposePrompt = agent.ctx.systemPrompt.section({
    name: 'agent-teams:usage',
    order: input.order,
    text: input.text,
  })
  const restrictions: Array<() => void> = []
  let disposeGuard = (): void => undefined
  let disposeCompatibility = (): void => undefined
  let disposeAssembly = (): void => undefined
  try {
    if (input.member === true) {
      const deny = CAPTAIN_TOOL_NAMES.filter(name => agent.ctx.tools.get(name) !== undefined)
      if (deny.length > 0) restrictions.push(agent.ctx.tools.restrict({ deny }))
    }
    if (policy === 'teams-v1') {
      const compatibility = input.member === true ? undefined : input.subagentCompatibility
      if (compatibility !== undefined) {
        compatibleCaptains.add(agent)
        disposeCompatibility = agent.ctx.on('tools/execute', async (execution, next) => {
          if (execution.name !== 'subagent' || execution.agent !== agent) return next()
          const value = await compatibility(execution)
          // ToolRuntime validates and renders this through the original official
          // output contract. Never execute the unmanaged native tool body.
          return { isError: false, value, content: [] }
        })
      }
      // `restrict()` can only name inherited/global registrations. The built-in
      // `subagent` Host tool is scope-local in Harness 0.1.5, so it must never
      // enter the global deny list; the scoped execution guard below owns it.
      const deny = NATIVE_DELEGATION_TOOLS.filter(
        (name) => name !== 'subagent' && agent.ctx.tools.get(name) !== undefined,
      )
      if (deny.length > 0) restrictions.push(agent.ctx.tools.restrict({ deny }))
      // Scoped tools deliberately survive `restrict()`. Guard every native
      // delegation name at execution time so a scope-local registration cannot
      // bypass the Team-only AgentTeams delegation policy.
      disposeGuard = agent.ctx.tools.guard((execution) => (
        nativeDelegationToolNames.has(execution.name)
          && !(execution.name === 'subagent' && execution.agent === agent && compatibility !== undefined)
          ? `AgentTeams Team policy forbids native delegation tool "${execution.name}"; use agent_teams_* tools`
          : undefined
      ))
      // The public assembly seam covers tools registered later in this own scope.
      // Keep execution guards for direct calls; hiding schemas is not authorization.
      disposeAssembly = agent.ctx.on?.('system-prompt/assemble', async (_assembly, context, next) => {
        const assembly = await next()
        if (context.scope !== agent) return assembly
        return { ...assembly, tools: assembly.tools.filter(tool => !hiddenTeamTool(agent, tool.name)) }
      }) ?? (() => undefined)
    }
  } catch (error) {
    compatibleCaptains.delete(agent)
    disposeAssembly()
    disposeGuard()
    disposeCompatibility()
    for (const disposeRestriction of [...restrictions].reverse()) disposeRestriction()
    disposePrompt()
    throw error
  }

  installedPolicies.set(agent, policy)
  let active = true
  return () => {
    if (!active) return
    active = false
    installedPolicies.delete(agent)
    compatibleCaptains.delete(agent)
    disposeAssembly()
    disposeGuard()
    disposeCompatibility()
    for (const disposeRestriction of [...restrictions].reverse()) disposeRestriction()
    disposePrompt()
  }
}

/** Resolve and install one Agent policy before any request assembly. */
export function resolveAndInstallDelegationPolicy(
  agent: Agent,
  parent: Agent | undefined,
  runtime: DelegationPolicyRuntime,
  options: { member?: boolean } = {},
): { policy: DelegationPolicyId; dispose: () => void } {
  const defaultMode = runtime.defaultMode()
  const events = sessionEvents(agent)
  const policy = resolveDelegationPolicy({
    events,
    defaultMode,
    ...(parent === undefined ? {} : { parentPolicy: liveDelegationPolicy(parent, defaultMode) }),
  })
  const dispose = installDelegationPolicy({
    agent,
    policy,
    order: runtime.order,
    text: options.member ? (runtime.memberText?.(policy) ?? runtime.text(policy)) : runtime.text(policy),
    member: options.member,
    subagentCompatibility: runtime.subagentCompatibility,
  })
  return { policy, dispose }
}

/** Register policy installation for new, legacy, and already-live Agents. */
export function registerDelegationPolicyLifecycle(
  ctx: Context,
  runtime: DelegationPolicyRuntime,
): () => void {
  const active = new Map<Agent, () => void>()
  const stopLookup = installTeamToolLookup(ctx)
  let mounted = true
  const attach = (agent: Agent): void => {
    if (!mounted || active.has(agent)) return
    let member = false
    try {
      member = sessionOwnEvents(agent.session).some(event => event?.type === 'subagent/descriptor'
        && typeof event.data?.label === 'string'
        && event.data.label.startsWith('agent-teams:'))
    } catch (error) {
      ctx.logger.warn(`agent-teams: policy membership hydration failed: ${String(error)}`)
    }
    const parentSession = agent.session.header.parentSession
    const parent = parentSession === undefined ? undefined : ctx.agents.get(parentSession)
    const installed = resolveAndInstallDelegationPolicy(agent, parent, runtime, { member })
    let disposed = false
    const dispose = (): void => {
      if (disposed) return
      disposed = true
      active.delete(agent)
      installed.dispose()
    }
    active.set(agent, dispose)
    try {
      const agentEffect = (agent.ctx as unknown as { effect?: (setup: () => () => void, name: string) => unknown }).effect
      agentEffect?.call(agent.ctx, () => dispose, 'agent-teams: delegation policy lifecycle')
    } catch (error) {
      dispose()
      throw error
    }
  }
  let stopReady = (): void => {}
  const dispose = (): void => {
    if (!mounted) return
    mounted = false
    stopReady()
    for (const release of [...active.values()]) release()
    stopLookup()
  }
  try {
    const rootEffect = (ctx as unknown as { effect?: (setup: () => () => void, name: string) => unknown }).effect
    rootEffect?.call(ctx, () => dispose, 'agent-teams: delegation policy lifecycle')
    stopReady = onAgentReady(ctx, agent => { attach(agent) })
    const agents = ctx.agents as typeof ctx.agents & { list?: () => Iterable<Agent> }
    for (const agent of agents.list?.() ?? []) attach(agent)
  } catch (error) {
    dispose()
    throw error
  }
  return dispose
}
