#!/usr/bin/env node

import assert from 'node:assert/strict'

import { automaticTeamName } from '../lib/team-name.js'
import { chatApprovalEvidence } from '../lib/approval-evidence.js'
import { createApprovalCredentialStore } from '../lib/approval-credentials.js'

assert.equal(
  automaticTeamName('审查 AgentTeams 审批异常。不得连接生产', 'a1b2c3'),
  '审查-AgentTeams-审批异常-a1b2c3',
)
assert.equal(automaticTeamName(undefined, 'a1b2c3'), 'agent-team-a1b2c3')
assert.equal(automaticTeamName('检查患者姓名张三及住院号123456', 'a1b2c3'), 'agent-team-a1b2c3')

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

console.log('Task 2 approval primitives contract TDD passed')
