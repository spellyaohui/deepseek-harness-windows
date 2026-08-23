import type { SessionHeader, SessionId } from '@deepseek-ai/dsh-session'
import {
  assertSessionHeadersCompatible,
  type SessionLineageNode,
  type SessionQueryEngine,
} from '@deepseek-ai/dsh-session-query'

import { foldSessionContent } from './content.ts'
import type { FoldedSessionContent } from './types.ts'

export type SessionExportQuery = Pick<
  SessionQueryEngine,
  'readSession' | 'readSurface' | 'readTitleSnapshot' | 'traceSession'
>

export interface PrepareSessionExportRequest {
  sessionId: SessionId
  includeDescendants: boolean
}

export interface PreparedSessionRoot {
  session: SessionHeader
  title: string
  content: FoldedSessionContent
  seedLength: number
}

export interface PreparedDescendantDescriptor {
  sessionId: SessionId
  parentId: SessionId
  depth: number
  expectedHeader: SessionHeader
  expectedLastSeq: number | null
  seedLength: number
}

export interface SessionExportLineageWarning {
  code: 'INCOMPLETE_LINEAGE'
  unresolvedParentId: SessionId
  message: string
}

export interface PreparedSessionExport {
  root: PreparedSessionRoot
  descendants: PreparedDescendantDescriptor[]
  warnings: SessionExportLineageWarning[]
}

export interface LoadedPreparedDescendant extends FoldedSessionContent {
  inheritedFrom?: SessionId
  inheritedEventCount?: number
}

export class SessionExportConflictError extends Error {
  readonly code = 'SESSION_CHANGED' as const
  override readonly name = 'SessionExportConflictError'
}

interface SessionObservation extends PreparedSessionRoot {
  lastSeq: number | null
}

function conflict(sessionId: SessionId, detail: string, cause?: unknown): SessionExportConflictError {
  return new SessionExportConflictError(
    `session "${sessionId}" changed while preparing the export: ${detail}`,
    cause === undefined ? undefined : { cause },
  )
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted()
}

function assertCompatible(
  sessionId: SessionId,
  expected: SessionHeader,
  observed: SessionHeader,
): void {
  try {
    assertSessionHeadersCompatible(expected, observed)
  } catch (error) {
    throw conflict(sessionId, 'session headers are incompatible', error)
  }
}

function isQueryConflict(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('code' in error)) return false
  return error.code === 'SESSION_QUERY_SESSION_NOT_FOUND'
    || error.code === 'SESSION_QUERY_SOURCE_CONFLICT'
}

async function observeSession(
  query: SessionExportQuery,
  sessionId: SessionId,
  signal?: AbortSignal,
  expectedHeader?: SessionHeader,
): Promise<SessionObservation> {
  try {
    throwIfAborted(signal)
    const log = await query.readSession(sessionId)
    throwIfAborted(signal)

    const surface = await query.readSurface(sessionId)
    throwIfAborted(signal)

    const title = await query.readTitleSnapshot(sessionId, signal)
    throwIfAborted(signal)

    if (expectedHeader !== undefined) assertCompatible(sessionId, expectedHeader, log.session)
    assertCompatible(sessionId, log.session, surface.session)
    assertCompatible(sessionId, log.session, title.session)

    const lastSeq = log.events.at(-1)?.seq ?? null
    if (lastSeq !== surface.capturedThroughSeq) {
      throw conflict(
        sessionId,
        `raw log ended at ${String(lastSeq)} but the surface captured through ${String(surface.capturedThroughSeq)}`,
      )
    }

    const resolvedTitle = title.title?.title ?? sessionId
    return {
      session: structuredClone(log.session),
      title: resolvedTitle,
      content: foldSessionContent({ log, surface, title: resolvedTitle }),
      seedLength: log.session.seedLength ?? 0,
      lastSeq,
    }
  } catch (error) {
    throwIfAborted(signal)
    if (error instanceof SessionExportConflictError) throw error
    if (isQueryConflict(error)) throw conflict(sessionId, 'session data is unavailable or incompatible', error)
    throw error
  }
}

interface FlattenedLineageNode {
  node: SessionLineageNode
  parentId: SessionId
  depth: number
}

function* flattenDescendants(
  nodes: readonly SessionLineageNode[],
  parentId: SessionId,
  depth: number,
  signal?: AbortSignal,
): Iterable<FlattenedLineageNode> {
  for (const node of nodes) {
    throwIfAborted(signal)
    yield { node, parentId, depth }
    yield* flattenDescendants(node.descendants, node.session.header.id, depth + 1, signal)
  }
}

export async function prepareSessionExport(
  query: SessionExportQuery,
  request: PrepareSessionExportRequest,
  signal?: AbortSignal,
): Promise<PreparedSessionExport> {
  throwIfAborted(signal)
  const rootObservation = await observeSession(query, request.sessionId, signal)
  const root: PreparedSessionRoot = {
    session: rootObservation.session,
    title: rootObservation.title,
    content: rootObservation.content,
    seedLength: rootObservation.seedLength,
  }

  if (!request.includeDescendants) {
    return { root, descendants: [], warnings: [] }
  }

  let trace
  try {
    throwIfAborted(signal)
    trace = await query.traceSession(request.sessionId, signal)
    throwIfAborted(signal)
  } catch (error) {
    throwIfAborted(signal)
    if (isQueryConflict(error)) throw conflict(request.sessionId, 'lineage target is unavailable or incompatible', error)
    throw error
  }
  assertCompatible(request.sessionId, root.session, trace.target.header)

  const descendants: PreparedDescendantDescriptor[] = []
  for (const { node, parentId, depth } of flattenDescendants(
    trace.descendants,
    request.sessionId,
    1,
    signal,
  )) {
    throwIfAborted(signal)
    const observed = await observeSession(query, node.session.header.id, signal, node.session.header)
    throwIfAborted(signal)
    descendants.push({
      sessionId: observed.session.id,
      parentId,
      depth,
      expectedHeader: structuredClone(observed.session),
      expectedLastSeq: observed.lastSeq,
      seedLength: observed.seedLength,
    })
  }

  const warnings: SessionExportLineageWarning[] = trace.complete
    ? []
    : [{
        code: 'INCOMPLETE_LINEAGE',
        unresolvedParentId: trace.unresolvedParentId,
        message: `Known lineage is partial: unresolved parent ${trace.unresolvedParentId}`,
      }]

  return { root, descendants, warnings }
}

export async function loadPreparedDescendant(
  query: SessionExportQuery,
  descriptor: PreparedDescendantDescriptor,
  signal?: AbortSignal,
): Promise<LoadedPreparedDescendant> {
  throwIfAborted(signal)
  const observed = await observeSession(query, descriptor.sessionId, signal, descriptor.expectedHeader)
  throwIfAborted(signal)

  if (observed.lastSeq !== descriptor.expectedLastSeq) {
    throw conflict(
      descriptor.sessionId,
      `raw log ended at ${String(observed.lastSeq)} after preflight captured ${String(descriptor.expectedLastSeq)}`,
    )
  }

  const transcript = descriptor.seedLength === 0
    ? observed.content.transcript
    : observed.content.transcript.filter((message) => message.seq >= descriptor.seedLength)

  return {
    ...observed.content,
    transcript,
    ...(descriptor.seedLength === 0
      ? {}
      : {
          inheritedFrom: descriptor.parentId,
          inheritedEventCount: descriptor.seedLength,
        }),
  }
}
