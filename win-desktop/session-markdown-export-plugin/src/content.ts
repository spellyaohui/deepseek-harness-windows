import { posix as posixPath } from 'node:path'

import type {
  ExportBlock,
  ExportMessage,
  ExportOpenTurn,
  ExportRequestConfiguration,
  ExportTodo,
  ExportToolFailure,
  ExportUnfinishedCall,
  FoldedSessionContent,
  FoldSessionContentInput,
} from './types.ts'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined
}

function isPlainObject(value: unknown): value is UnknownRecord {
  const record = asRecord(value)
  if (!record) return false
  const prototype = Object.getPrototypeOf(record)
  return prototype === Object.prototype || prototype === null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined
}

function foldBlock(block: unknown, assistant: boolean): ExportBlock | undefined {
  const record = asRecord(block)
  const type = asString(record?.type)

  if (type === 'tool-call' && assistant) return undefined
  if (type === 'text') {
    const text = asString(record?.text)
    return text === undefined ? { type: 'omitted', originalType: type } : { type: 'text', text }
  }
  if (type === 'reasoning') {
    const text = asString(record?.text)
    return text === undefined ? { type: 'omitted', originalType: type } : { type: 'reasoning', text }
  }
  if (type === 'image') {
    const attachment = asRecord(record?.attachment)
    const mediaType = asString(attachment?.mediaType)
    const digest = asString(attachment?.digest)
    return {
      type: 'image',
      ...(mediaType === undefined ? {} : { mediaType }),
      ...(digest === undefined ? {} : { digest }),
    }
  }
  return { type: 'omitted', originalType: String(record?.type ?? 'unknown') }
}

function foldBlocks(content: unknown, assistant: boolean): ExportBlock[] {
  if (!Array.isArray(content)) return []
  return content.flatMap((block) => {
    const folded = foldBlock(block, assistant)
    return folded === undefined ? [] : [folded]
  })
}

function foldMessage(event: { type: string; seq: number; time: number; data: unknown }): ExportMessage | undefined {
  const data = asRecord(event.data)
  const message = asRecord(data?.message)
  if (!message) return undefined

  if (event.type === 'assistant/message') {
    return {
      role: 'assistant',
      seq: event.seq,
      time: event.time,
      blocks: foldBlocks(message.content, true),
      ...(data?.interrupted === true ? { interrupted: true } : {}),
    }
  }

  if (event.type !== 'user/message') return undefined
  const source = asRecord(message.source)
  const plugin = source?.kind === 'plugin' ? asString(source.plugin) : undefined
  const form = source?.kind === 'plugin' ? asString(source.form) : undefined
  return {
    role: plugin === undefined ? 'user' : 'context',
    ...(plugin === undefined ? {} : { source: plugin }),
    ...(form === undefined ? {} : { form }),
    seq: event.seq,
    time: event.time,
    blocks: foldBlocks(message.content, false),
  }
}

function foldHeader(event: { seq: number; time: number; data: unknown }): ExportRequestConfiguration | undefined {
  const data = asRecord(event.data)
  const header = asRecord(data?.header)
  const config = asRecord(header?.config)
  const reason = asString(data?.reason)
  const provider = asString(config?.provider)
  const model = asString(config?.model)
  if (!header || !config || reason === undefined || provider === undefined || model === undefined) return undefined

  const tools = Array.isArray(header.tools)
    ? header.tools.flatMap((tool) => {
      const name = asString(asRecord(tool)?.name)
      return name === undefined ? [] : [name]
    })
    : []
  const reasoningEffort = asString(config.reasoningEffort)
  const maxTokens = asNumber(config.maxTokens)
  const temperature = asNumber(config.temperature)
  const system = asString(header.system)

  return {
    seq: event.seq,
    time: event.time,
    reason,
    provider,
    model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(maxTokens === undefined ? {} : { maxTokens }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(system === undefined ? {} : { system }),
    tools,
  }
}

function extractFailureMessage(value: unknown): string | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  if (record.type === 'text') return asString(record.text)
  if (record.type !== 'tool-result') return undefined
  if (!Array.isArray(record.content)) return undefined
  for (const block of record.content) {
    const text = extractFailureMessage(block)
    if (text !== undefined) return text
  }
  return undefined
}

function changedPaths(meta: unknown): string[] {
  if (!isPlainObject(meta) || !Array.isArray(meta.diffs)) return []
  return meta.diffs.flatMap((diff) => {
    const path = asString(asRecord(diff)?.path)
    return path === undefined ? [] : [posixPath.normalize(path.replaceAll('\\', '/'))]
  })
}

export function foldSessionContent(input: FoldSessionContentInput): FoldedSessionContent {
  const transcript: ExportMessage[] = []
  const requestHistory: ExportRequestConfiguration[] = []
  const latestTodos: ExportTodo[] = []
  const toolFailures: ExportToolFailure[] = []
  const pendingCalls = new Map<string, ExportUnfinishedCall>()
  const changedFiles = new Set<string>()
  const openTurns = new Map<number, ExportOpenTurn>()
  let latestHumanRequest: ExportMessage | undefined
  let latestAssistantText: string | undefined

  for (const event of input.log.events) {
    if (event.type === 'user/message' || event.type === 'assistant/message') {
      const folded = foldMessage(event)
      if (!folded) continue
      transcript.push(folded)
      if (folded.role === 'user') latestHumanRequest = folded
      if (folded.role === 'assistant') {
        const text = folded.blocks
          .flatMap((block) => block.type === 'text' ? [block.text] : [])
          .join('\n')
        if (text) latestAssistantText = text
      }
      continue
    }

    if (event.type === 'request/header') {
      const header = foldHeader(event)
      if (header) requestHistory.push(header)
      continue
    }

    if (event.type === 'todo/write') {
      latestTodos.splice(0, latestTodos.length, ...event.data.todos.map((todo) => ({
        content: todo.content,
        status: todo.status,
      })))
      continue
    }

    if (event.type === 'tool/call') {
      pendingCalls.set(event.data.callId, {
        seq: event.seq,
        time: event.time,
        callId: event.data.callId,
        tool: event.data.name,
      })
      continue
    }

    if (event.type === 'tool/result') {
      const callId = event.data.message.source.callId
      const call = pendingCalls.get(callId)
      pendingCalls.delete(callId)
      for (const path of changedPaths(event.data.meta)) changedFiles.add(path)
      if (!event.data.error) continue
      const message = event.data.message.content
        .flatMap((block) => extractFailureMessage(block) === undefined ? [] : [extractFailureMessage(block)])
        .at(0) ?? event.data.error.name
      toolFailures.push({
        seq: event.seq,
        time: event.time,
        tool: call?.tool ?? 'unknown',
        code: event.data.error.code,
        message,
      })
      continue
    }

    if (event.type === 'turn/start') {
      openTurns.set(event.data.turn, { turn: event.data.turn, seq: event.seq, time: event.time })
      continue
    }

    if (event.type === 'turn/end') openTurns.delete(event.data.turn)
  }

  const currentSurface = input.surface.events.flatMap((event) => {
    const folded = foldMessage(event)
    return folded === undefined ? [] : [folded]
  })
  const openTurn = [...openTurns.values()].at(-1)

  return {
    ...(input.title === undefined ? {} : { title: input.title }),
    currentSurface,
    transcript,
    ...(requestHistory.at(-1) === undefined ? {} : { latestRequest: requestHistory.at(-1) }),
    requestHistory,
    latestTodos,
    toolFailures,
    unfinishedCalls: [...pendingCalls.values()],
    changedFiles: [...changedFiles],
    ...(latestHumanRequest === undefined ? {} : { latestHumanRequest }),
    ...(latestAssistantText === undefined ? {} : { latestAssistantText }),
    ...(openTurn === undefined ? {} : { openTurn }),
  }
}
