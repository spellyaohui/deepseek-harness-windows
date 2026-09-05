/**
 * AgentTeams' single boundary for continuable child operations.
 *
 * The Harness subagent service remains the lifecycle owner. This adapter keeps
 * Team-owned start, delivery, and interrupt calls on one path so a resumed
 * parent cannot accidentally cross the boundary with a transient handle.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import {
  SubagentError,
  type ContinuableStart,
  type ContinuableStartSpec,
  type SubagentSendMessageOptions,
} from '@deepseek-ai/dsh-subagent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { durableSessionId } from './agent-identity.ts'

type SubagentRuntimeLike = {
  startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>
  sendMessage?: (
    sender: Agent,
    targetId: SessionId,
    content: ContentBlock[],
    options: SubagentSendMessageOptions,
  ) => Promise<unknown>
  /** Compatibility surface retained for pre-RC.1 test hosts. */
  followup?: (
    sender: Agent,
    targetId: SessionId,
    content: Array<{ type: 'text'; text: string }>,
    options: { signal: AbortSignal },
  ) => Promise<unknown>
  interrupt(targetId: SessionId, authority: { kind: 'ancestor'; agent: Agent }): void
  drainContinuableChildren?: (parent: Agent, childIds: readonly SessionId[]) => Promise<void>
}

type AgentRegistryLike = {
  get(id: SessionId): Agent | undefined
}

export interface AgentTeamsSubagentGateway {
  /** Resolve the exact live parent or reject a transient/unowned handle. */
  resolveParent(parent: Agent): Agent
  /** Start one Team-owned continuable child. */
  startContinuable(spec: ContinuableStartSpec): Promise<ContinuableStart>
  /** Deliver one Team-owned message to a direct child. */
  sendMessage(
    parent: Agent,
    childId: SessionId,
    content: ContentBlock[],
    options: SubagentSendMessageOptions,
    admission?: (parent: Agent) => void | Promise<void>,
  ): Promise<unknown>
  /** Interrupt one Team-owned direct child. */
  interrupt(parent: Agent, childId: SessionId): void
  /** Atomically interrupt and drain selected Team-owned direct children. */
  interruptAndDrain(
    parent: Agent,
    childIds: readonly SessionId[],
    fallback?: () => Promise<void>,
  ): Promise<void>
  /** Drain selected Team-owned direct children when the host exposes it. */
  drainContinuableChildren?(parent: Agent, childIds: readonly SessionId[]): Promise<void>
  /** Serialize Team admission and retirement decisions for one child. */
  withChildLock<T>(childId: SessionId, operation: () => Promise<T>): Promise<T>
}

function registryOf(ctx: Context): AgentRegistryLike | undefined {
  return (ctx as unknown as { agents?: AgentRegistryLike }).agents
}

function resolveParent(ctx: Context, parent: Agent): Agent {
  const durableId = durableSessionId(parent)
  const registry = registryOf(ctx)
  if (registry !== undefined) {
    const liveByHandleId = registry.get(parent.id as SessionId)
    if (liveByHandleId === parent) return parent

    // A replacement continuation handle may carry a transient runtime id while
    // retaining the durable Session id. Resolve that exact durable live agent.
    // When the ids are already equal, accepting another object would violate
    // the upstream exact-live-agent contract and create an impersonation hole.
    if (durableId !== parent.id) {
      const live = registry.get(durableId as SessionId)
      if (live !== undefined && durableSessionId(live) === durableId) return live
    }

    throw new SubagentError(
      `AgentTeams subagent gateway rejected parent handle "${parent.id}": durable Session "${durableId}" is not attached`,
      'UNAUTHORIZED',
    )
  }

  // Lightweight offline fixtures may not expose an AgentRegistry. They can
  // still exercise the gateway when the handle itself carries its durable id;
  // a transient id remains fail-closed because there is no canonical handle to
  // resolve.
  if (durableId === parent.id) return parent

  throw new SubagentError(
    `AgentTeams subagent gateway rejected parent handle "${parent.id}": durable Session "${durableId}" is not attached`,
    'UNAUTHORIZED',
  )
}

export function createAgentTeamsSubagentGateway(ctx: Context): AgentTeamsSubagentGateway {
  const runtime = ctx.subagents as unknown as SubagentRuntimeLike
  const childLocks = new Map<SessionId, Promise<void>>()
  const withChildLock = async <T>(childId: SessionId, operation: () => Promise<T>): Promise<T> => {
    const previous = childLocks.get(childId) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => gate)
    childLocks.set(childId, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (childLocks.get(childId) === tail) childLocks.delete(childId)
    }
  }

  const withChildLocks = async <T>(childIds: readonly SessionId[], operation: () => Promise<T>): Promise<T> => {
    const ids = [...new Set(childIds)].sort((left, right) => left.localeCompare(right))
    const acquire = async (index: number): Promise<T> => {
      if (index >= ids.length) return operation()
      return withChildLock(ids[index]!, () => acquire(index + 1))
    }
    return acquire(0)
  }

  return {
    resolveParent(parent) {
      return resolveParent(ctx, parent)
    },
    startContinuable(spec) {
      const parent = resolveParent(ctx, spec.request.parent)
      return runtime.startContinuable({
        ...spec,
        request: { ...spec.request, parent },
      })
    },
    sendMessage(parent, childId, content, options, admission) {
      return withChildLock(childId, async () => {
        const canonicalParent = resolveParent(ctx, parent)
        await admission?.(canonicalParent)
        if (typeof runtime.sendMessage === 'function') {
          return runtime.sendMessage(canonicalParent, childId, content, options)
        }
        if (typeof runtime.followup === 'function') {
          return runtime.followup(canonicalParent, childId, content as Array<{ type: 'text'; text: string }>, options)
        }
        throw new Error('subagent runtime does not expose message delivery')
      })
    },
    interrupt(parent, childId) {
      const canonicalParent = resolveParent(ctx, parent)
      runtime.interrupt(childId, { kind: 'ancestor', agent: canonicalParent })
    },
    async interruptAndDrain(parent, childIds, fallback) {
      const ids = [...new Set(childIds)]
      if (ids.length === 0) return
      await withChildLocks(ids, async () => {
        const canonicalParent = resolveParent(ctx, parent)
        for (const childId of ids) {
          try {
            runtime.interrupt(childId, { kind: 'ancestor', agent: canonicalParent })
          } catch (error: unknown) {
            ctx.logger.warn(`agent-teams: interrupt of member ${childId} failed: ${String(error)}`)
          }
        }
        if (typeof runtime.drainContinuableChildren === 'function') {
          await runtime.drainContinuableChildren(canonicalParent, ids)
          return
        }
        await fallback?.()
      })
    },
    drainContinuableChildren: typeof runtime.drainContinuableChildren === 'function'
      ? (parent, childIds) => withChildLocks(childIds, async () => (
        runtime.drainContinuableChildren!(resolveParent(ctx, parent), childIds)
      ))
      : undefined,
    withChildLock,
  }
}

const gateways = new WeakMap<object, AgentTeamsSubagentGateway>()

/** Return one gateway per plugin context so all Team operations share a path. */
export function agentTeamsSubagentGateway(ctx: Context): AgentTeamsSubagentGateway {
  const key = ctx as unknown as object
  const existing = gateways.get(key)
  if (existing !== undefined) return existing
  const created = createAgentTeamsSubagentGateway(ctx)
  gateways.set(key, created)
  return created
}
