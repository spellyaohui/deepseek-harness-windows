/**
 * Resolve the durable identity used by AgentTeams state lookups.
 *
 * Current Harness Agent handles expose the same value through `agent.id` and
 * `agent.session.id`. Older Alpha.2 continuation paths could rebuild the live
 * handle around a persisted Session and leave `agent.id` transient while the
 * Session identity stayed stable. Team ownership is keyed by that durable
 * Session identity, so prefer it whenever the runtime exposes it and retain a
 * narrow fallback for lightweight/offline fixtures that only provide `id`.
 */
import type { Agent } from '@deepseek-ai/dsh-agent'

type AgentWithOptionalSessionIdentity = Agent & {
  readonly session?: {
    readonly id?: unknown
    readonly header?: { readonly id?: unknown }
  }
}

export function durableSessionId(agent: Agent): string {
  const candidate = agent as AgentWithOptionalSessionIdentity
  const sessionId = candidate.session?.id
  if (typeof sessionId === 'string' && sessionId.trim() !== '') return sessionId.trim()

  const headerId = candidate.session?.header?.id
  if (typeof headerId === 'string' && headerId.trim() !== '') return headerId.trim()

  return agent.id
}
