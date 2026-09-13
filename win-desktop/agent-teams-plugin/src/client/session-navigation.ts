/** Addressed navigation into durable AgentTeams member transcripts. */

import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'

/** Narrow sessions-service face used by the activity panel and team card. */
export interface AgentTeamsSessionNavigator {
  /** rc.8 addressed subagent navigation. */
  openSubagent?(address: SubagentAddress): void
  /** Refresh the exact parent's durable direct-child catalog. */
  refreshSubagents?(parentSessionId: SessionId): Promise<void>
  /** Reuse an address already retained by the client runtime when available. */
  subagentAddress?(id: SessionId): SubagentAddress | undefined
}

/** Main-panel navigation supplied by Harness 0.1.5; absent on older hosts. */
export interface AgentTeamsLayoutNavigator {
  selectPanel?(panelId: null): void
  beginNavigation?(): AbortSignal
}

/**
 * Open one member's persisted transcript.
 *
 * Harness rc.8 intentionally removed cold subagents from the ordinary session
 * list. They must first be rediscovered in their parent's catalog, then opened
 * with the exact parent/child/mode address. There is intentionally no
 * ordinary-session fallback: opening a different session can silently detach
 * the user from the requested member transcript. New layouts return to
 * Conversation only after addressed navigation succeeds.
 */
export async function openAgentTeamMember(
  sessions: AgentTeamsSessionNavigator,
  parentSessionId: SessionId,
  childSessionId: SessionId,
  layout?: AgentTeamsLayoutNavigator,
): Promise<'subagent' | 'cancelled' | undefined> {
  if (sessions.openSubagent === undefined || sessions.refreshSubagents === undefined) return undefined

  const navigation = layout?.beginNavigation?.()
  await sessions.refreshSubagents(parentSessionId)
  if (navigation?.aborted) return 'cancelled'
  const retained = sessions.subagentAddress?.(childSessionId)
  if (retained?.mode === 'one-shot') return undefined
  const address: SubagentAddress = retained?.parentSessionId === parentSessionId
    ? retained
    : { parentSessionId, childSessionId, mode: 'continuable' }
  if (address.mode !== 'continuable') return undefined
  sessions.openSubagent(address)
  layout?.selectPanel?.(null)
  return 'subagent'
}
