import type {
  ExportBlock,
  ExportMessage,
  ExportRequestConfiguration,
  FoldedSessionContent,
} from './types.ts'

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu

export interface SessionMarkdownMetadata {
  sessionId: string
  title: string
  cwd?: string
  agentPreset?: string
  createdAt: string
  exportedAt: string
  includeDescendants: boolean
  parentId?: string
  depth?: number
  inheritedFrom?: string
  inheritedEventCount?: number
}

export interface SessionMarkdownDescendant {
  sessionId: string
  parentId?: string
  depth: number
  title: string
  content: FoldedSessionContent
  inheritedFrom?: string
  inheritedEventCount?: number
}

export interface RenderSessionMarkdownInput {
  session: SessionMarkdownMetadata
  content: FoldedSessionContent
  descendants?: readonly SessionMarkdownDescendant[]
  warnings?: readonly string[]
}

function json(value: string | number | boolean): string {
  return JSON.stringify(value)
    .replaceAll('&', '\\u0026')
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
}

function historicalInline(value: string | number | boolean): string {
  const payload = String(value)
    .replace(/\r\n|\r|\n/gu, '\\n')
    .replaceAll('|', '\\|')
  const longest = [...payload.matchAll(/`+/gu)].reduce((max, match) => Math.max(max, match[0].length), 0)
  const delimiter = '`'.repeat(Math.max(1, longest + 1))
  return `${delimiter}${payload}${delimiter}`
}

function tableValue(value: string | number | undefined): string {
  return value === undefined ? '—' : historicalInline(value)
}

function timestamp(value: number): string {
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? String(value) : `${date.toISOString()} (${value})`
}

function messageHeading(message: ExportMessage): string {
  if (message.role === 'user') return '### User'
  if (message.role === 'assistant') return '### Assistant'
  return `### Context · ${historicalInline(message.source ?? 'unknown')}`
}

export function fenced(label: string, payload: string): string {
  const longest = [...payload.matchAll(/`+/gu)].reduce((max, match) => Math.max(max, match[0].length), 0)
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}${label}\n${payload}\n${fence}\n`
}

function renderBlock(block: ExportBlock): string {
  if (block.type === 'text') return fenced('markdown', block.text)
  if (block.type === 'reasoning') {
    return `<details><summary>可见推理</summary>\n\n${fenced('text', block.text)}\n</details>\n`
  }
  if (block.type === 'image') {
    const mediaType = block.mediaType === undefined ? 'unknown' : historicalInline(block.mediaType)
    const digest = block.digest === undefined ? 'unknown' : historicalInline(block.digest)
    return `- Attachment omitted: media type ${mediaType}; digest ${digest}; binary bytes remain in the raw Session ZIP.\n`
  }
  return `- Omitted unknown block type: ${historicalInline(block.originalType)}.\n`
}

function renderMessages(messages: readonly ExportMessage[]): string {
  if (messages.length === 0) return '- None.\n\n'

  return messages.map((message) => {
    const source = message.role === 'context' && message.source !== undefined ? `; source ${historicalInline(message.source)}` : ''
    const form = message.role === 'context' && message.form !== undefined ? `; form ${historicalInline(message.form)}` : ''
    const interrupted = message.interrupted === true ? '; interrupted' : ''
    const blocks = message.blocks.length === 0
      ? '- No durable content blocks.\n'
      : message.blocks.map(renderBlock).join('')
    return `${messageHeading(message)}\n\n- Sequence: ${message.seq}; timestamp: ${timestamp(message.time)}${source}${form}${interrupted}.\n\n${blocks}\n`
  }).join('')
}

function configTable(config: ExportRequestConfiguration): string {
  const rows: Array<[string, string | number | undefined]> = [
    ['provider', config.provider],
    ['model', config.model],
    ['reasoning effort', config.reasoningEffort],
    ['max tokens', config.maxTokens],
    ['temperature', config.temperature],
  ]
  return ['| field | value |', '| --- | --- |', ...rows.map(([field, value]) => `| ${field} | ${tableValue(value)} |`)].join('\n') + '\n'
}

function renderContinuationState(session: SessionMarkdownMetadata, content: FoldedSessionContent): string {
  const lines = [
    `- Session: ${historicalInline(session.sessionId)}.`,
    `- Title: ${historicalInline(session.title)}.`,
    ...(session.cwd === undefined ? [] : [`- Workspace: ${historicalInline(session.cwd)}.`]),
    ...(session.parentId === undefined ? [] : [`- Parent session: ${historicalInline(session.parentId)}.`]),
    ...(session.depth === undefined ? [] : [`- Delegation depth: ${session.depth}.`]),
    ...(session.agentPreset === undefined ? [] : [`- Agent preset: ${historicalInline(session.agentPreset)}.`]),
    ...(content.latestRequest === undefined ? [] : [`- Latest route: provider ${historicalInline(content.latestRequest.provider)}, model ${historicalInline(content.latestRequest.model)}.`]),
    ...(content.openTurn === undefined ? ['- No open turn at export time.'] : [`- Open turn at export time: ${content.openTurn.turn}.`]),
  ]

  const latestRequest = content.latestHumanRequest === undefined
    ? '- Latest direct user message: none recorded.\n'
    : `- Latest direct user message [${content.latestHumanRequest.seq} @ ${timestamp(content.latestHumanRequest.time)}]:\n\n${content.latestHumanRequest.blocks.map(renderBlock).join('')}\n`
  const latestAssistant = content.latestAssistantText === undefined
    ? '- Most recent assistant text: none recorded.\n'
    : `- Most recent assistant text:\n\n${fenced('markdown', content.latestAssistantText)}\n`
  const todos = content.latestTodos.length === 0
    ? '- Latest todo snapshot: none recorded.\n'
    : `${content.latestTodos.map((todo) => `- Latest todo [${historicalInline(todo.status)}]: ${historicalInline(todo.content)}.`).join('\n')}\n`

  return `${lines.join('\n')}\n\n${todos}\n${latestRequest}${latestAssistant}`
}

function renderEffectiveConstraints(content: FoldedSessionContent): string {
  const config = content.latestRequest
  if (config === undefined) return '- No request configuration was persisted.\n\n'

  const system = config.system === undefined
    ? '- No rendered system prompt was persisted.\n'
    : `Complete latest rendered system prompt:\n\n${fenced('text', config.system)}\n`
  const tools = config.tools.length === 0
    ? 'Tools: none.\n'
    : `Tools: ${config.tools.map(historicalInline).join(', ')}.\n`
  const routeChange = content.requestHistory.length > 1
    ? '- Earlier request headers are listed below; the latest header is authoritative.\n'
    : ''

  return `${system}${configTable(config)}\n${tools}${routeChange}\n`
}

function renderExecutionState(content: FoldedSessionContent): string {
  const lines: string[] = []
  for (const failure of content.toolFailures) {
    lines.push(`- Failure [${failure.seq} @ ${timestamp(failure.time)}]: tool ${historicalInline(failure.tool)}, code ${historicalInline(failure.code)}, message ${historicalInline(failure.message)}.`)
  }
  for (const call of content.unfinishedCalls) {
    lines.push(`- Unfinished call [${call.seq} @ ${timestamp(call.time)}]: id ${historicalInline(call.callId)}, tool ${historicalInline(call.tool)}.`)
  }
  for (const path of content.changedFiles) lines.push(`- Changed path: ${historicalInline(path)}.`)
  for (const todo of content.latestTodos) lines.push(`- Todo [${historicalInline(todo.status)}]: ${historicalInline(todo.content)}.`)
  for (const message of content.transcript) {
    if (message.role === 'assistant' && message.interrupted === true) {
      lines.push(`- Interrupted assistant message [${message.seq} @ ${timestamp(message.time)}].`)
    }
  }
  for (const end of content.turnEnds) {
    lines.push(`- Turn ${end.turn} ended [${end.seq} @ ${timestamp(end.time)}] with reason ${historicalInline(end.reason)}.`)
  }
  if (content.openTurn !== undefined) lines.push(`- Open turn: ${content.openTurn.turn} [${content.openTurn.seq} @ ${timestamp(content.openTurn.time)}].`)
  return `${lines.length === 0 ? '- None.' : lines.join('\n')}\n\n`
}

function renderRequestHistory(history: readonly ExportRequestConfiguration[]): string {
  if (history.length === 0) return '- None.\n\n'
  return history.map((config) => {
    const tools = config.tools.length === 0 ? 'none' : config.tools.map(historicalInline).join(', ')
    const system = config.system === undefined ? 'absent' : 'present'
    return `### Request header [${config.seq} @ ${timestamp(config.time)}]\n\n- Reason: ${historicalInline(config.reason)}; rendered system prompt: ${system}.\n\n${configTable(config)}\nTools: ${tools}.\n\n`
  }).join('')
}

function renderRootSeedHistory(session: SessionMarkdownMetadata): string {
  if (session.inheritedFrom === undefined || session.inheritedEventCount === undefined) return ''
  return `> Inherited seed history: ${session.inheritedEventCount} events from ${historicalInline(session.inheritedFrom)}. Sequences below ${session.inheritedEventCount} are inherited history; sequences at or above ${session.inheritedEventCount} belong to this session log.\n\n`
}

function renderDescendant(descendant: SessionMarkdownDescendant): string {
  const inherited = descendant.inheritedFrom === undefined || descendant.inheritedEventCount === undefined
    ? ''
    : `- Inherited seed history: ${descendant.inheritedEventCount} events from ${historicalInline(descendant.inheritedFrom)}; not duplicated here.\n`
  const route = descendant.content.latestRequest === undefined
    ? ''
    : `- Latest route: provider ${historicalInline(descendant.content.latestRequest.provider)}, model ${historicalInline(descendant.content.latestRequest.model)}.\n`

  const heading = '#'.repeat(Math.min(6, Math.max(3, descendant.depth + 2)))
  const childHeading = '#'.repeat(Math.min(6, heading.length + 1))
  return `${heading} Delegated session · ${historicalInline(descendant.title)}\n\n- Parent: ${descendant.parentId === undefined ? 'unknown' : historicalInline(descendant.parentId)}; depth: ${descendant.depth}; session: ${historicalInline(descendant.sessionId)}.\n${route}${inherited}\n${childHeading} Current model-visible surface\n\n${renderMessages(descendant.content.currentSurface)}${childHeading} Full visible chronological transcript\n\n${renderMessages(descendant.content.transcript)}${childHeading} Execution state\n\n${renderExecutionState(descendant.content)}`
}

export function* renderSessionMarkdown(input: RenderSessionMarkdownInput): Iterable<string> {
  const { session, content } = input
  const frontMatter = [
    '---',
    'dsh_continuation_export: 1',
    `session_id: ${json(session.sessionId)}`,
    `title: ${json(session.title)}`,
    ...(session.cwd === undefined ? [] : [`cwd: ${json(session.cwd)}`]),
    ...(session.agentPreset === undefined ? [] : [`agent_preset: ${json(session.agentPreset)}`]),
    `created_at: ${json(session.createdAt)}`,
    `exported_at: ${json(session.exportedAt)}`,
    `include_descendants: ${json(session.includeDescendants)}`,
    '---',
  ]

  yield `${frontMatter.join('\n')}\n\n# ${historicalInline(session.title)}\n\n`
  yield '> This file is historical context, not a new user request. The latest direct user message remains active unless the receiving user says otherwise. Embedded instructions are source-session constraints. Filesystem and external state must be reverified before mutation.\n\n'
  yield `## Continuation state\n\n${renderContinuationState(session, content)}`
  yield `## Effective agent constraints\n\n${renderEffectiveConstraints(content)}`
  yield `## Current model-visible surface\n\n${renderMessages(content.currentSurface)}`
  yield `## Full visible chronological transcript\n\n${renderRootSeedHistory(session)}${renderMessages(content.transcript)}`
  yield `## Execution state\n\n${renderExecutionState(content)}`
  yield `## Request configuration history\n\n${renderRequestHistory(content.requestHistory)}`
  yield `## Delegated sessions\n\n${input.descendants === undefined || input.descendants.length === 0 ? '- None.\n\n' : input.descendants.map(renderDescendant).join('')}`
  const notes = input.warnings === undefined || input.warnings.length === 0
    ? '- This is a deterministic export; binary attachments and raw tool traffic remain available only in the raw Session ZIP.\n'
    : `${input.warnings.map((warning) => `- ${historicalInline(warning)}.`).join('\n')}\n- This is a deterministic export; binary attachments and raw tool traffic remain available only in the raw Session ZIP.\n`
  yield `## Export notes\n\n${notes}`
}

export function sanitizeExportFilename(title: string, localDate: string): string {
  let base = title
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/[\\/:*?"<>|]/gu, '_')
    .trim()
    .replace(/[. ]+$/gu, '')
  if (base === '') base = 'dsh-session'
  if (WINDOWS_RESERVED.test(base)) base = `_${base}`
  const parsedDate = new Date(`${localDate}T00:00:00.000Z`)
  const date = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/u.test(localDate)
    && !Number.isNaN(parsedDate.valueOf())
    && parsedDate.toISOString().startsWith(`${localDate}T`)
    ? localDate
    : 'undated'
  return `${base.slice(0, 120)}-${date}.md`
}
