/** Addressed navigation into durable AgentTeams member transcripts. */
/**
 * Open one member's persisted transcript.
 *
 * Harness rc.8 intentionally removed cold subagents from the ordinary session
 * list. They must first be rediscovered in their parent's catalog, then opened
 * with the exact parent/child/mode address. There is intentionally no
 * ordinary-session fallback: opening a different session can silently detach
 * the user from the requested member transcript.
 */
export async function openAgentTeamMember(sessions, parentSessionId, childSessionId) {
    if (sessions.openSubagent === undefined || sessions.refreshSubagents === undefined)
        return undefined;
    await sessions.refreshSubagents(parentSessionId);
    const retained = sessions.subagentAddress?.(childSessionId);
    if (retained?.mode === 'one-shot')
        return undefined;
    const address = retained?.parentSessionId === parentSessionId
        ? retained
        : { parentSessionId, childSessionId, mode: 'continuable' };
    if (address.mode !== 'continuable')
        return undefined;
    sessions.openSubagent(address);
    return 'subagent';
}
