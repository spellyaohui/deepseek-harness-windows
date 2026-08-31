import type { SessionLogSnapshot, SessionSurfaceSnapshot } from '@deepseek-ai/dsh-session-query'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo'

export type ExportBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'image'; mediaType?: string; digest?: string }
  | { type: 'omitted'; originalType: string }

export interface ExportMessage {
  role: 'user' | 'assistant' | 'context'
  source?: string
  form?: string
  seq: number
  time: number
  blocks: ExportBlock[]
  interrupted?: boolean
}

export interface ExportToolFailure {
  seq: number
  time: number
  tool: string
  code: string
  message: string
}

export interface ExportUnfinishedCall {
  seq: number
  time: number
  callId: string
  tool: string
}

export interface ExportRequestConfiguration {
  seq: number
  time: number
  reason: string
  provider: string
  model: string
  reasoningEffort?: string
  maxTokens?: number
  temperature?: number
  system?: string
  tools: string[]
}

export type ExportTodo = TodoItem

export interface ExportOpenTurn {
  turn: number
  seq: number
  time: number
}

export interface ExportTurnEnd {
  turn: number
  seq: number
  time: number
  reason: string
}

export interface FoldSessionContentInput {
  log: SessionLogSnapshot
  surface: SessionSurfaceSnapshot
  title?: string
}

export interface FoldedSessionContent {
  title?: string
  currentSurface: ExportMessage[]
  transcript: ExportMessage[]
  latestRequest?: ExportRequestConfiguration
  requestHistory: ExportRequestConfiguration[]
  latestTodos: ExportTodo[]
  toolFailures: ExportToolFailure[]
  unfinishedCalls: ExportUnfinishedCall[]
  changedFiles: string[]
  latestHumanRequest?: ExportMessage
  latestAssistantText?: string
  turnEnds: ExportTurnEnd[]
  openTurn?: ExportOpenTurn
}
