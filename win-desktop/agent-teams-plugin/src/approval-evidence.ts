export interface SessionEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data?: Record<string, unknown>
}

export interface ChatApprovalInput {
  readonly rootCallId: string
  readonly confirmation: string
  readonly planReadyAt: number
}

export interface ChatApprovalEvidence {
  readonly eventSeq: number
  readonly evidenceId: string
}

const APPROVAL_INTENT = /(?:批准|同意|按.{0,12}计划.{0,12}(?:执行|开始)|approve|approved|start|run)/iu
const PLAN_REFERENCE = /(?:计划|方案|团队|team|agentteams)/iu
const APPROVAL_NEGATION = /(?:\b(?:do\s+not|don't|dont|never|cannot|can't|won't|will\s+not|not)\s+(?:to\s+)?(?:approve|approved|start|run)\b|\b(?:refuse|reject|deny|decline|cancel)\s+(?:to\s+)?(?:approve|approved|start|run)\b|(?:不|未|不要|别|拒绝|否决|取消|不予|无需|不需要|不用)\s*(?:批准|同意|通过|按.{0,12}计划.{0,12}(?:执行|开始)|开始|执行|运行|启动)|(?:批准|同意|通过|开始|执行|运行|启动)[^。！？.!?\r\n]{0,20}(?:不了|不行|不要|别|拒绝|取消))/iu

function invalidApproval(): never {
  throw new Error('chat approval requires explicit approval of the plan or Team')
}

function normalizedText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').trim()
}

function textContent(event: SessionEvent): string {
  const content = event.data?.content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block): block is { readonly type: 'text'; readonly text: string } => (
      typeof block === 'object'
      && block !== null
      && (block as { type?: unknown }).type === 'text'
      && typeof (block as { text?: unknown }).text === 'string'
    ))
    .map((block) => block.text)
    .join('\n')
}

export function chatApprovalEvidence(
  events: readonly SessionEvent[],
  input: ChatApprovalInput,
): ChatApprovalEvidence {
  if (!Array.isArray(events) || typeof input.rootCallId !== 'string' || input.rootCallId === '') invalidApproval()
  if (typeof input.confirmation !== 'string' || !Number.isFinite(input.planReadyAt)) invalidApproval()

  const rootCalls = events.filter((event) => (
    event.type === 'tool/call'
    && event.data?.callId === input.rootCallId
    && event.data?.name === 'agent_teams_approve'
  ))
  if (rootCalls.length !== 1) invalidApproval()
  const rootCall = rootCalls[0]
  if (rootCall === undefined || !Number.isFinite(rootCall.seq) || !Number.isFinite(rootCall.time)) invalidApproval()

  const turn = rootCall.data?.turn
  if (typeof turn !== 'number' || !Number.isFinite(turn)) invalidApproval()
  const turnStart = events
    .filter((event) => (
      event.type === 'turn/start'
      && event.data?.turn === turn
      && Number.isFinite(event.seq)
      && event.seq < rootCall.seq
    ))
    .reduce<SessionEvent | undefined>((latest, event) => (
      latest === undefined || event.seq > latest.seq ? event : latest
    ), undefined)
  if (turnStart === undefined) invalidApproval()

  const directUserMessages = events.filter((event) => (
    event.type === 'user/message'
    && event.data?.source !== null
    && typeof event.data?.source === 'object'
    && (event.data.source as { kind?: unknown }).kind === 'user'
    && Number.isFinite(event.seq)
    && event.seq > turnStart.seq
    && event.seq < rootCall.seq
    && Number.isFinite(event.time)
    && event.time <= rootCall.time
  ))
  const message = directUserMessages.reduce<SessionEvent | undefined>((latest, event) => (
    latest === undefined || event.seq > latest.seq ? event : latest
  ), undefined)
  if (message === undefined || message.time < input.planReadyAt) invalidApproval()

  const confirmation = normalizedText(input.confirmation)
  const messageText = normalizedText(textContent(message))
  if (
    messageText === ''
    || messageText !== confirmation
    || APPROVAL_NEGATION.test(messageText)
    || !APPROVAL_INTENT.test(messageText)
    || !PLAN_REFERENCE.test(messageText)
  ) invalidApproval()

  return { eventSeq: message.seq, evidenceId: `chat:user-event:${message.seq}` }
}
