/** One-shot Team activity waiters. Notifications are never replayed. */

export interface TeamWaitResult {
  readonly timedOut: boolean
}

interface Waiter {
  readonly resolve: () => void
}

/** Owns one-shot waiters and releases each at most once. */
export class TeamActivity {
  private readonly waiters = new Map<string, Set<Waiter>>()

  /** Wait for one activity edge that occurs after this call registers. */
  async wait(key: string, timeoutMs: number, signal: AbortSignal): Promise<TeamWaitResult> {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error('timeoutMs must be a positive safe integer')
    }
    signal.throwIfAborted()
    const changed = await new Promise<boolean>((resolve, reject) => {
      let waiters = this.waiters.get(key)
      if (waiters === undefined) {
        waiters = new Set()
        this.waiters.set(key, waiters)
      }
      let settled = false
      let timer: ReturnType<typeof setTimeout>
      const finish = (settle: () => void): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        waiters.delete(waiter)
        if (waiters.size === 0) this.waiters.delete(key)
        settle()
      }
      const onAbort = (): void => {
        finish(() => {
          const reason: unknown = signal.reason
          reject(reason instanceof Error ? reason : new Error(`agent_teams_wait aborted: ${String(reason)}`))
        })
      }
      const waiter: Waiter = { resolve: () => { finish(() => { resolve(true) }) } }
      waiters.add(waiter)
      timer = setTimeout(() => { finish(() => { resolve(false) }) }, timeoutMs)
      signal.addEventListener('abort', onAbort, { once: true })
      if (signal.aborted) onAbort()
    })
    return { timedOut: !changed }
  }

  /** Wake all current waiters for one exact Team activity key. */
  notify(key: string): void {
    const waiters = this.waiters.get(key)
    if (waiters === undefined) return
    this.waiters.delete(key)
    for (const waiter of waiters) waiter.resolve()
  }
}

const sharedActivity = new TeamActivity()

/** Stable process-local identity for one Team's activity stream. */
export function teamActivityKey(stateRoot: string, teamId: string): string {
  return `${stateRoot}\u0000${teamId}`
}

/** Wait on the maintained AgentTeams activity stream. */
export function waitForTeamActivity(
  stateRoot: string,
  teamId: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<TeamWaitResult> {
  return sharedActivity.wait(teamActivityKey(stateRoot, teamId), timeoutMs, signal)
}

/** Publish a Team-domain or mailbox change without waking an Agent. */
export function notifyTeamActivity(stateRoot: string, teamId: string): void {
  sharedActivity.notify(teamActivityKey(stateRoot, teamId))
}
