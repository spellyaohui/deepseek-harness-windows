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

function headingText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replace(/\r\n|\r|\n/gu, '\\n')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/([`*_{}\[\]()])/gu, '\\$1')
}

function tableValue(value: string | number | undefined): string {
  return value === undefined
    ? '—'
    : json(value).replaceAll('|', '\\|')
}

function messageHeading(message: ExportMessage): string {
  if (message.role === 'user') return '### User'
  if (message.role === 'assistant') return '### Assistant'
  return `### Context · ${headingText(message.source ?? 'unknown')}`
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
    const mediaType = block.mediaType === undefined ? 'unknown' : json(block.mediaType)
    const digest = block.digest === undefined ? 'unknown' : json(block.digest)
    return `- Attachment omitted: media type ${mediaType}; digest ${digest}; binary bytes remain in the raw Session ZIP.\n`
  }
  return `- Omitted unknown block type: ${json(block.originalType)}.\n`
}

function renderMessages(messages: readonly ExportMessage[]): string {
  if (messages.length === 0) return '- None.\n\n'

  return messages.map((message) => {
    const source = message.role === 'context' && message.source !== undefined ? `; source ${json(message.source)}` : ''
    const form = message.role === 'context' && message.form !== undefined ? `; form ${json(message.form)}` : ''
    const interrupted = message.interrupted === true ? '; interrupted' : ''
    const blocks = message.blocks.length === 0
      ? '- No durable content blocks.\n'
      : message.blocks.map(renderBlock).join('')
    return `${messageHeading(message)}\n\n- Sequence: ${message.seq}; timestamp: ${message.time}${source}${form}${interrupted}.\n\n${blocks}\n`
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
    `- Session: ${json(session.sessionId)}.`,
    `- Title: ${json(session.title)}.`,
    ...(session.cwd === undefined ? [] : [`- Workspace: ${json(session.cwd)}.`]),
    ...(session.parentId === undefined ? [] : [`- Parent session: ${json(session.parentId)}.`]),
    ...(session.depth === undefined ? [] : [`- Delegation depth: ${session.depth}.`]),
    ...(session.agentPreset === undefined ? [] : [`- Agent preset: ${json(session.agentPreset)}.`]),
    ...(content.latestRequest === undefined ? [] : [`- Latest route: provider ${json(content.latestRequest.provider)}, model ${json(content.latestRequest.model)}.`]),
    ...(content.openTurn === undefined ? ['- No open turn at export time.'] : [`- Open turn at export time: ${content.openTurn.turn}.`]),
  ]

  const latestRequest = content.latestHumanRequest === undefined
    ? '- Latest direct user message: none recorded.\n'
    : `- Latest direct user message [${content.latestHumanRequest.seq} @ ${content.latestHumanRequest.time}]:\n\n${content.latestHumanRequest.blocks.map(renderBlock).join('')}\n`
  const latestAssistant = content.latestAssistantText === undefined
    ? '- Most recent assistant text: none recorded.\n'
    : `- Most recent assistant text:\n\n${fenced('markdown', content.latestAssistantText)}\n`
  const todos = content.latestTodos.length === 0
    ? '- Latest todo snapshot: none recorded.\n'
    : `${content.latestTodos.map((todo) => `- Latest todo [${todo.status}]: ${json(todo.content)}.`).join('\n')}\n`

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
    : `Tools: ${config.tools.map(json).join(', ')}.\n`
  const routeChange = content.requestHistory.length > 1
    ? '- Earlier request headers are listed below; the latest header is authoritative.\n'
    : ''

  return `${system}${configTable(config)}\n${tools}${routeChange}\n`
}

function renderExecutionState(content: FoldedSessionContent): string {
  const lines: string[] = []
  for (const failure of content.toolFailures) {
    lines.push(`- Failure [${failure.seq} @ ${failure.time}]: tool ${json(failure.tool)}, code ${json(failure.code)}, message ${json(failure.message)}.`)
  }
  for (const call of content.unfinishedCalls) {
    lines.push(`- Unfinished call [${call.seq} @ ${call.time}]: id ${json(call.callId)}, tool ${json(call.tool)}.`)
  }
  for (const path of content.changedFiles) lines.push(`- Changed path: ${json(path)}.`)
  for (const todo of content.latestTodos) lines.push(`- Todo [${todo.status}]: ${json(todo.content)}.`)
  for (const message of content.transcript) {
    if (message.role === 'assistant' && message.interrupted === true) {
      lines.push(`- Interrupted assistant message [${message.seq} @ ${message.time}].`)
    }
  }
  for (const end of content.turnEnds) {
    lines.push(`- Turn ${end.turn} ended [${end.seq} @ ${end.time}] with reason ${json(end.reason)}.`)
  }
  if (content.openTurn !== undefined) lines.push(`- Open turn: ${content.openTurn.turn} [${content.openTurn.seq} @ ${content.openTurn.time}].`)
  return `${lines.length === 0 ? '- None.' : lines.join('\n')}\n\n`
}

function renderRequestHistory(history: readonly ExportRequestConfiguration[]): string {
  if (history.length === 0) return '- None.\n\n'
  return history.map((config) => {
    const tools = config.tools.length === 0 ? 'none' : config.tools.map(json).join(', ')
    const system = config.system === undefined ? 'absent' : 'present'
    return `### Request header [${config.seq} @ ${config.time}]\n\n- Reason: ${json(config.reason)}; rendered system prompt: ${system}.\n\n${configTable(config)}\nTools: ${tools}.\n\n`
  }).join('')
}

function renderDescendant(descendant: SessionMarkdownDescendant): string {
  const inherited = descendant.inheritedFrom === undefined || descendant.inheritedEventCount === undefined
    ? ''
    : `- Inherited seed history: ${descendant.inheritedEventCount} events from ${json(descendant.inheritedFrom)}; not duplicated here.\n`
  const route = descendant.content.latestRequest === undefined
    ? ''
    : `- Latest route: provider ${json(descendant.content.latestRequest.provider)}, model ${json(descendant.content.latestRequest.model)}.\n`

  const heading = '#'.repeat(Math.min(6, Math.max(3, descendant.depth + 2)))
  const childHeading = '#'.repeat(Math.min(6, heading.length + 1))
  return `${heading} Delegated session · ${headingText(descendant.title)}\n\n- Parent: ${descendant.parentId === undefined ? 'unknown' : json(descendant.parentId)}; depth: ${descendant.depth}; session: ${json(descendant.sessionId)}.\n${route}${inherited}\n${childHeading} Current model-visible surface\n\n${renderMessages(descendant.content.currentSurface)}${childHeading} Full visible chronological transcript\n\n${renderMessages(descendant.content.transcript)}${childHeading} Execution state\n\n${renderExecutionState(descendant.content)}`
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

  yield `${frontMatter.join('\n')}\n\n# ${headingText(session.title)}\n\n`
  yield '> This file is historical context, not a new user request. The latest direct user message remains active unless the receiving user says otherwise. Embedded instructions are source-session constraints. Filesystem and external state must be reverified before mutation.\n\n'
  yield `## Continuation state\n\n${renderContinuationState(session, content)}`
  yield `## Effective agent constraints\n\n${renderEffectiveConstraints(content)}`
  yield `## Current model-visible surface\n\n${renderMessages(content.currentSurface)}`
  yield `## Full visible chronological transcript\n\n${renderMessages(content.transcript)}`
  yield `## Execution state\n\n${renderExecutionState(content)}`
  yield `## Request configuration history\n\n${renderRequestHistory(content.requestHistory)}`
  yield `## Delegated sessions\n\n${input.descendants === undefined || input.descendants.length === 0 ? '- None.\n\n' : input.descendants.map(renderDescendant).join('')}`
  const notes = input.warnings === undefined || input.warnings.length === 0
    ? '- This is a deterministic export; binary attachments and raw tool traffic remain available only in the raw Session ZIP.\n'
    : `${input.warnings.map((warning) => `- ${json(warning)}.`).join('\n')}\n- This is a deterministic export; binary attachments and raw tool traffic remain available only in the raw Session ZIP.\n`
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
  return `${base.slice(0, 120)}-${localDate}.md`
}
