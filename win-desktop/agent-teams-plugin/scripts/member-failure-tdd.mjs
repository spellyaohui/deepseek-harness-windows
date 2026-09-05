/** Terminal member failures, composed with Harness's actual retry plugin. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { apply as installRetry } from '@deepseek-ai/dsh-llm-retry'
import { failMemberOpenAttempt, installMemberSelectionRuntime } from '../lib/members.js'
import { installTeamScheduler } from '../lib/scheduler.js'
import {
  createMessage,
  createTeamDir,
  readMailbox,
  readTeam,
  readUnreadMailbox,
  withTeamLock,
  writeTeam,
} from '../lib/state.js'

async function eventually(predicate, message = 'terminal failure did not settle') {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return
    await delay(10)
  }
  assert.fail(message)
}

async function fixture(t, { captainStatus = 'idle', captainOffline = false, rejectDelivery = false } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-member-failure-'))
  const stateRoot = join(workspace, '.agent-teams')
  const pendingFailures = []
  let settleOnCleanup = () => {}
  t.after(async () => {
    settleOnCleanup()
    await Promise.allSettled(pendingFailures)
    await rm(workspace, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })
  })

  const listeners = new Map()
  const steers = []
  const deliveries = []
  const warnings = []
  const sessionEvents = []
  const captain = {
    id: 'captain',
    status: captainStatus,
    session: { append() {} },
    steer(message) {
      if (rejectDelivery) throw new Error('captain cannot receive')
      steers.push(message)
    },
  }

  let resolveIdle
  const idle = new Promise(resolve => { resolveIdle = resolve })
  const child = {
    id: 'worker-session',
    status: 'running',
    whenIdle: () => child.status === 'idle' ? Promise.resolve() : idle,
    session: {
      header: { cwd: workspace, parentSession: captain.id, seedLength: 0 },
      events: [{ type: 'subagent/descriptor', data: {
        version: 3,
        mode: 'continuable',
        provider: 'spawn',
        label: 'agent-teams:team:worker',
        agentProvider: 'fake',
        agentModel: 'primary',
      } }],
      append(type, data) { sessionEvents.push({ type, data }) },
    },
  }

  await createTeamDir(stateRoot, {
    schemaVersion: 2,
    id: 'team',
    name: 'Team',
    captainSessionId: captain.id,
    createdAt: 1,
    taskSeq: 3,
    planRevision: 1,
    phase: 'running',
    approvedAt: 1,
    approvedPlanRevision: 1,
    approvalSource: 'automatic',
    approvalEvidenceId: 'automatic:create:team',
    members: [{
      id: child.id,
      name: 'worker',
      status: 'working',
      joinedAt: 1,
      provider: 'fake',
      model: 'primary',
      reasoningMode: 'target-default',
    }],
    tasks: [
      {
        id: 't1',
        subject: 'failed work',
        assignee: 'worker',
        status: 'in_progress',
        dependencies: [],
        revision: 1,
        attempt: 1,
        attemptId: 'a1',
        createdAt: 1,
        updatedAt: 1,
        kind: 'work',
      },
      {
        id: 't2',
        subject: 'independent work',
        assignee: undefined,
        status: 'pending',
        dependencies: [],
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
        kind: 'work',
      },
      {
        id: 't3',
        subject: 'dependent work',
        assignee: undefined,
        status: 'pending',
        dependencies: ['t1'],
        revision: 1,
        createdAt: 1,
        updatedAt: 1,
        kind: 'work',
      },
    ],
  })

  const ctx = {
    logger: {
      debug() {},
      warn(message) { warnings.push(message) },
    },
    agents: {
      get(id) {
        if (id === child.id) return child
        if (id === captain.id && !captainOffline) return captain
        return undefined
      },
    },
    on(name, listener) {
      const handlers = listeners.get(name) ?? new Set()
      handlers.add(listener)
      listeners.set(name, handlers)
      return () => handlers.delete(listener)
    },
    subagents: {
      registerContinuableSetup(fn) { ctx.setup = fn },
      async followup(_captain, id, content) {
        deliveries.push({ id, content })
        return 'accepted'
      },
    },
  }

  const scheduler = installTeamScheduler(ctx, { stateDir: '.agent-teams' })
  const runtime = installMemberSelectionRuntime(
    ctx,
    '.agent-teams',
    undefined,
    (workspaceName, teamId, memberName) => scheduler.kickMember(workspaceName, teamId, memberName),
  )
  const dispose = await runtime.withPending(
    captain.id,
    'agent-teams:team:worker',
    { provider: 'fake', model: 'primary', reasoningMode: 'target-default' },
    () => ctx.setup({
      agent: child,
      on(name, listener) {
        const handlers = listeners.get(name) ?? new Set()
        handlers.add(listener)
        listeners.set(name, handlers)
        return () => handlers.delete(listener)
      },
    }),
  )
  t.after(dispose)

  let retryHandler
  let projection
  let retryState = {}
  const retryDisposers = []
  installRetry({
    logger: ctx.logger,
    sessionProjections: {
      register(value) { projection = value },
      stateOf() { return retryState },
    },
    on(_name, listener) {
      retryHandler = listener
      return () => {}
    },
    effect(setup) { retryDisposers.push(setup()) },
  })
  t.after(async () => {
    for (const disposeRetry of retryDisposers) await disposeRetry()
  })
  child.session.append = (type, data) => {
    sessionEvents.push({ type, data })
    retryState = projection.apply(retryState, { type, data })
  }

  const failure = { code: 'STREAM_CLOSED', message: 'SSE stream ended without [DONE]' }
  const payload = (policy, code = failure.code, signal = new AbortController().signal) => ({
    agent: child,
    turn: 1,
    step: 0,
    provider: 'fake',
    failure: { ...failure, code },
    retryPolicy: policy,
    signal,
  })
  const memberRequestError = async (value, next = async () => undefined) => {
    const handlers = [...(listeners.get('agent/request-error') ?? [])]
    let result
    for (const handler of handlers) result = await handler(value, next)
    return result
  }
  const settleSilently = () => {
    child.status = 'idle'
    resolveIdle()
  }
  settleOnCleanup = settleSilently

  return {
    ctx,
    stateRoot,
    steers,
    deliveries,
    warnings,
    listeners,
    child,
    sessionEvents,
    memberRequestError,
    payload,
    state: () => readTeam(stateRoot, 'team'),
    mailbox: () => readMailbox(stateRoot, 'team', 'captain'),
    unread: () => readUnreadMailbox(stateRoot, 'team', 'captain'),
    retry: (policy, code) => {
      const value = payload(policy, code)
      return retryHandler(value, () => memberRequestError(value))
    },
    terminal({ settle = true, turn = 1, code = failure.code, message = failure.message } = {}) {
      const handlers = [...(listeners.get('agent/error') ?? [])]
      const run = Promise.all(handlers.map(handler => handler({
        agent: child,
        turn,
        step: 0,
        error: new LlmError(message, code),
      })))
      pendingFailures.push(run)
      if (settle) settleSilently()
      return run
    },
    settleSilently,
  }
}

const normal = {
  mode: 'normal',
  maxRetries: 1,
  retryableCodes: ['STREAM_CLOSED'],
  initialDelayMs: 0,
  maxDelayMs: 0,
  jitterRatio: 0,
}
const always = { mode: 'always', initialDelayMs: 0, maxDelayMs: 0, jitterRatio: 0 }

await test('intermediate request recovery keeps the owned task open', async t => {
  const h = await fixture(t)
  assert.deepEqual(await h.retry(always), { kind: 'retry' })
  assert.equal((await h.state()).tasks[0].status, 'in_progress')
  assert.equal((await h.mailbox()).length, 0)
})

await test('final agent/error fails only the matching attempt and waits for child idle', async t => {
  const h = await fixture(t)
  h.terminal({ settle: false })
  await eventually(async () => (await h.state()).tasks[0].status === 'failed')
  assert.equal(h.child.status, 'running')
  assert.equal((await h.state()).members[0].status, 'working')
  assert.equal(h.deliveries.length, 0)
  h.settleSilently()
  await eventually(() => h.deliveries.length === 1, 'idle child did not receive the next independent task')
  const state = await h.state()
  assert.equal(state.members[0].status, 'working')
  assert.equal(state.tasks[0].status, 'failed')
  assert.equal(state.tasks[1].status, 'claimed')
  assert.equal(state.tasks[2].status, 'pending')
  assert.equal(state.tasks[0].attemptId, 'a1')
})

await test('duplicate final errors for one turn write one failure report', async t => {
  const h = await fixture(t)
  h.terminal()
  h.terminal()
  await eventually(async () => h.steers.length === 1 && (await h.state()).tasks[0].status === 'failed')
  assert.equal((await h.mailbox()).length, 1)
})

await test('a stale attempt cannot settle a newer attempt', async t => {
  const h = await fixture(t)
  const current = await h.state()
  current.tasks[0].attempt = 2
  current.tasks[0].attemptId = 'a2'
  await writeTeam(h.stateRoot, current)
  const recorded = await failMemberOpenAttempt(
    h.ctx,
    h.stateRoot,
    'team',
    'worker',
    { code: 'STREAM_CLOSED', message: 'stale failure' },
    h.child.session,
    {
      captainSessionId: 'captain',
      memberId: h.child.id,
      task: { id: 't1', attempt: 1, attemptId: 'a1' },
    },
  )
  assert.equal(recorded, false)
  assert.equal((await h.state()).tasks[0].status, 'in_progress')
  assert.equal((await h.mailbox()).length, 0)
})

await test('failure reports are bounded and do not persist secrets, stack, or prompt text', async t => {
  const h = await fixture(t)
  h.terminal({
    message: 'provider failed Authorization: Bearer super-secret-token\n at provider.js:12\nprompt: patient payload {"token":"raw-secret"}',
  })
  await eventually(async () => h.steers.length === 1 && (await h.state()).tasks[0].status === 'failed')
  const serialized = JSON.stringify({ state: await h.state(), mailbox: await h.mailbox(), steers: h.steers })
  assert.ok(serialized.length < 2_000)
  assert.doesNotMatch(serialized, /super-secret-token|raw-secret|provider\.js:12|patient payload/)
  assert.match(serialized, /STREAM_CLOSED/)
})

await test('captain unavailability leaves the durable failure mailbox readable', async t => {
  const h = await fixture(t, { captainOffline: true })
  h.terminal()
  await eventually(async () => (await h.unread()).length === 1)
  assert.equal((await h.state()).tasks[0].status, 'failed')
  assert.equal(h.steers.length, 0)
})

await test('member failure settlement is no-op when team generation is stale', async t => {
  const h = await fixture(t)
  const recorded = await failMemberOpenAttempt(
    h.ctx,
    h.stateRoot,
    'team',
    'worker',
    { code: 'STREAM_CLOSED', message: 'wrong captain generation' },
    h.child.session,
    {
      captainSessionId: 'different-captain',
      memberId: h.child.id,
      task: { id: 't1', attempt: 1, attemptId: 'a1' },
    },
  )
  assert.equal(recorded, false)
  assert.equal((await h.state()).tasks[0].status, 'in_progress')
})

if (normal.mode !== 'normal') throw new Error('test fixture mismatch')
console.log('member failure TDD checks passed')
