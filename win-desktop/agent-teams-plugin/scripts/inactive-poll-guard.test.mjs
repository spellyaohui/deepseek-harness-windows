import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { createVolatile, updateVolatile } from '@deepseek-ai/cosmokit'
import { LlmAdapter, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import { SessionId } from '@deepseek-ai/dsh-session'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import * as AgentTeams from '../lib/index.js'
import { sessionOwnEvents } from '../lib/harness-compat.js'
import { liveDelegationPolicy } from '../lib/routing-policy.js'

const STATUS = { name: 'agent_teams_status', arguments: {} }
const PROFILE = { taskPlanning: 'captain', members: [{ name: 'reviewer', reasoning_mode: 'target-default' }], tasks: [] }
const resultText = result => result.content.filter(block => block.type === 'text').map(block => block.text).join('\n')

async function eventually(read, message) {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    const value = await read()
    if (value) return value
    await delay(10)
  }
  assert.fail(message)
}

/** Only the external model is scripted; tools, events, persistence and loop are real. */
class OfflineAdapter extends LlmAdapter {
  requests = []
  programs = new Map()
  beforeRequest
  async resolveModel(provider, model) { return { provider, id: model, name: model, reasoning: { efforts: [{ id: 'high', name: 'high' }] } } }
  async listModels(provider) { return ['offline-model', 'role-model'].map(id => ({ provider, id, name: id })) }
  async *stream(options) {
    assert.ok(options.sessionId)
    const index = this.requests.filter(item => item.sessionId === options.sessionId).length
    this.requests.push(options)
    await this.beforeRequest?.(options, index)
    const action = this.programs.get(options.sessionId)?.[index]
    if (action) {
      const actions = Array.isArray(action) ? action : [action]
      for (const [blockIndex, entry] of actions.entries()) {
        const block = { type: 'tool-call', id: ToolCallId(`poll-${options.sessionId}-${this.requests.length}-${blockIndex}`), name: entry.name, arguments: JSON.stringify(entry.arguments) }
        yield { type: 'block-start', index: blockIndex, blockType: 'tool-call' }
        yield { type: 'tool-call-delta', index: blockIndex, id: block.id, name: block.name, argumentsDelta: block.arguments }
        yield { type: 'block-end', index: blockIndex, block }
      }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'offline final response' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'offline final response' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function fixture(t, { mode = 'teams', bound = false, profile = PROFILE } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-inactive-poll-'))
  const ctx = new Context()
  t.after(async () => {
    await ctx.fiber.dispose()
    // This fixture's own minted directory, never an existing user workspace.
    await rm(workspace, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })
  })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: join(workspace, 'sessions') })
  await ctx.plugin(SessionQuery)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  const config = { delegationMode: mode, profiles: { delivery: structuredClone(profile) }, ...(bound ? { defaultProfile: 'delivery' } : {}), stateDir: '.agent-teams', slashCommand: false }
  const teamFiber = ctx.plugin(AgentTeams, config)
  await teamFiber
  ctx.tools.register(defineContentToolFixture({ name: 'poll_progress', description: 'offline independent progress', parameters: {}, async execute() { return [{ type: 'text', text: 'No active Team for this session.' }] } }))
  const adapter = new OfflineAdapter()
  ctx.llm.registerAdapter(['offline'], adapter)
  const create = async (id, meta = {}) => (await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd: workspace, ...meta }, agentOptions: { provider: 'offline', model: 'offline-model' } })).agent
  const captain = await create('poll-captain')
  let call = 0
  const execute = (name, args, agent = captain) => ctx.tools.execute({ callId: ToolCallId(`direct-${++call}`), name, arguments: args, agent, signal: new AbortController().signal })
  return { ctx, workspace, captain, adapter, create, execute, config, teamFiber }
}

async function run(agent, adapter, program, text = '继续', turn = 1) {
  const offset = adapter.requests.filter(item => item.sessionId === agent.session.id).length
  adapter.programs.set(agent.session.id, [...Array(offset), ...program])
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  return eventually(() => sessionOwnEvents(agent.session).find(event => event.type === 'turn/end' && event.data.turn === turn), 'the real turn did not settle')
}

test('three real inactive Team status calls block before a fourth model request without Team writes', { timeout: 20_000 }, async t => {
  const { captain, adapter, workspace } = await fixture(t)
  const end = await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])
  if (adapter.requests.length !== 3) t.diagnostic(JSON.stringify({ depth: captain.session.header.delegationDepth, parent: captain.session.header.parentSession, policy: liveDelegationPolicy(captain, 'teams'), events: sessionOwnEvents(captain.session).filter(event => /tool\/(call|result)|turn\/(start|end)/.test(event.type)).map(event => ({ type: event.type, seq: event.seq, call: event.data.callId, name: event.data.name })) }))
  assert.equal(adapter.requests.filter(item => item.sessionId === captain.session.id).length, 3, 'the fourth model request must never occur')
  assert.equal(end.data.reason.kind, 'blocked')
  assert.equal(sessionOwnEvents(captain.session).filter(event => event.type === 'tool/call').length, 3)
  assert.equal((await readdir(workspace)).includes('.agent-teams'), false)
})

test('inactive status and missing-binding rejection explain the usable Profile recovery path', { timeout: 20_000 }, async t => {
  const { execute, workspace } = await fixture(t)
  const status = await execute('agent_teams_status', {})
  assert.equal(status.isError, false)
  assert.equal(status.value.active, false)
  assert.match(resultText(status), /默认团队.*Profile|default.*Profile/i)
  assert.match(resultText(status), /\/agent-teams --profile/)
  const create = await execute('agent_teams_create', { profile: 'delivery' })
  assert.equal(create.isError, true)
  assert.match(resultText(create), /\/agent-teams --profile/)
  assert.equal((await readdir(workspace)).includes('.agent-teams'), false)
})

test('Native mode can keep probing without being paused', { timeout: 20_000 }, async t => {
  const { captain, adapter } = await fixture(t, { mode: 'native' })
  const end = await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(adapter.requests.length, 5)
  assert.equal(end.data.reason.kind, 'completed')
})

test('an active Team is never stopped by this inactive guard', { timeout: 20_000 }, async t => {
  const { captain, adapter, execute } = await fixture(t, { bound: true })
  assert.equal((await execute('agent_teams_create', { description: 'offline active Team' })).isError, false)
  const end = await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(end.data.reason.kind, 'completed')
  const calls = sessionOwnEvents(captain.session).filter(event => event.type === 'tool/call' && event.data.name === 'agent_teams_status')
  assert.equal(calls.length, 4)
})

test('three batched actual status calls pause once before another request', { timeout: 20_000 }, async t => {
  const { captain, adapter } = await fixture(t)
  const end = await run(captain, adapter, [[STATUS, STATUS, STATUS], STATUS])
  assert.equal(adapter.requests.length, 1)
  assert.equal(end.data.reason.kind, 'blocked')
  assert.equal(sessionOwnEvents(captain.session).filter(event => event.type === 'tool/call').length, 3)
})

test('another tool with identical inactive text breaks the consecutive streak', { timeout: 20_000 }, async t => {
  const { captain, adapter } = await fixture(t)
  const end = await run(captain, adapter, [STATUS, STATUS, { name: 'poll_progress', arguments: {} }, STATUS, STATUS, STATUS, STATUS])
  assert.equal(adapter.requests.length, 6)
  assert.equal(end.data.reason.kind, 'blocked')
})

test('a real failed status call does not count as an inactive success', { timeout: 20_000 }, async t => {
  const { captain, adapter } = await fixture(t)
  const end = await run(captain, adapter, [STATUS, STATUS, { name: 'agent_teams_status', arguments: { detail: 'invalid' } }, STATUS, STATUS, STATUS, STATUS])
  assert.equal(adapter.requests.length, 6)
  assert.equal(end.data.reason.kind, 'blocked')
  assert.equal(sessionOwnEvents(captain.session).filter(event => event.type === 'tool/result' && event.data.message.isError).length, 1)
})

test('direct API probes do not arm the next real model turn', { timeout: 20_000 }, async t => {
  const { captain, adapter, execute } = await fixture(t)
  for (let index = 0; index < 8; index++) assert.equal((await execute('agent_teams_status', {})).value.active, false)
  const end = await run(captain, adapter, [STATUS, STATUS])
  assert.equal(adapter.requests.length, 3)
  assert.equal(end.data.reason.kind, 'completed')
})

test('a new turn resets the prior blocked streak', { timeout: 20_000 }, async t => {
  const { captain, adapter } = await fixture(t)
  assert.equal((await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])).data.reason.kind, 'blocked')
  const end = await run(captain, adapter, [STATUS, STATUS], '再次只读检查', 2)
  assert.equal(adapter.requests.length, 6)
  assert.equal(end.data.reason.kind, 'completed')
})

test('a direct user message arriving after the third result cancels that pause', { timeout: 20_000 }, async t => {
  const { ctx, captain, adapter } = await fixture(t)
  let statuses = 0
  ctx.on('tools/result', (exec) => {
    if (exec.agent === captain && exec.name === 'agent_teams_status' && ++statuses === 3) captain.steer(createUserMessage({ content: [{ type: 'text', text: '我补充了新的要求，请继续' }], source: { kind: 'user' } }))
  })
  const end = await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(adapter.requests.length, 5)
  assert.equal(end.data.reason.kind, 'completed')
})

test('plugin-authored context cannot reset the streak', { timeout: 20_000 }, async t => {
  const { captain, adapter } = await fixture(t)
  adapter.beforeRequest = async (_options, index) => {
    if (index === 2) captain.session.append('user/message', { source: { kind: 'agent-teams-command' }, content: [{ type: 'text', text: 'continue without a new user decision' }] }, { surfaceOp: 'append' })
  }
  const end = await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(adapter.requests.length, 3)
  assert.equal(end.data.reason.kind, 'blocked')
})

test('a live binding update cancels a pending inactive pause', { timeout: 20_000 }, async t => {
  const { ctx, captain, adapter, teamFiber } = await fixture(t)
  let statuses = 0
  ctx.on('tools/result', exec => {
    if (exec.agent === captain && exec.name === 'agent_teams_status' && ++statuses === 3) updateVolatile(teamFiber.config.defaultProfile, createVolatile('delivery'))
  })
  const end = await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(adapter.requests.length, 5)
  assert.equal(end.data.reason.kind, 'completed')
})

test('a Team created by another admitted control before pre-step cancels the pause', { timeout: 20_000 }, async t => {
  const { ctx, captain, adapter, execute } = await fixture(t, { bound: true })
  let statuses = 0
  let created = false
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (payload.agent === captain && statuses === 3 && !created) {
      created = true
      assert.equal((await execute('agent_teams_create', { description: 'control-created Team' })).isError, false)
    }
    return decision
  })
  ctx.on('tools/result', exec => { if (exec.agent === captain && exec.name === 'agent_teams_status') statuses++ })
  const end = await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(created, true)
  assert.equal(end.data.reason.kind, 'completed')
  assert.equal(sessionOwnEvents(captain.session).filter(event => event.type === 'tool/call').length, 4)
})

test('sessions keep their inactive streaks separate', { timeout: 20_000 }, async t => {
  const { captain, create, adapter } = await fixture(t)
  const other = await create('poll-other')
  const [first, second] = await Promise.all([
    run(captain, adapter, [STATUS, STATUS, STATUS, STATUS]),
    run(other, adapter, [STATUS, STATUS]),
  ])
  assert.equal(first.data.reason.kind, 'blocked')
  assert.equal(second.data.reason.kind, 'completed')
  assert.equal(adapter.requests.filter(item => item.sessionId === other.session.id).length, 3)
})

test('a child-depth session never arms captain pacing', { timeout: 20_000 }, async t => {
  const { captain, create, adapter } = await fixture(t)
  const child = await create('poll-child', { parentSession: captain.session.id, delegationDepth: 1, origin: 'subagent' })
  const end = await run(child, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(adapter.requests.filter(item => item.sessionId === child.session.id).length, 5)
  assert.equal(end.data.reason.kind, 'completed')
})

test('a root fork with unspecified zero depth still receives pacing', { timeout: 20_000 }, async t => {
  const { captain, create, adapter } = await fixture(t)
  const fork = await create('poll-fork', { parentSession: captain.session.id })
  const end = await run(fork, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(adapter.requests.filter(item => item.sessionId === fork.session.id).length, 3)
  assert.equal(end.data.reason.kind, 'blocked')
})

test('a child-origin session without explicit depth is not treated as a root fork', { timeout: 20_000 }, async t => {
  const { captain, create, adapter } = await fixture(t)
  const child = await create('poll-child-origin', { parentSession: captain.session.id, origin: 'subagent' })
  const end = await run(child, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(adapter.requests.filter(item => item.sessionId === child.session.id).length, 5)
  assert.equal(end.data.reason.kind, 'completed')
})

test('queued direct-user input resumes its own turn after an inactive pause', { timeout: 20_000 }, async t => {
  const { ctx, captain, adapter } = await fixture(t)
  let statuses = 0
  ctx.on('tools/result', exec => {
    if (exec.agent === captain && exec.name === 'agent_teams_status' && ++statuses === 3) captain.followup(createUserMessage({ content: [{ type: 'text', text: '新的后续请求' }], source: { kind: 'user' } }))
  })
  assert.equal((await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])).data.reason.kind, 'blocked')
  const next = await eventually(() => sessionOwnEvents(captain.session).find(event => event.type === 'turn/end' && event.data.turn === 2), 'queued direct-user input stayed parked')
  assert.equal(next.data.reason.kind, 'completed')
  assert.equal(adapter.requests.length, 5)
  assert.equal(sessionOwnEvents(captain.session).filter(event => event.type === 'user/message' && event.data.source.kind === 'user' && event.data.content.some(block => block.type === 'text' && block.text === '新的后续请求')).length, 1)
  assert.equal(captain.inbox.nextTurn.length, 0)
  assert.equal(captain.inbox.nextStep.length, 0)
})

test('a current direct-user Profile command still creates a real Team', { timeout: 20_000 }, async t => {
  const { captain, adapter, execute } = await fixture(t)
  const end = await run(captain, adapter, [{ name: 'agent_teams_create', arguments: { description: 'admitted goal' } }], '/agent-teams --profile delivery inspect the fixture')
  assert.equal(end.data.reason.kind, 'completed')
  const result = await execute('agent_teams_status', {})
  assert.equal(result.isError, false)
  assert.equal(result.value.active, true)
})

for (const mode of ['teams', 'native']) test(`installed ${mode} policy wins over a later global mode change`, { timeout: 20_000 }, async t => {
  const { captain, adapter, teamFiber } = await fixture(t, { mode })
  updateVolatile(teamFiber.config.delegationMode, createVolatile(mode === 'teams' ? 'native' : 'teams'))
  const end = await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(adapter.requests.length, mode === 'teams' ? 3 : 5)
  assert.equal(end.data.reason.kind, mode === 'teams' ? 'blocked' : 'completed')
})

test('repeated observation of one actual result is still one call', { timeout: 20_000 }, async t => {
  const { ctx, captain, adapter } = await fixture(t)
  let replaying = false
  ctx.on('tools/result', (exec, result) => {
    if (exec.agent !== captain || replaying) return
    replaying = true
    ctx.emit('tools/result', exec, result)
    ctx.emit('tools/result', exec, result)
    replaying = false
  })
  assert.equal((await run(captain, adapter, [STATUS, STATUS])).data.reason.kind, 'completed')
  assert.equal(adapter.requests.length, 3)
})

test('a fresh state read failure cannot become an inactive pause', { timeout: 20_000 }, async t => {
  const { ctx, captain, adapter, workspace } = await fixture(t)
  let statuses = 0
  ctx.on('tools/result', exec => { if (exec.agent === captain && exec.name === 'agent_teams_status') statuses++ })
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (payload.agent === captain && statuses === 3) await writeFile(join(workspace, '.agent-teams'), 'fixture: not a directory')
    return decision
  })
  const end = await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(end.data.reason.kind, 'completed')
  assert.equal(adapter.requests.length, 5)
  assert.equal(sessionOwnEvents(captain.session).filter(event => event.type === 'tool/result' && event.data.message.isError).length, 1)
})

test('plugin reload discards process-local streak and pending pause hooks', { timeout: 20_000 }, async t => {
  const { ctx, captain, adapter, teamFiber, config } = await fixture(t)
  adapter.beforeRequest = async (_options, index) => {
    if (index !== 2) return
    await teamFiber.dispose()
    await ctx.plugin(AgentTeams, config)
  }
  const end = await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])
  assert.equal(end.data.reason.kind, 'completed')
  assert.equal(adapter.requests.length, 5)
})

test('a queued plugin reminder alone never wakes an inactive pause', { timeout: 20_000 }, async t => {
  const { ctx, captain, adapter } = await fixture(t)
  let statuses = 0
  ctx.on('tools/result', exec => {
    if (exec.agent === captain && exec.name === 'agent_teams_status' && ++statuses === 3) captain.followup(createUserMessage({ content: [{ type: 'text', text: 'plugin reminder only' }], source: { kind: 'agent-teams' } }))
  })
  assert.equal((await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])).data.reason.kind, 'blocked')
  await captain.whenIdle()
  assert.equal(adapter.requests.length, 3)
  assert.equal(captain.inbox.nextTurn.length, 1)
})

test('multiple queued direct-user inputs retain order and are consumed once', { timeout: 20_000 }, async t => {
  const { ctx, captain, adapter } = await fixture(t)
  let statuses = 0
  ctx.on('tools/result', exec => {
    if (exec.agent !== captain || exec.name !== 'agent_teams_status' || ++statuses !== 3) return
    for (const text of ['queued-user-one', 'queued-user-two']) captain.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  })
  assert.equal((await run(captain, adapter, [STATUS, STATUS, STATUS, STATUS])).data.reason.kind, 'blocked')
  await eventually(() => sessionOwnEvents(captain.session).find(event => event.type === 'turn/end' && event.data.turn === 3), 'queued input did not drain')
  const seen = sessionOwnEvents(captain.session).filter(event => event.type === 'user/message' && event.data.source.kind === 'user').flatMap(event => event.data.content.filter(block => block.type === 'text' && block.text.startsWith('queued-user-')).map(block => block.text))
  assert.deepEqual(seen, ['queued-user-one', 'queued-user-two'])
  assert.equal(adapter.requests.length, 6)
})

test('inactive status identifies an already-bound empty seed instead of asking to bind again', async t => {
  const { execute, workspace } = await fixture(t, { bound: true, profile: { ...PROFILE, taskPlanning: 'seed' } })
  const status = await execute('agent_teams_status', {})
  assert.equal(status.isError, false)
  assert.deepEqual(status.value, { active: false }, 'diagnosis must not add hidden output fields')
  assert.match(resultText(status), /已保存默认.*delivery/)
  assert.match(resultText(status), /0.*任务.*不能创建/)
  assert.match(resultText(status), /添加.*任务.*队长动态规划.*保存/)
  const rejected = await execute('agent_teams_create', { description: 'must not fabricate seed tasks' })
  assert.equal(rejected.isError, true)
  assert.equal((await readdir(workspace)).includes('.agent-teams'), false)
})

test('a ready captain Profile explains task creation rather than claiming that members have started', async t => {
  const { execute, workspace } = await fixture(t, { bound: true })
  const status = await execute('agent_teams_status', {})
  assert.deepEqual(status.value, { active: false })
  assert.match(resultText(status), /已保存默认.*delivery.*队长动态规划/)
  assert.match(resultText(status), /agent_teams_create.*agent_teams_create_task/)
  assert.match(resultText(status), /任务就绪.*启动/)
  assert.equal((await readdir(workspace)).includes('.agent-teams'), false)
})

test('a ready seed Profile reports its real task count without changing it', async t => {
  const profile = { ...PROFILE, taskPlanning: 'seed', tasks: [{ id: 'inspect', subject: 'inspect fixture', assignee: 'reviewer' }] }
  const { execute, teamFiber, workspace } = await fixture(t, { bound: true, profile })
  const before = structuredClone(teamFiber.config.profiles.get())
  const status = await execute('agent_teams_status', {})
  assert.deepEqual(status.value, { active: false })
  assert.match(resultText(status), /delivery.*固定.*1.*任务.*agent_teams_create/)
  assert.deepEqual(teamFiber.config.profiles.get(), before)
  assert.equal((await readdir(workspace)).includes('.agent-teams'), false)
})

for (const invalid of ['unknown', 'malformed']) test(`inactive status diagnoses an ${invalid} saved Profile without turning a probe into an error`, async t => {
  const { execute, teamFiber, workspace } = await fixture(t, { bound: true })
  if (invalid === 'unknown') updateVolatile(teamFiber.config.defaultProfile, createVolatile('missing-delivery'))
  else updateVolatile(teamFiber.config.profiles, createVolatile({ delivery: { ...PROFILE, members: [{ name: 'reviewer', provider: 'offline', reasoning_mode: 'target-default' }] } }))
  const status = await execute('agent_teams_status', {})
  assert.equal(status.isError, false)
  assert.deepEqual(status.value, { active: false })
  assert.match(resultText(status), /已保存默认.*delivery.*不存在|已保存默认.*delivery.*无效/)
  assert.match(resultText(status), /设置.*核对.*保存/)
  assert.equal((await readdir(workspace)).includes('.agent-teams'), false)
})

test('a direct-user Profile command takes precedence over an empty saved default after status diagnosis', async t => {
  const { captain, adapter, teamFiber, execute } = await fixture(t, { bound: true, profile: { ...PROFILE, taskPlanning: 'seed' } })
  updateVolatile(teamFiber.config.profiles, createVolatile({ delivery: { ...PROFILE, taskPlanning: 'seed' }, dynamic: PROFILE }))
  const end = await run(captain, adapter, [STATUS, { name: 'agent_teams_create', arguments: { description: 'explicit dynamic profile' } }], '/agent-teams --profile dynamic inspect fixture')
  assert.equal(end.data.reason.kind, 'completed')
  const inactive = sessionOwnEvents(captain.session).find(event => event.type === 'tool/result' && resultText(event.data.message).startsWith('No active Team'))
  assert.ok(inactive, 'the real status result must be recorded')
  assert.match(resultText(inactive.data.message), /仅.*默认.*本轮用户.*优先/)
  const active = await execute('agent_teams_status', { detail: 'full' })
  assert.equal(active.value.active, true)
  assert.equal(active.value.profile.name, 'dynamic')
})

test('live planning changes update concurrent inactive diagnostics without rewriting old results or settings', async t => {
  const { captain, create, execute, teamFiber, workspace } = await fixture(t, { bound: true, profile: { ...PROFILE, taskPlanning: 'seed' } })
  const other = await create('diagnostic-other')
  const [first, second] = await Promise.all([execute('agent_teams_status', {}, captain), execute('agent_teams_status', {}, other)])
  assert.match(resultText(first), /0.*任务.*不能创建/)
  assert.match(resultText(second), /0.*任务.*不能创建/)
  updateVolatile(teamFiber.config.profiles, createVolatile({ delivery: PROFILE }))
  const before = structuredClone(teamFiber.config.profiles.get())
  const [third, fourth] = await Promise.all([execute('agent_teams_status', {}, captain), execute('agent_teams_status', {}, other)])
  assert.match(resultText(third), /队长动态规划.*agent_teams_create/)
  assert.match(resultText(fourth), /队长动态规划.*agent_teams_create/)
  assert.match(resultText(first), /0.*任务.*不能创建/)
  assert.deepEqual(teamFiber.config.profiles.get(), before)
  assert.equal((await readdir(workspace)).includes('.agent-teams'), false)
})

test('status then captain planning delivers real work to the frozen explicit role, not a temporary model', { timeout: 20_000 }, async t => {
  const profile = { ...PROFILE, members: [{ name: 'reviewer', provider: 'offline', model: 'role-model', reasoning_mode: 'explicit', reasoning_effort: 'high', executionPrompt: 'Inspect only the assigned fixture.' }] }
  const { ctx, captain, adapter, execute } = await fixture(t, { bound: true, profile })
  assert.match(resultText(await execute('agent_teams_status', {})), /队长动态规划.*agent_teams_create_task/)
  adapter.beforeRequest = async (options, index) => {
    if (options.sessionId === captain.session.id || index !== 0) return
    const child = ctx.agents.get(options.sessionId)
    const status = await execute('agent_teams_status', {}, child)
    assert.equal(status.isError, false)
    const task = status.value.tasks.find(task => task.assignee === 'reviewer')
    assert.ok(task?.attempt_id)
    adapter.programs.set(options.sessionId, [
      { name: 'agent_teams_claim_task', arguments: { task_id: task.id } },
      { name: 'agent_teams_update_task', arguments: { task_id: task.id, attempt_id: task.attempt_id, status: 'in_progress' } },
      { name: 'agent_teams_update_task', arguments: { task_id: task.id, attempt_id: task.attempt_id, status: 'completed', output: 'fixture inspected' } },
    ])
  }
  const end = await run(captain, adapter, [STATUS,
    { name: 'agent_teams_create', arguments: { description: 'goal-specific offline review' } },
    { name: 'agent_teams_create_task', arguments: { subject: 'inspect fixture', assignee: 'reviewer' } },
  ])
  assert.equal(end.data.reason.kind, 'completed')
  await eventually(() => adapter.requests.find(request => request.sessionId !== captain.session.id), 'ready work did not start a real member')
  const active = await execute('agent_teams_status', { detail: 'full' })
  const reviewer = active.value.members.find(member => member.name === 'reviewer')
  assert.equal(reviewer.provider, 'offline')
  assert.equal(reviewer.model, 'role-model')
  assert.equal(reviewer.reasoning_effort, 'high')
  const childRequest = adapter.requests.find(request => request.sessionId !== captain.session.id)
  assert.equal(childRequest.model, 'role-model')
  assert.equal(childRequest.reasoningEffort, 'high')
  const child = ctx.agents.get(childRequest.sessionId)
  await child.whenIdle()
  assert.ok(sessionOwnEvents(child.session).some(event => event.type === 'user/message'), 'gateway must deliver a real assignment')
  assert.ok(sessionOwnEvents(child.session).some(event => event.type === 'turn/end'), 'child must execute, not just have a stored member row')
  assert.equal(sessionOwnEvents(child.session).filter(event => event.type === 'tool/call').length, 3)
  const settled = await execute('agent_teams_status', { detail: 'full' })
  assert.equal(settled.value.tasks[0].status, 'completed')
})

test('the real model prompt exposes the saved binding and an empty fixed-template blocker', async t => {
  const { captain, adapter } = await fixture(t, { bound: true, profile: { ...PROFILE, taskPlanning: 'seed' } })
  await run(captain, adapter, [STATUS])
  const prompt = JSON.stringify(adapter.requests[0].messages)
  assert.match(prompt, /saved default: delivery/)
  assert.match(prompt, /0 tasks.*cannot create/)
  assert.match(prompt, /agent_teams_create_task/)
})
