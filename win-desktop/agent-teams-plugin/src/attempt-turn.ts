/** Recover from the existing child-owned session log, never a session cache. */
export function latestAttemptTurnEnd(events: readonly { type: string; seq: number; data?: unknown }[], taskId: string, attemptId: string): string | undefined {
  const ordered = [...events].filter(event => Number.isSafeInteger(event.seq)).sort((a, b) => a.seq - b.seq)
  const newest = [...ordered].reverse()
  const start = newest.find(event => event.type === 'turn/start')
  if (!start) return undefined
  const data = (event: { data?: unknown }) => event.data as Record<string, unknown> | undefined
  const turn = data(start)?.turn
  const end = newest.find(event => event.type === 'turn/end' && event.seq > start.seq && data(event)?.turn === turn)
  if (!end) return undefined
  const marker = newest.find(event => {
    if (event.type !== 'tool/call' || event.seq >= end.seq || data(event)?.name !== 'agent_teams_update_task') return false
    try {
      const args = JSON.parse(String(data(event)?.arguments))
      return args.task_id === taskId && typeof args.attempt_id === 'string'
    } catch { return false }
  })
  if (!marker || JSON.parse(String(data(marker)?.arguments)).attempt_id !== attemptId) return undefined
  const reason = data(end)?.reason as { kind?: unknown } | undefined
  return typeof reason?.kind === 'string' ? reason.kind : undefined
}
