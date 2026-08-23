import { once } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'

import { SessionId, type SessionHeader } from '@deepseek-ai/dsh-session'

import {
  loadPreparedDescendant,
  prepareSessionExport,
  SessionExportConflictError,
  type LoadedPreparedDescendant,
  type PreparedDescendantDescriptor,
  type PreparedSessionExport,
  type SessionExportQuery,
} from './session-export.ts'
import {
  renderSessionMarkdown,
  sanitizeExportFilename,
  type RenderSessionMarkdownInput,
  type SessionMarkdownDescendant,
} from './render-markdown.ts'

export const SESSION_MARKDOWN_EXPORT_PATH = '/api/session.export-markdown'

const INCOMPLETE_MARKER = '\n## EXPORT INCOMPLETE\n\nThe export stopped before every validated section was written. Re-run the export and do not treat this file as a complete continuation package.\n'

type ExportHttpErrorCode =
  | 'INVALID_REQUEST'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CONFLICT'
  | 'EXPORT_FAILED'

export interface ExportHttpErrorBody {
  error: {
    code: ExportHttpErrorCode
    message: string
  }
}

export interface SessionMarkdownExportHandlerOptions {
  query: SessionExportQuery
  now?: () => Date
  logError?: (error: Error) => void
}

interface ParsedExportRequest {
  sessionId: SessionId
  includeDescendants: boolean
}

interface ErrorResponse {
  status: 400 | 404 | 409 | 500
  body: ExportHttpErrorBody
}

function errorBody(code: ExportHttpErrorCode, message: string): ExportHttpErrorBody {
  return { error: { code, message } }
}

function parseRequest(req: IncomingMessage): ParsedExportRequest | undefined {
  let url: URL
  try {
    url = new URL(req.url ?? '/', 'http://127.0.0.1')
  } catch {
    return undefined
  }

  const allowed = new Set(['sessionId', 'includeDescendants'])
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) return undefined
  }

  const sessionIds = url.searchParams.getAll('sessionId')
  if (sessionIds.length !== 1 || sessionIds[0] === '') return undefined

  const descendantValues = url.searchParams.getAll('includeDescendants')
  if (descendantValues.length > 1) return undefined
  const descendantValue = descendantValues[0]
  if (descendantValue !== undefined && descendantValue !== 'true' && descendantValue !== 'false') {
    return undefined
  }

  return {
    sessionId: SessionId(sessionIds[0]!),
    includeDescendants: descendantValue === undefined ? true : descendantValue === 'true',
  }
}

function localDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function asciiFilename(filename: string): string {
  return filename.replace(/[^\x20-\x7e]/gu, '_')
}

function contentHeaders(title: string, exportedAt: Date): Record<string, string> {
  const filename = sanitizeExportFilename(title, localDate(exportedAt))
  const asciiFallback = asciiFilename(filename)
  return {
    'content-type': 'text/markdown; charset=utf-8',
    'content-disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  }
}

function jsonResponse(
  res: ServerResponse,
  status: number,
  body: ExportHttpErrorBody,
  headers: Record<string, string> = {},
  omitBody = false,
): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  res.end(omitBody ? undefined : JSON.stringify(body))
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function errorCode(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object' || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function errorCause(error: unknown): unknown {
  if (error === null || typeof error !== 'object' || !('cause' in error)) return undefined
  return error.cause
}

function isMissingRoot(error: unknown, sessionId: SessionId): boolean {
  const expectedMessage = `session "${sessionId}" not found`
  let current: unknown = error
  while (current !== undefined) {
    if (errorCode(current) === 'SESSION_QUERY_SESSION_NOT_FOUND'
      && current instanceof Error
      && current.message === expectedMessage) {
      return true
    }
    current = errorCause(current)
  }
  return false
}

function mapError(error: unknown, sessionId: SessionId): ErrorResponse {
  if (isMissingRoot(error, sessionId)) {
    return { status: 404, body: errorBody('SESSION_NOT_FOUND', 'Session not found') }
  }

  const code = errorCode(error)
  if (error instanceof SessionExportConflictError
    || code === 'SESSION_CHANGED'
    || code === 'SESSION_QUERY_SOURCE_CONFLICT'
    || code === 'SESSION_QUERY_INVALID_LINEAGE'
    || code === 'SESSION_QUERY_CORRUPT_SESSION') {
    return {
      status: 409,
      body: errorBody('SESSION_CONFLICT', 'Session changed or is incompatible'),
    }
  }

  return { status: 500, body: errorBody('EXPORT_FAILED', 'Session export failed') }
}

function metadata(header: SessionHeader, title: string, includeDescendants: boolean, exportedAt: Date) {
  return {
    sessionId: header.id,
    title,
    ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
    ...(header.agentPreset === undefined ? {} : { agentPreset: header.agentPreset }),
    createdAt: new Date(header.createdAt).toISOString(),
    exportedAt: exportedAt.toISOString(),
    includeDescendants,
  }
}

function descendant(
  descriptor: PreparedDescendantDescriptor,
  loaded: LoadedPreparedDescendant,
): SessionMarkdownDescendant {
  return {
    sessionId: descriptor.sessionId,
    parentId: descriptor.parentId,
    depth: descriptor.depth,
    title: loaded.title ?? descriptor.sessionId,
    content: loaded,
    ...(loaded.inheritedFrom === undefined ? {} : { inheritedFrom: loaded.inheritedFrom }),
    ...(loaded.inheritedEventCount === undefined
      ? {}
      : { inheritedEventCount: loaded.inheritedEventCount }),
  }
}

function renderInput(
  prepared: PreparedSessionExport,
  includeDescendants: boolean,
  exportedAt: Date,
  descendants: readonly SessionMarkdownDescendant[],
): RenderSessionMarkdownInput {
  return {
    session: metadata(prepared.root.session, prepared.root.title, includeDescendants, exportedAt),
    content: prepared.root.content,
    descendants,
    warnings: prepared.warnings.map((warning) => warning.message),
  }
}

function responseWritable(res: ServerResponse): boolean {
  return !res.destroyed && !res.writableEnded && res.writable
}

async function writeChunk(
  res: ServerResponse,
  chunk: string,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  if (res.write(chunk)) return
  if (signal === undefined) {
    await once(res, 'drain')
    return
  }
  await once(res, 'drain', { signal })
}

async function completeHeadPreflight(
  query: SessionExportQuery,
  prepared: PreparedSessionExport,
  signal: AbortSignal,
): Promise<void> {
  for (const descriptor of prepared.descendants) {
    signal.throwIfAborted()
    await loadPreparedDescendant(query, descriptor, signal)
  }
}

async function streamGet(
  res: ServerResponse,
  query: SessionExportQuery,
  prepared: PreparedSessionExport,
  request: ParsedExportRequest,
  exportedAt: Date,
  signal: AbortSignal,
): Promise<void> {
  const descendants: SessionMarkdownDescendant[] = []
  const iterator = renderSessionMarkdown(
    renderInput(prepared, request.includeDescendants, exportedAt, descendants),
  )[Symbol.iterator]()

  // Task 3's generator reads descendants only when it reaches that section.
  // Emit its first chunk now, then populate the shared list sequentially so a
  // late descendant failure becomes an explicit partial-download marker.
  const first = iterator.next()
  if (!first.done) await writeChunk(res, first.value, signal)

  for (const descriptor of prepared.descendants) {
    signal.throwIfAborted()
    const loaded = await loadPreparedDescendant(query, descriptor, signal)
    signal.throwIfAborted()
    descendants.push(descendant(descriptor, loaded))
  }

  for (let next = iterator.next(); !next.done; next = iterator.next()) {
    signal.throwIfAborted()
    await writeChunk(res, next.value, signal)
  }
  res.end()
}

function abortRequest(req: IncomingMessage, controller: AbortController): () => void {
  const abort = (): void => {
    if (!controller.signal.aborted) controller.abort(new Error('session export request aborted'))
  }
  const close = (): void => {
    if (req.aborted || !req.complete) abort()
  }
  req.once('aborted', abort)
  req.once('close', close)
  if (req.aborted) abort()
  return () => {
    req.off('aborted', abort)
    req.off('close', close)
  }
}

export function createSessionMarkdownExportHandler(
  options: SessionMarkdownExportHandlerOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const now = options.now ?? (() => new Date())
  const logError = options.logError ?? (() => {})

  return async (req, res) => {
    if (req.method !== 'HEAD' && req.method !== 'GET') {
      jsonResponse(
        res,
        405,
        errorBody('INVALID_REQUEST', 'Method not allowed'),
        { allow: 'HEAD, GET' },
      )
      return
    }

    const request = parseRequest(req)
    if (request === undefined) {
      jsonResponse(
        res,
        400,
        errorBody('INVALID_REQUEST', 'Invalid session export request'),
        {},
        req.method === 'HEAD',
      )
      return
    }

    const controller = new AbortController()
    const detachAbort = abortRequest(req, controller)
    let bodyStarted = false
    try {
      const exportedAt = now()
      controller.signal.throwIfAborted()
      const prepared = await prepareSessionExport(options.query, request, controller.signal)
      controller.signal.throwIfAborted()

      if (req.method === 'HEAD') {
        await completeHeadPreflight(options.query, prepared, controller.signal)
        controller.signal.throwIfAborted()
        res.writeHead(200, contentHeaders(prepared.root.title, exportedAt))
        res.end()
        return
      }

      res.writeHead(200, contentHeaders(prepared.root.title, exportedAt))
      bodyStarted = true
      await streamGet(
        res,
        options.query,
        prepared,
        request,
        exportedAt,
        controller.signal,
      )
    } catch (error) {
      if (controller.signal.aborted) {
        if (responseWritable(res)) res.end()
        return
      }

      logError(asError(error))
      if (bodyStarted || res.headersSent) {
        if (responseWritable(res)) {
          try {
            await writeChunk(res, INCOMPLETE_MARKER)
          } catch {
            // The response became unwritable while reporting the partial export.
          }
          if (responseWritable(res)) res.end()
        }
        return
      }

      const mapped = mapError(error, request.sessionId)
      jsonResponse(res, mapped.status, mapped.body, {}, req.method === 'HEAD')
    } finally {
      detachAbort()
    }
  }
}
