/** Addressed navigation into durable AgentTeams member transcripts. */
import type { SessionId, SubagentAddress } from '@deepseek-ai/dsh-client-runtime/client';
/** Narrow sessions-service face used by the activity panel and team card. */
export interface AgentTeamsSessionNavigator {
    /** rc.8 addressed subagent navigation. */
    openSubagent?(address: SubagentAddress): void;
    /** Refresh the exact parent's durable direct-child catalog. */
    refreshSubagents?(parentSessionId: SessionId): Promise<void>;
    /** Reuse an address already retained by the client runtime when available. */
    subagentAddress?(id: SessionId): SubagentAddress | undefined;
}
/**
 * Open one member's persisted transcript.
 *
 * Harness rc.8 intentionally removed cold subagents from the ordinary session
 * list. They must first be rediscovered in their parent's catalog, then opened
 * with the exact parent/child/mode address. There is intentionally no
 * ordinary-session fallback: opening a different session can silently detach
 * the user from the requested member transcript.
 */
export declare function openAgentTeamMember(sessions: AgentTeamsSessionNavigator, parentSessionId: SessionId, childSessionId: SessionId): Promise<'subagent' | undefined>;
