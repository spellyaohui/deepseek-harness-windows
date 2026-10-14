import type { Context } from '@deepseek-ai/cordis'
import type { PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { agentTeamsSource, sessionOwnEvents } from './harness-compat.ts'
import { parseProfileInvocation, resolveProfileTaskPlanning, type TeamProfileConfig, type AgentTeamsInvocation } from './profiles.ts'
import { latestDirectUserTemporaryAuthorization, parseTemporaryAuthorization } from './temporary-authorization.ts'

export const AGENT_TEAMS_COMMAND = 'agent-teams'
const PROFILE_COMMAND_PREFIX = `${AGENT_TEAMS_COMMAND}-`

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'agent-teams-command': { readonly kind: 'agent-teams-command'; readonly goal?: string; readonly profile?: string }
  }
}

const GESTURE = /^\/agent-teams(?=$|[\t\n\r ])/u

function temporaryCommandIntent(text: string): boolean {
  return /^\/agent-teams[\t ]+--temporary(?:[\t ]|$)/u.test(text.trim())
}

function temporaryInvocation(text: string): { goal?: string } | undefined {
  return parseTemporaryAuthorization(text)
}

/**
 * Convert a configured profile key into a stable, closed-namespace command
 * suffix. Only lowercase ASCII letters, digits and dashes are representable;
 * this deliberately prevents accidental command aliases for ambiguous profile
 * names such as `foo bar`, `foo_bar`, or non-ASCII keys.
 */
export function profileCommandName(profileName: string): string | undefined {
  const normalized = profileName.trim().toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(normalized)) return undefined
  return `${PROFILE_COMMAND_PREFIX}${normalized}`
}

/** Resolve a profile command only when it maps uniquely to a live profile. */
function profileForCommand(commandName: string, profiles: Record<string, TeamProfileConfig>): string | undefined {
  const matches = Object.keys(profiles).filter((profileName) => profileCommandName(profileName) === commandName)
  return matches.length === 1 ? matches[0] : undefined
}

/** Parse either the generic command or one generated profile alias. */
function parseCommandText(text: string, profiles: Record<string, TeamProfileConfig>): AgentTeamsInvocation | undefined {
  const trimmed = text.trimStart()
  if (GESTURE.test(trimmed)) return parseProfileInvocation(trimmed.slice(AGENT_TEAMS_COMMAND.length + 1).trim())
  if (!trimmed.startsWith(`/${PROFILE_COMMAND_PREFIX}`)) return undefined
  const tokenEnd = trimmed.search(/[\t\n\r ]/u)
  const commandName = trimmed.slice(1, tokenEnd === -1 ? undefined : tokenEnd)
  const profile = profileForCommand(commandName, profiles)
  if (profile === undefined) return undefined
  return { profile, goal: (tokenEnd === -1 ? '' : trimmed.slice(tokenEnd)).trim() }
}

export function invokedAgentTeamsInvocation(messages: readonly UserMessage[], getProfiles: () => Record<string, TeamProfileConfig> = () => ({})): AgentTeamsInvocation | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message === undefined || message.source.kind !== 'user') continue
    for (const block of message.content) {
      if (block.type !== 'text') continue
      if (temporaryCommandIntent(block.text)) return undefined
      const invocation = parseCommandText(block.text, getProfiles())
      if (invocation !== undefined) return invocation
    }
  }
  return undefined
}

export function invokedAgentTeamsGoal(messages: readonly UserMessage[]): string | undefined {
  return invokedAgentTeamsInvocation(messages)?.goal
}

/** Return an exact Profile command from this current direct-user turn only. */
export function currentUserProfileCommand(agent: Agent, getProfiles: () => Record<string, TeamProfileConfig>): string | undefined {
  const events = sessionOwnEvents(agent.session)
  let turnStart = -Infinity
  for (const event of events) {
    if (event?.type === 'turn/start' && Number.isFinite(event.seq)) turnStart = event.seq
  }
  if (!Number.isFinite(turnStart)) return undefined
  if (events.some(event => event?.type === 'turn/end' && Number.isFinite(event.seq) && event.seq > turnStart)) return undefined
  const messages: UserMessage[] = []
  for (const event of events) {
    if (!Number.isFinite(event?.seq) || event.seq <= turnStart || event.type !== 'user/message') continue
    if (event.data?.source?.kind !== 'user' || !Array.isArray(event.data?.content)) continue
    messages.push({
      id: `agent-teams-user-${event.seq}` as UserMessage['id'],
      role: 'user',
      content: event.data.content as UserMessage['content'],
      source: { kind: 'user' },
    })
  }
  return invokedAgentTeamsInvocation(messages.slice(-1), getProfiles)?.profile
}

export function buildActivationDirective(goal: string, profile?: string, taskPlanning: 'captain' | 'seed' = 'seed'): string {
  const captainPlanning = profile !== undefined && taskPlanning === 'captain'
  const lines = [
    'The user invoked an AgentTeams slash command. Follow the AgentTeams protocol already in your system instructions. Inspect existing team state with agent_teams_status when needed.',
    'Continue an existing plan or team without recreating it. Only when no current team exists, call agent_teams_create with approval="automatic" so the slash-command goal starts immediately. Omit name so the plugin generates it. Use approval="required" only when the user explicitly asks to review a staged plan before work starts.',
  ]
  if (profile !== undefined) {
    lines.push(`Use profile="${profile}" when creating a new team.`)
    if (taskPlanning === 'captain') {
      lines.push(
        'This profile supplies the roster and guardrails. After create, build the smallest useful task graph with captain-owned AgentTeams task tools; do not recreate members or use the Web staged-plan review for ordinary delegation.',
        'Do not ask the user to name, split, merge, serialize, parallelize, or approve the plan. Add dependencies only for genuine prerequisites and later synthesis.',
        'Independent supplemental work must become separate ready tasks so idle members can run in parallel.',
      )
    } else {
      lines.push('Do not recreate the same members or seed tasks manually.')
    }
  }
  lines.push(goal === '' ? 'The goal was not given — ask the user what the team should accomplish.' : `Goal: ${goal}`)
  return lines.join('\n')
}

export function buildTemporaryActivationDirective(goal?: string): string {
  return [
    'The user explicitly authorized one temporary subagent for this current turn. Use the official subagent tool only for this bounded request; the authorization expires after this turn.',
    goal === undefined ? 'Ask for the temporary delegation goal if it is still unclear.' : `Goal: ${goal}`,
  ].join('\n')
}

export function registerAgentTeamsCommand(ctx: Context, getProfiles: () => Record<string, TeamProfileConfig> = () => ({})): void {
  ctx.effect(() => {
    const dispose: Array<() => void> = []
    dispose.push(ctx.commands.register({
      name: AGENT_TEAMS_COMMAND,
      description: 'run a goal with a multi-agent team (you become the captain)',
      input: { hint: '[--profile <name>] <goal>' },
      handler(invocation: CommandInvocation): CommandResult {
        const rawTemporary = `/${AGENT_TEAMS_COMMAND}${invocation.rawInput}`
        const temporary = temporaryInvocation(rawTemporary)
        if (temporaryCommandIntent(rawTemporary) && temporary === undefined) {
          return { kind: 'error', text: `Usage: /${AGENT_TEAMS_COMMAND} --temporary <goal>; refused or ambiguous temporary authorization is not a Team command` }
        }
        if (temporary !== undefined) {
          if (temporary.goal === undefined) return { kind: 'error', text: `Usage: /${AGENT_TEAMS_COMMAND} --temporary <goal>` }
          invocation.agent.followup(createUserMessage({ content: [{ type: 'text', text: `/${AGENT_TEAMS_COMMAND}${invocation.rawInput}` }], source: { kind: 'user' } }))
          return { kind: 'success', text: 'Temporary subagent authorization accepted for this turn.' }
        }
        let parsed: AgentTeamsInvocation
        try { parsed = parseProfileInvocation(invocation.rawInput.trim()) } catch (error: unknown) { return { kind: 'error', text: String(error) } }
        if (parsed.profile !== undefined && !Object.keys(getProfiles()).some(key => key.trim() === parsed.profile)) return { kind: 'error', text: `unknown AgentTeams profile "${parsed.profile}"` }
        if (parsed.profile === undefined && parsed.goal === '') return { kind: 'error', text: `Usage: /${AGENT_TEAMS_COMMAND} [--profile <name>] <goal>` }
        invocation.agent.followup(createUserMessage({ content: [{ type: 'text', text: `/${AGENT_TEAMS_COMMAND}${invocation.rawInput}` }], source: { kind: 'user' } }))
        return { kind: 'success', text: `AgentTeams activated${parsed.profile === undefined ? '' : ` with profile ${parsed.profile}`} — the captain will assemble the team.` }
      },
    }))
    for (const profileName of Object.keys(getProfiles())) {
      const commandName = profileCommandName(profileName)
      if (commandName === undefined) continue
      dispose.push(ctx.commands.register({
        name: commandName,
        description: `run a goal with the AgentTeams ${profileName} profile`,
        input: { hint: '<goal>' },
        handler(invocation: CommandInvocation): CommandResult {
          const profile = profileForCommand(commandName, getProfiles())
          if (profile === undefined) return { kind: 'error', text: `AgentTeams profile command "/${commandName}" is unavailable` }
          invocation.agent.followup(createUserMessage({ content: [{ type: 'text', text: `/${commandName}${invocation.rawInput}` }], source: { kind: 'user' } }))
          return { kind: 'success', text: `AgentTeams activated with profile ${profile} — the captain will assemble the team.` }
        },
      }))
    }
    return () => {
      for (const unregister of dispose.reverse()) unregister()
    }
  }, 'agent-teams: slash commands')
}

export function installAgentTeamsGestureBoundary(ctx: Context, getProfiles: () => Record<string, TeamProfileConfig> = () => ({})): void {
  ctx.on('agent/pre-step', async ({ messages, signal }, next): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    let invocation: AgentTeamsInvocation | undefined
    const temporary = latestDirectUserTemporaryAuthorization(messages)
    if (temporary !== undefined) {
      return { kind: 'enter', messages: [...decision.messages, createUserMessage({ content: [{ type: 'text', text: buildTemporaryActivationDirective(temporary.goal) }], source: agentTeamsSource({ kind: 'agent-teams-command' }) })] }
    }
    try { invocation = invokedAgentTeamsInvocation(messages, getProfiles) } catch (error: unknown) { return { kind: 'enter', messages: [...decision.messages, createUserMessage({ content: [{ type: 'text', text: `AgentTeams profile parsing failed: ${String(error)}` }], source: agentTeamsSource({ kind: 'agent-teams-command' }) })] } }
    if (invocation === undefined) return decision
    signal.throwIfAborted()
    const profiles = getProfiles()
    const matched = invocation.profile === undefined
      ? undefined
      : Object.entries(profiles).find(([key]) => key.trim() === invocation.profile)
    const known = invocation.profile === undefined || matched !== undefined
    const text = !known
      ? `AgentTeams profile "${invocation.profile}" does not exist. Available profiles: ${Object.keys(profiles).join(', ') || '(none)'}. Do not create a team.`
      : buildActivationDirective(invocation.goal, invocation.profile, resolveProfileTaskPlanning(matched?.[1]))
    return { kind: 'enter', messages: [...decision.messages, createUserMessage({ content: [{ type: 'text', text }], source: agentTeamsSource({ kind: 'agent-teams-command', ...invocation.goal === '' ? {} : { goal: invocation.goal }, ...invocation.profile === undefined ? {} : { profile: invocation.profile } }) })] }
  })
}
