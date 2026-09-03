#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { automaticTeamName } from '../lib/team-name.js'
import { chatApprovalEvidence } from '../lib/approval-evidence.js'
import { createApprovalCredentialStore } from '../lib/approval-credentials.js'
import { expectedPlanRevisionFromPayload } from '../lib/staged-plan-payload.js'

const reviewFailures = []
function reviewCase(name, action) {
  try {
    action()
  } catch (error) {
    reviewFailures.push(new Error(`${name}: ${error instanceof Error ? error.message : String(error)}`))
  }
}

assert.equal(
  automaticTeamName('审查 AgentTeams 审批异常。不得连接生产', 'a1b2c3'),
  '审查-AgentTeams-审批异常-a1b2c3',
)
assert.equal(automaticTeamName(undefined, 'a1b2c3'), 'agent-team-a1b2c3')
assert.equal(automaticTeamName('检查患者姓名张三及住院号123456', 'a1b2c3'), 'agent-team-a1b2c3')
assert.equal(expectedPlanRevisionFromPayload({ expectedPlanRevision: 4 }), 4)
for (const invalid of [undefined, null, '', '4', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(
    () => expectedPlanRevisionFromPayload({ expectedPlanRevision: invalid }),
    /positive safe integer/,
  )
}

const events = [
  { type: 'turn/start', seq: 10, time: 100, data: { turn: 3 } },
  {
    type: 'user/message',
    seq: 11,
    time: 101,
    data: {
      source: { kind: 'user' },
      content: [{ type: 'text', text: '批准这个 AgentTeams 计划开始执行' }],
    },
  },
  { type: 'step/start', seq: 12, time: 102, data: { turn: 3, step: 0 } },
  {
    type: 'tool/call',
    seq: 13,
    time: 103,
    data: { turn: 3, step: 0, callId: 'root-1', name: 'agent_teams_approve', arguments: '{}' },
  },
]
assert.deepEqual(
  chatApprovalEvidence(events, {
    rootCallId: 'root-1',
    confirmation: '批准这个 AgentTeams 计划开始执行',
    planReadyAt: 100,
  }),
  { eventSeq: 11, evidenceId: 'chat:user-event:11' },
)
assert.equal('messageText' in chatApprovalEvidence(events, {
  rootCallId: 'root-1',
  confirmation: '批准这个 AgentTeams 计划开始执行',
  planReadyAt: 100,
}), false, 'approval evidence does not expose message text')

const affirmativeEnglishEvents = events.map((event) => event.type === 'user/message'
  ? { ...event, data: { ...event.data, content: [{ type: 'text', text: 'I approve the AgentTeams plan' }] } }
  : event)
assert.deepEqual(
  chatApprovalEvidence(affirmativeEnglishEvents, {
    rootCallId: 'root-1',
    confirmation: 'I approve the AgentTeams plan',
    planReadyAt: 100,
  }),
  { eventSeq: 11, evidenceId: 'chat:user-event:11' },
  'affirmative English approval authorizes the matching plan',
)

const genericEvents = events.map((event) => event.type === 'user/message'
  ? { ...event, data: { ...event.data, content: [{ type: 'text', text: '继续' }] } }
  : event)
assert.throws(
  () => chatApprovalEvidence(genericEvents, {
    rootCallId: 'root-1',
    confirmation: '继续',
    planReadyAt: 100,
  }),
  /explicit approval.*plan or Team/i,
)

for (const [label, confirmation] of [
  ['Chinese negation', '不批准这个 AgentTeams 计划开始执行'],
  ['English negation', 'do not start the AgentTeams plan'],
  ['English reject with intervening words', 'I reject starting the AgentTeams plan'],
  ['English refuse with intervening words', 'I refuse the AgentTeams plan to start'],
  ['Chinese refusal with intervening words', '我拒绝去批准这个 AgentTeams 计划开始执行'],
  ['Chinese disagreement with intervening words', '我不同意这个 AgentTeams 计划开始执行'],
  ['English disapproval cannot match approve substring', 'I disapprove the AgentTeams plan'],
  ['Chinese opposition refuses approval', '我反对批准这个 AgentTeams 计划开始执行'],
  ['English says no with intervening words', 'I say no to starting the AgentTeams plan'],
  ['English disagreement with intervening words', 'I disagree with starting the AgentTeams plan'],
]) {
  const negatedEvents = events.map((event) => event.type === 'user/message'
    ? { ...event, data: { ...event.data, content: [{ type: 'text', text: confirmation }] } }
    : event)
  reviewCase(`${label} cannot authorize approval`, () => {
    assert.throws(() => chatApprovalEvidence(negatedEvents, {
      rootCallId: 'root-1',
      confirmation,
      planReadyAt: 100,
    }), /explicit approval.*plan or Team/i)
  })
}

for (const confirmation of ['继续', '确认', 'continue', 'confirm']) {
  reviewCase(`generic acknowledgement ${confirmation} cannot authorize approval`, () => {
    const genericConfirmationEvents = events.map((event) => event.type === 'user/message'
      ? { ...event, data: { ...event.data, content: [{ type: 'text', text: confirmation }] } }
      : event)
    assert.throws(() => chatApprovalEvidence(genericConfirmationEvents, {
      rootCallId: 'root-1',
      confirmation,
      planReadyAt: 100,
    }), /explicit approval.*plan or Team/i)
  })
}

for (const confirmation of [
  'Can you start the AgentTeams plan?',
  'The AgentTeams plan will run now',
  'I approve discussing whether to start the AgentTeams plan',
]) {
  reviewCase(`ambiguous natural prose ${confirmation} cannot authorize approval`, () => {
    const ambiguousEvents = events.map((event) => event.type === 'user/message'
      ? { ...event, data: { ...event.data, content: [{ type: 'text', text: confirmation }] } }
      : event)
    assert.throws(() => chatApprovalEvidence(ambiguousEvents, {
      rootCallId: 'root-1',
      confirmation,
      planReadyAt: 100,
    }), /explicit approval.*plan or Team/i)
  })
}

for (const [label, confirmation] of [
  ['Chinese interrogative whether form', '按这个计划是否执行'],
  ['Chinese interrogative ability form', '按这个计划能否开始'],
  ['Chinese conditional form', '按这个计划可以开始'],
  ['Chinese discussion form', '按这个计划讨论是否执行'],
]) {
  reviewCase(`${label} cannot authorize approval`, () => {
    const ambiguousChineseEvents = events.map((event) => event.type === 'user/message'
      ? { ...event, data: { ...event.data, content: [{ type: 'text', text: confirmation }] } }
      : event)
    assert.throws(() => chatApprovalEvidence(ambiguousChineseEvents, {
      rootCallId: 'root-1',
      confirmation,
      planReadyAt: 100,
    }), /explicit approval.*plan or Team/i)
  })
}

reviewCase('medical patient terms fail closed', () => {
  assert.equal(automaticTeamName('复核病人检查结果', 'a1b2c3'), 'agent-team-a1b2c3')
})
reviewCase('medical diagnosis terms fail closed', () => {
  assert.equal(automaticTeamName('整理诊断报告', 'a1b2c3'), 'agent-team-a1b2c3')
})
reviewCase('English medical-record terms fail closed', () => {
  assert.equal(automaticTeamName('Review medical record export', 'a1b2c3'), 'agent-team-a1b2c3')
})
reviewCase('URLs are scrubbed before sentence selection', () => {
  assert.equal(
    automaticTeamName('修复 https://example.com/path 接口超时。不得联网', 'a1b2c3'),
    '修复-接口超时-a1b2c3',
  )
})
reviewCase('email addresses are scrubbed before sentence selection', () => {
  assert.equal(
    automaticTeamName('联系 admin@example.com 处理通知', 'a1b2c3'),
    '联系-处理通知-a1b2c3',
  )
})
reviewCase('UUIDs are scrubbed', () => {
  assert.equal(
    automaticTeamName('排查 550e8400-e29b-41d4-a716-446655440000 启动失败', 'a1b2c3'),
    '排查-启动失败-a1b2c3',
  )
})
reviewCase('long numbers are scrubbed', () => {
  assert.equal(automaticTeamName('排查订单 1234567890123456 失败', 'a1b2c3'), '排查订单-失败-a1b2c3')
})
reviewCase('short prefixed tokens are scrubbed', () => {
  assert.equal(automaticTeamName('修复 sk-AbC123xYz 接口', 'a1b2c3'), '修复-接口-a1b2c3')
})
reviewCase('readable non-sensitive names remain readable', () => {
  assert.equal(automaticTeamName('修复 AgentTeams 审批异常', 'a1b2c3'), '修复-AgentTeams-审批异常-a1b2c3')
})
reviewCase('化验单 context fails closed', () => {
  assert.equal(automaticTeamName('整理化验单张三结果', 'a1b2c3'), 'agent-team-a1b2c3')
})
reviewCase('病例 context fails closed', () => {
  assert.equal(automaticTeamName('归档病例李四资料', 'a1b2c3'), 'agent-team-a1b2c3')
})
reviewCase('patient name plus 检查结果 context fails closed', () => {
  assert.equal(automaticTeamName('张三检查结果', 'a1b2c3'), 'agent-team-a1b2c3')
})

const imageAuthoredEvents = events.map((event) => event.type === 'user/message'
  ? { ...event, data: { ...event.data, content: [{ type: 'image', text: '批准这个 AgentTeams 计划开始执行' }] } }
  : event)
reviewCase('image blocks cannot authorize approval', () => {
  assert.throws(() => chatApprovalEvidence(imageAuthoredEvents, {
    rootCallId: 'root-1',
    confirmation: '批准这个 AgentTeams 计划开始执行',
    planReadyAt: 100,
  }), /explicit approval.*plan or Team/i)
})

const pluginBlockEvents = events.map((event) => event.type === 'user/message'
  ? { ...event, data: { ...event.data, content: [{ type: 'plugin-result', text: '批准这个 AgentTeams 计划开始执行' }] } }
  : event)
reviewCase('plugin content blocks cannot authorize approval', () => {
  assert.throws(() => chatApprovalEvidence(pluginBlockEvents, {
    rootCallId: 'root-1',
    confirmation: '批准这个 AgentTeams 计划开始执行',
    planReadyAt: 100,
  }), /explicit approval.*plan or Team/i)
})

for (const sourceKind of ['plugin', 'model']) {
  const authoredEvents = events.map((event) => event.type === 'user/message'
    ? { ...event, data: { ...event.data, source: { kind: sourceKind } } }
    : event)
  reviewCase(`${sourceKind}-authored messages cannot authorize approval`, () => {
    assert.throws(() => chatApprovalEvidence(authoredEvents, {
      rootCallId: 'root-1',
      confirmation: '批准这个 AgentTeams 计划开始执行',
      planReadyAt: 100,
    }), /explicit approval.*plan or Team/i)
  })
}

const nonUserMessageEvents = events.map((event) => event.type === 'user/message'
  ? {
      ...event,
      type: 'assistant/message',
      data: {
        ...event.data,
        source: { kind: 'user' },
        content: [{ type: 'text', text: '批准这个 AgentTeams 计划开始执行' }],
      },
    }
  : event)
reviewCase('non-user/message events cannot authorize approval', () => {
  assert.throws(() => chatApprovalEvidence(nonUserMessageEvents, {
    rootCallId: 'root-1',
    confirmation: '批准这个 AgentTeams 计划开始执行',
    planReadyAt: 100,
  }), /explicit approval.*plan or Team/i)
})

reviewCase('JWT-like tokens are scrubbed from automatic names', () => {
  assert.equal(
    automaticTeamName(
      '处理 eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature 接口',
      'a1b2c3',
    ),
    '处理-接口-a1b2c3',
  )
})

let now = 1_000
function assertInvalidWithoutToken(action, token) {
  assert.throws(action, (error) => (
    error instanceof Error
    && /invalid or already consumed/i.test(error.message)
    && !error.message.includes(token)
  ))
}

const credentials = createApprovalCredentialStore({
  now: () => now,
  randomToken: () => 'secret-token',
  randomReceiptId: () => 'receipt-1',
  ttlMs: 120_000,
})
const binding = { workspace: 'w', captainSessionId: 'c', teamId: 't', planRevision: 4 }
const prepared = credentials.prepare(binding)
assert.equal(prepared.token, 'secret-token')
assert.deepEqual(credentials.consume({ ...binding, token: prepared.token }), { receiptId: 'receipt-1' })
assertInvalidWithoutToken(() => credentials.consume({ ...binding, token: prepared.token }), prepared.token)

const crossTeam = createApprovalCredentialStore({
  now: () => now,
  randomToken: () => 'cross-team-token',
  randomReceiptId: () => 'cross-team-receipt',
})
const crossTeamPrepared = crossTeam.prepare(binding)
assertInvalidWithoutToken(
  () => crossTeam.consume({ ...binding, teamId: 'other-team', token: crossTeamPrepared.token }),
  crossTeamPrepared.token,
)
assertInvalidWithoutToken(
  () => crossTeam.consume({ ...binding, token: crossTeamPrepared.token }),
  crossTeamPrepared.token,
)

const staleRevision = createApprovalCredentialStore({
  now: () => now,
  randomToken: () => 'stale-revision-token',
  randomReceiptId: () => 'stale-revision-receipt',
})
const staleRevisionPrepared = staleRevision.prepare(binding)
assertInvalidWithoutToken(
  () => staleRevision.consume({ ...binding, planRevision: binding.planRevision + 1, token: staleRevisionPrepared.token }),
  staleRevisionPrepared.token,
)
assertInvalidWithoutToken(
  () => staleRevision.consume({ ...binding, token: staleRevisionPrepared.token }),
  staleRevisionPrepared.token,
)

const expired = createApprovalCredentialStore({
  now: () => now,
  randomToken: () => 'expired-token',
  randomReceiptId: () => 'expired-receipt',
  ttlMs: 10,
})
const expiredPrepared = expired.prepare(binding)
now = expiredPrepared.expiresAt + 1
assertInvalidWithoutToken(
  () => expired.consume({ ...binding, token: expiredPrepared.token }),
  expiredPrepared.token,
)
assertInvalidWithoutToken(
  () => expired.consume({ ...binding, token: expiredPrepared.token }),
  expiredPrepared.token,
)

now = 2_000
for (const [field, value] of [['workspace', 'other-workspace'], ['captainSessionId', 'other-captain']]) {
  const token = `${field}-mismatch-token`
  const mismatchStore = createApprovalCredentialStore({
    now: () => now,
    randomToken: () => token,
    randomReceiptId: () => `${field}-mismatch-receipt`,
  })
  const mismatchPrepared = mismatchStore.prepare(binding)
  reviewCase(`${field} binding mismatch consumes the credential`, () => {
    assertInvalidWithoutToken(
      () => mismatchStore.consume({ ...binding, [field]: value, token: mismatchPrepared.token }),
      mismatchPrepared.token,
    )
    assertInvalidWithoutToken(
      () => mismatchStore.consume({ ...binding, token: mismatchPrepared.token }),
      mismatchPrepared.token,
    )
  })
}

for (const field of ['workspace', 'captainSessionId', 'teamId']) {
  reviewCase(`whitespace-only ${field} is rejected`, () => {
    const whitespaceStore = createApprovalCredentialStore({
      now: () => now,
      randomToken: () => `${field}-whitespace-token`,
      randomReceiptId: () => `${field}-whitespace-receipt`,
    })
    assert.throws(() => whitespaceStore.prepare({ ...binding, [field]: '   ' }), /binding is invalid/i)
  })
}

reviewCase('expired records are cleaned opportunistically', () => {
  let cleanupNow = 3_000
  let receiptSequence = 0
  const cleanupStore = createApprovalCredentialStore({
    now: () => cleanupNow,
    randomToken: () => 'reusable-expired-token',
    randomReceiptId: () => `cleanup-receipt-${++receiptSequence}`,
    ttlMs: 10,
  })
  const first = cleanupStore.prepare(binding)
  cleanupNow = first.expiresAt + 1
  assert.equal(cleanupStore.prepare(binding).token, first.token)
})

reviewCase('duplicate receipt IDs are rejected', () => {
  const tokens = ['duplicate-receipt-token-1', 'duplicate-receipt-token-2']
  const duplicateReceiptStore = createApprovalCredentialStore({
    now: () => now,
    randomToken: () => tokens.shift() ?? 'unexpected-token',
    randomReceiptId: () => 'duplicate-receipt',
  })
  const first = duplicateReceiptStore.prepare(binding)
  assert.deepEqual(
    duplicateReceiptStore.consume({ ...binding, token: first.token }),
    { receiptId: 'duplicate-receipt' },
  )
  assert.throws(() => duplicateReceiptStore.prepare(binding), /factory is invalid/i)
})

if (reviewFailures.length > 0) {
  throw new AggregateError(reviewFailures, `Task 2 review regressions failed (${reviewFailures.length})`)
}

const runtimeTypes = await readFile(new URL('../lib/types/tools.d.ts', import.meta.url), 'utf8')
assert.match(runtimeTypes, /export type StagedPlanUpdateOptions/)
assert.match(runtimeTypes, /export type ApprovalEvidence/)
assert.match(runtimeTypes, /prepareWebApproval\(captain: Agent, teamId: string, expectedPlanRevision: number\)/)
assert.match(runtimeTypes, /approveStagedTeam\(captain: Agent, teamId: string, evidence: ApprovalEvidence/)

console.log('Staging approval contract TDD passed: trusted primitives and unified runtime types')
