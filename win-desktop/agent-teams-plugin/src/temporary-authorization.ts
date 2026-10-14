import type { Agent } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { sessionOwnEvents } from './harness-compat.ts'

export const AGENT_TEAMS_TEMPORARY_COMMAND = 'agent-teams --temporary'

const QUOTED = /["'“”‘’`]/u
const DIRECT_ENGLISH = /^(?:please\s+)?(?:authorize|allow|permit)(?:\s+you)?\s+to\s+(?:use|call|create)\s+(?:a\s+)?temporary\s+subagent[.!]?$/iu
const DIRECT_CHINESE = /^(?:请(?:你)?|请)?(?:允许|授权|同意|可以)(?:你)?(?:使用|调用|创建)(?:一个|一名)?临时子智能体[。！!]?$/u
const REFUSED_AUTHORIZATION = /(?:\b(?:cancel|revoke|withdraw)\s+(?:(?:the|my)\s+)?(?:authorization|permission)\b|(?:取消|撤销|收回)(?:授权|许可)|\b(?:do\s+not|don't|dont|never|cannot|can't|won't|will\s+not|refuse(?:\s+to)?|deny)\s+(?:use|call|create|spawn|start|launch|delegate\s+to)\s+(?:a\s+)?temporary\s+subagent\b|(?:不要|别|拒绝|否决|不同意|取消|不允许|不能|禁止)(?:使用|调用|创建|启动|派遣)(?:一个|一名)?临时子智能体)/iu
const REFUSED_COMMAND = /(?:^|[，,；;。.!?\s])(?:(?:do\s+not|don't|dont|never|stop|cancel)\s+(?:start|launch|create|call|use)\b|(?:不要|别|停止|取消)(?:启动|创建|调用|使用)(?:临时)?(?:子智能体)?)/iu

export interface TemporaryAuthorization {
  readonly goal?: string
}

function textBlocks(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { readonly type: 'text'; readonly text: string } => (
      typeof block === 'object' && block !== null
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string'
    ))
    .map(block => block.text)
    .join('\n')
}

/** Parse only an explicit whole-message authorization; quoted or negative text is never a grant. */
export function parseTemporaryAuthorization(text: string): TemporaryAuthorization | undefined {
  const normalized = text.normalize('NFC').trim()
  if (REFUSED_AUTHORIZATION.test(normalized)) return undefined
  const command = /^\/agent-teams[\t ]+--temporary(?:[\t ]+(.+))?$/u.exec(normalized)
  if (command !== null) {
    const goal = command[1]?.trim()
    if (goal === undefined || goal === '' || REFUSED_COMMAND.test(goal)) return undefined
    return { goal }
  }
  if (normalized === '' || QUOTED.test(normalized)) return undefined
  return DIRECT_ENGLISH.test(normalized) || DIRECT_CHINESE.test(normalized) ? {} : undefined
}

export function latestDirectUserTemporaryAuthorization(messages: readonly UserMessage[]): TemporaryAuthorization | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.source.kind !== 'user') continue
    return parseTemporaryAuthorization(textBlocks(message.content))
  }
  return undefined
}

/**
 * Read only the current session turn. A prior human grant cannot authorize a
 * later model, child, quoted, tool, or skill message.
 */
export function hasCurrentTurnTemporaryAuthorization(agent: Agent): boolean {
  const events = sessionOwnEvents(agent.session)
  let turnStart = -Infinity
  for (const event of events) {
    if (event?.type === 'turn/start' && Number.isFinite(event.seq)) turnStart = event.seq
  }
  if (!Number.isFinite(turnStart)) return false
  if (events.some(event => event?.type === 'turn/end' && Number.isFinite(event.seq) && event.seq > turnStart)) return false
  let latest: string | undefined
  for (const event of events) {
    if (!Number.isFinite(event?.seq) || event.seq <= turnStart || event.type !== 'user/message') continue
    const source = event.data?.source
    if (typeof source !== 'object' || source === null || (source as { kind?: unknown }).kind !== 'user') continue
    latest = textBlocks(event.data?.content)
  }
  return latest !== undefined && parseTemporaryAuthorization(latest) !== undefined
}
