/**
 * Offline reproduction of Team-mode native `subagent` compatibility.
 * The Cordis registry, tool validation/guards, production AgentLoop, spawn
 * provider, continuation manager, JSONL sessions and AgentTeams disk state are
 * real. Only the LLM adapter is deterministic test data; no network is used.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import { SessionId } from '@deepseek-ai/dsh-session'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as ToolSubagent from '@deepseek-ai/dsh-tool-subagent'
import SubagentModelSelectionConfig from '@deepseek-ai/dsh-tool-subagent/model-selection-settings'
import * as AgentTeams from '../lib/index.js'
import { findTeamByCaptain, readTeam } from '../lib/state.js'
import { haltTeamWork } from '../lib/tools.js'

const CHILD_OUTPUT = '离线子智能体已完成真实团队任务。'
const DELEGATED_PROMPT = '读取测试任务上下文，并在团队任务中报告结果；这是离线夹具，不访问任何外部服务。'

function text(result) {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

async function eventually(read, message, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value) return value
    await delay(10)
  }
  assert.fail(message)
}

/** A controllable external-model boundary around the unmodified child loop. */
class OfflineAdapter extends LlmAdapter {
  // Harness may wake the captain with official child-settlement notices.
  // Keep those real requests separate from the child gates/assertions below.
  requests = []
  captainRequests = []
  gates = []
  captainGates = []
  released = new Set()
  releasingAll = false
  release(index = 0) { this.released.add(index); this.gates[index]?.resolve() }
  releaseAll() {
    this.releasingAll = true
    for (const gate of [...this.gates, ...this.captainGates]) gate.resolve()
  }
  async resolveModel(provider, model) {
    return { provider, id: model, name: model }
  }
  async listModels(provider) {
    return ['offline-model', 'alternate-model', 'blocked-model'].map(id => ({ provider, id, name: id }))
  }
  async *stream(options) {
    assert.ok(options.sessionId, 'the production AgentLoop must stamp request ownership')
    const captain = options.sessionId === 'compat-captain'
    const requests = captain ? this.captainRequests : this.requests
    const gates = captain ? this.captainGates : this.gates
    const index = requests.length
    requests.push(options)
    const gate = Promise.withResolvers()
    gates.push(gate)
    if (this.releasingAll || (!captain && this.released.has(index))) gate.resolve()
    if (options.signal?.aborted) throw new Error('offline child aborted')
    await Promise.race([
      gate.promise,
      new Promise((_, reject) => options.signal?.addEventListener('abort', () => reject(new Error('offline child aborted')), { once: true })),
    ])
    if (options.signal?.aborted) throw new Error('offline child aborted')
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: CHILD_OUTPUT }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: CHILD_OUTPUT } }
    yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 8 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function fixture(t, mode, { modelSelection = false, profiles = {}, maxMembers = 4 } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-team-subagent-compat-'))
  const ctx = new Context()
  const adapter = new OfflineAdapter()
  t.after(async () => {
    adapter.releaseAll()
    await ctx.fiber.dispose()
    // This path is minted by mkdtemp above, never an existing user workspace.
    await rm(workspace, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })
  })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: join(workspace, 'sessions') })
  await ctx.plugin(SessionQuery)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  if (modelSelection) await ctx.plugin(SubagentModelSelectionConfig, {
    enabled: true,
    allowedModels: [{ provider: 'offline', model: 'alternate-model' }],
  })
  const teamFiber = ctx.plugin(AgentTeams, {
    delegationMode: mode,
    stateDir: '.agent-teams',
    memberProvider: 'spawn',
    memberMaxDepth: 0,
    maxMembers,
    profiles,
    slashCommand: false,
  })
  await teamFiber
  ctx.llm.registerAdapter(['offline'], adapter)
  const handle = await ctx.agents.create({
    sessionId: SessionId('compat-captain'),
    meta: { cwd: workspace },
    agentOptions: { provider: 'offline', model: 'offline-model' },
    setup: async (agentCtx, agent) => {
      const fiber = agentCtx.inject(ToolSubagent.inject, runtimeCtx => {
        ToolSubagent.apply(runtimeCtx, {
          provider: 'spawn',
          backgroundMode: 'continuable',
          modelSelectionSettings: modelSelection,
        }, agent.session)
      })
      await fiber.await()
    },
  })
  let callSeq = 0
  const execute = (agent, name, args, signal = new AbortController().signal) => ctx.tools.execute({
    signal,
    callId: ToolCallId(`compat-call-${++callSeq}`),
    name,
    arguments: args,
    agent,
  })
  return { ctx, workspace, stateRoot: join(workspace, '.agent-teams'), adapter, captain: handle.agent, execute, teamFiber }
}

async function readStoredSession(ctx, id) {
  const handle = await ctx.sessionPersistence.open(SessionId(id), 'read')
  try {
    return { header: handle.header, events: (await handle.read()).events }
  } finally {
    await handle.close()
  }
}

async function assignedTask(stateRoot, teamId, memberName) {
  return eventually(async () => {
    const team = await readTeam(stateRoot, teamId)
    return team?.tasks.find(item => item.assignee === memberName && ['claimed', 'in_progress'].includes(item.status))
  }, 'the real Team scheduler never assigned the delegated task')
}

async function completeTaskThroughMemberTools(execute, child, task, output = CHILD_OUTPUT) {
  for (const [name, args] of [
    ['agent_teams_claim_task', { task_id: task.id }],
    ['agent_teams_update_task', { task_id: task.id, attempt_id: task.attemptId, status: 'in_progress' }],
    ['agent_teams_update_task', { task_id: task.id, attempt_id: task.attemptId, status: 'completed', output }],
  ]) {
    const result = await execute(child, name, args)
    assert.equal(result.isError, false, text(result))
  }
}

test('Team captain native subagent creates an actual Team member, assigned task and durable child session', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams')
  const schema = ctx.tools.schemas(captain).find(item => item.name === 'subagent')
  assert.ok(schema, 'the official scope-local native schema remains visible to the captain')
  const result = await execute(captain, 'subagent', {
    description: '离线委派测试',
    prompt: DELEGATED_PROMPT,
  })
  assert.equal(result.isError, false, `Team captain native delegation must succeed: ${text(result)}`)
  assert.equal(result.value.kind, 'continuable')
  assert.ok(result.value.subagentId, 'success returns the actual durable child Session id')

  const team = await eventually(() => findTeamByCaptain(stateRoot, captain.id), 'native delegation did not persist an AgentTeams Team')
  assert.equal(team.phase, 'running')
  assert.equal(team.captainSessionId, captain.id)
  const member = team.members.find(item => item.id === result.value.subagentId)
  assert.ok(member, 'the returned child id belongs to a persisted Team member')
  const admittedTask = team.tasks.find(item => item.assignee === member.name)
  assert.ok(admittedTask, 'success means the requested task is durably queued for its actual member')
  assert.ok(['pending', 'claimed', 'in_progress'].includes(admittedTask.status))
  assert.equal(admittedTask.description, DELEGATED_PROMPT)
  await eventually(() => adapter.requests.length > 0, 'the real initial member greeting never executed')
  adapter.release(0)
  const task = await assignedTask(stateRoot, team.id, member.name)
  assert.equal(task.description, DELEGATED_PROMPT)
  assert.ok(task.attemptId, 'scheduler persists the attempt capability before child execution')
  const child = await eventually(() => ctx.agents.get(SessionId(member.id)), 'the Team child did not publish into the live Agent registry')
  await eventually(() => adapter.requests.length > 1, 'the production child loop never executed the scheduled task after greeting settled')
  assert.ok(JSON.stringify(adapter.requests).includes(DELEGATED_PROMPT), 'the child receives the delegated native prompt')
  const session = await readStoredSession(ctx, child.id)
  assert.equal(session.header.parentSession, captain.id)
  const descriptor = session.events.find(event => event.type === 'subagent/descriptor')
  assert.equal(descriptor?.data.mode, 'continuable')
  assert.ok(descriptor?.data.label.startsWith(`agent-teams:${team.id}:`), 'child descriptor carries AgentTeams-owned membership')

  // Drive the same public member tools a child model would use; no state file
  // writes or private lifecycle helpers are used to pretend completion.
  await completeTaskThroughMemberTools(execute, child, task)
  const persisted = await readTeam(stateRoot, team.id)
  assert.equal(persisted.tasks.find(item => item.id === task.id)?.status, 'completed')
  assert.equal(persisted.tasks.find(item => item.id === task.id)?.output, CHILD_OUTPUT)
  adapter.release(1)
})

test('Team explicit foreground waits for its actual assigned task to complete and returns official output', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams')
  let settled = false
  let observedResult
  const pending = execute(captain, 'subagent', {
    description: '前台团队委派', prompt: DELEGATED_PROMPT, run_in_background: false,
  }).then(result => { settled = true; observedResult = result; return result })
  const team = await eventually(async () => {
    if (observedResult?.isError) assert.fail(`foreground delegation was rejected: ${text(observedResult)}`)
    return findTeamByCaptain(stateRoot, captain.id)
  }, 'foreground delegation did not create a Team')
  const member = await eventually(async () => (await readTeam(stateRoot, team.id))?.members.find(item => item.id !== ''), 'foreground delegation never published a member')
  await eventually(() => adapter.requests.length > 0, 'foreground member greeting never executed')
  assert.equal(settled, false, 'foreground cannot complete while the member is still greeting')
  adapter.release(0)
  const task = await assignedTask(stateRoot, team.id, member.name)
  const child = await eventually(() => ctx.agents.get(SessionId(member.id)), 'foreground child never became live')
  await eventually(() => adapter.requests.length > 1, 'foreground child never executed its assigned task')
  assert.equal(settled, false, 'the result cannot pretend success before the actual Team task is terminal')
  await completeTaskThroughMemberTools(execute, child, task)
  adapter.release(1)
  const result = await pending
  assert.equal(result.isError, false, text(result))
  assert.deepEqual(result.value, {
    kind: 'foreground', runId: member.id, output: [{ type: 'text', text: CHILD_OUTPUT }],
  })
  assert.equal(text(result), CHILD_OUTPUT)
  const persisted = await readTeam(stateRoot, team.id)
  assert.equal(persisted.tasks.find(item => item.id === task.id)?.status, 'completed')
})

test('Team members cannot use the native subagent compatibility entry to create extra members or tasks', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams')
  const created = await execute(captain, 'agent_teams_create', { description: '成员权限夹具' })
  assert.equal(created.isError, false, text(created))
  const added = await execute(captain, 'agent_teams_add_member', { name: 'worker', role: 'offline worker' })
  assert.equal(added.isError, false, text(added))
  const task = await execute(captain, 'agent_teams_create_task', { subject: '等待中的工作', description: DELEGATED_PROMPT, assignee: 'worker' })
  assert.equal(task.isError, false, text(task))
  const before = await eventually(async () => {
    const team = await readTeam(stateRoot, created.value.team_id)
    return team?.members.find(item => item.name === 'worker')?.id ? team : undefined
  }, 'the ordinary AgentTeams fixture did not spawn its member')
  const child = ctx.agents.get(SessionId(before.members[0].id))
  assert.ok(child)
  await eventually(() => adapter.requests.length > 0, 'the fixture member did not execute')
  const beforeChildren = await ctx.subagents.listChildren(captain.id)
  const result = await execute(child, 'subagent', { description: '非法嵌套委派', prompt: DELEGATED_PROMPT })
  assert.equal(result.isError, true, 'only the captain may own the Team delegation compatibility adapter')
  assert.deepEqual(await readTeam(stateRoot, before.id), before, 'a denied member cannot mutate the existing Team')
  assert.deepEqual(await ctx.subagents.listChildren(captain.id), beforeChildren, 'a denied member cannot create a child')
  assert.equal(await findTeamByCaptain(stateRoot, child.id), undefined, 'a member cannot create a replacement Team through the alias')
  adapter.release()
})

for (const phase of ['staged', 'halted']) {
  test(`Team native delegation respects an existing ${phase} Team with zero durable mutations and zero spawns`, { timeout: 15_000 }, async t => {
    const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams')
    const created = await execute(captain, 'agent_teams_create', {
      description: `${phase} 团队边界夹具`, approval: phase === 'staged' ? 'required' : 'automatic',
    })
    assert.equal(created.isError, false, text(created))
    if (phase === 'halted') await haltTeamWork({ ctx, stateRoot, teamId: created.value.team_id, captain })
    const before = await readTeam(stateRoot, created.value.team_id)
    const beforeChildren = await ctx.subagents.listChildren(captain.id)
    const result = await execute(captain, 'subagent', { description: '必须等待边界', prompt: DELEGATED_PROMPT })
    assert.equal(result.isError, true)
    assert.match(text(result), new RegExp(phase), 'rejection must explain the actual Team boundary and recovery path')
    assert.deepEqual(await readTeam(stateRoot, before.id), before)
    assert.deepEqual(await ctx.subagents.listChildren(captain.id), beforeChildren)
    assert.equal(adapter.requests.length, 0)
  })
}

test('Concurrent Team native delegations share one Team and persist distinct members, tasks, attempts and child ids', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams')
  const prompts = [DELEGATED_PROMPT + ' 分支一', DELEGATED_PROMPT + ' 分支二']
  const results = await Promise.all(prompts.map((prompt, index) => execute(captain, 'subagent', {
    description: `并发离线委派 ${index + 1}`, prompt,
  })))
  for (const result of results) assert.equal(result.isError, false, text(result))
  const childIds = results.map(result => result.value.subagentId)
  assert.equal(new Set(childIds).size, 2, 'each concurrent call owns a distinct durable child')
  const team = await eventually(() => findTeamByCaptain(stateRoot, captain.id), 'concurrent calls did not persist a Team')
  await eventually(() => adapter.requests.length === 2, 'both initial member greetings must execute independently')
  adapter.release(0)
  adapter.release(1)
  const ready = await eventually(async () => {
    const fresh = await readTeam(stateRoot, team.id)
    return fresh?.tasks.length === 2 && fresh.tasks.every(item => item.attemptId) ? fresh : undefined
  }, 'concurrent tasks were lost or not assigned')
  assert.equal(ready.members.length, 2)
  assert.equal(new Set(ready.members.map(item => item.name)).size, 2)
  assert.deepEqual(new Set(ready.members.map(item => item.id)), new Set(childIds))
  assert.equal(new Set(ready.tasks.map(item => item.id)).size, 2)
  assert.equal(new Set(ready.tasks.map(item => item.attemptId)).size, 2)
  assert.deepEqual(new Set(ready.tasks.map(item => item.description)), new Set(prompts))
  const children = await ctx.subagents.listChildren(captain.id)
  assert.deepEqual(new Set(children.map(item => item.id)), new Set(childIds))
  await eventually(() => adapter.requests.length === 4, 'both real children must execute scheduled tasks after their initial greeting')
  adapter.release(2)
  adapter.release(3)
})

test('Team preserves the official disabled model-selection boundary with zero Team creation', { timeout: 15_000 }, async t => {
  const { stateRoot, captain, execute } = await fixture(t, 'teams')
  const result = await execute(captain, 'subagent', {
    description: '强塞模型路由', prompt: DELEGATED_PROMPT,
    provider: 'offline', model: 'offline-model',
  })
  assert.equal(result.isError, true, 'fields absent from the native model-selection schema cannot authorize a route')
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
})

test('Native compatibility joins the existing Profile Team without changing its frozen role routes or persona', { timeout: 15_000 }, async t => {
  const profiles = {
    'frozen-profile': {
      taskPlanning: 'captain', tasks: [], members: [{
        name: 'reviewer', role: '代码审查', provider: 'offline', model: 'alternate-model',
        reasoning_mode: 'target-default', executionPrompt: '审查角色必须保持原有配置。',
      }],
    },
  }
  const { stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { profiles })
  const created = await execute(captain, 'agent_teams_create', { description: '固定角色测试', profile: 'frozen-profile' })
  assert.equal(created.isError, false, text(created))
  const before = await readTeam(stateRoot, created.value.team_id)
  assert.equal(before.members.find(item => item.name === 'reviewer')?.id, '', 'an unassigned Profile role remains a cold roster row')
  const result = await execute(captain, 'subagent', { description: '代码审查', prompt: DELEGATED_PROMPT })
  assert.equal(result.isError, false, text(result))
  const after = await findTeamByCaptain(stateRoot, captain.id)
  assert.equal(after.id, before.id, 'compatibility must continue the existing Team')
  assert.equal(after.members.length, 2)
  assert.deepEqual(after.members.find(item => item.name === 'reviewer'), before.members.find(item => item.name === 'reviewer'))
  const compatibilityMember = after.members.find(item => item.id === result.value.subagentId)
  assert.ok(compatibilityMember)
  assert.equal(compatibilityMember.provider, 'offline')
  assert.equal(compatibilityMember.model, 'alternate-model', 'an exact existing role-description match retains the AgentTeams frozen role-route inheritance policy')
  assert.notEqual(compatibilityMember.id, before.members[0].id)
  await eventually(() => adapter.requests.length === 1, 'only the new compatibility member should execute a greeting')
  assert.equal(adapter.requests[0].model, 'alternate-model')
  adapter.release(0)
  const assigned = await assignedTask(stateRoot, after.id, compatibilityMember.name)
  assert.ok(assigned.attemptId)
  await eventually(() => adapter.requests.length === 2, 'the role-inheriting compatibility member never executed its real assigned task')
  assert.equal(adapter.requests[1].model, 'alternate-model')
  assert.deepEqual((await readTeam(stateRoot, before.id)).members.find(item => item.name === 'reviewer'), before.members.find(item => item.name === 'reviewer'))
})

test('Native compatibility respects the configured Team member cap without adding a task or another child', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, captain, execute } = await fixture(t, 'teams', { maxMembers: 1 })
  const first = await execute(captain, 'subagent', { description: '第一个占用角色', prompt: DELEGATED_PROMPT })
  assert.equal(first.isError, false, text(first))
  const before = await findTeamByCaptain(stateRoot, captain.id)
  const beforeChildren = await ctx.subagents.listChildren(captain.id)
  const denied = await execute(captain, 'subagent', { description: '第二个角色', prompt: DELEGATED_PROMPT })
  assert.equal(denied.isError, true)
  assert.match(text(denied), /limit|cap/i)
  assert.deepEqual(await readTeam(stateRoot, before.id), before)
  assert.deepEqual(await ctx.subagents.listChildren(captain.id), beforeChildren)
})

test('Team advertised explicit model selection creates the requested allowed route and rejects an unlisted route', { timeout: 15_000 }, async t => {
  const { stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { modelSelection: true })
  const schema = captain.ctx.tools.schemas(captain).find(item => item.name === 'subagent')
  assert.ok(schema.parameters.properties.provider)
  assert.ok(schema.parameters.properties.model)
  for (const selection of [
    { provider: '', model: '' },
    { provider: ' ', model: ' ' },
    { reasoning_effort: '' },
    { provider: 'offline' },
  ]) {
    const invalid = await execute(captain, 'subagent', {
      description: '无效显式路由', prompt: DELEGATED_PROMPT, ...selection,
    })
    assert.equal(invalid.isError, true, 'an invalid explicit native route cannot silently fall back to captain defaults')
    assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
  }
  const blocked = await execute(captain, 'subagent', {
    description: '未授权路由', prompt: DELEGATED_PROMPT,
    provider: 'offline', model: 'blocked-model',
  })
  assert.equal(blocked.isError, true, 'a catalog-advertised route still needs the session-frozen native allow-list')
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
  const allowed = await execute(captain, 'subagent', {
    description: '已授权路由', prompt: DELEGATED_PROMPT,
    provider: 'offline', model: 'alternate-model',
  })
  assert.equal(allowed.isError, false, text(allowed))
  const team = await findTeamByCaptain(stateRoot, captain.id)
  assert.ok(team)
  const member = team.members.find(item => item.id === allowed.value.subagentId)
  assert.equal(member?.provider, 'offline')
  assert.equal(member?.model, 'alternate-model')
  await eventually(() => adapter.requests.length > 0, 'the allowed route never executed')
  assert.equal(adapter.requests[0].model, 'alternate-model')
})

test('Team malformed native arguments fail validation before persistent writes or model execution', { timeout: 15_000 }, async t => {
  const { stateRoot, adapter, captain, execute } = await fixture(t, 'teams')
  for (const args of [
    { prompt: DELEGATED_PROMPT },
    { description: '缺少提示词' },
    { description: 7, prompt: DELEGATED_PROMPT },
    { description: '错误后台值', prompt: DELEGATED_PROMPT, run_in_background: 'true' },
    { description: ' ', prompt: DELEGATED_PROMPT },
  ]) {
    const result = await execute(captain, 'subagent', args)
    assert.equal(result.isError, true, `malformed arguments were accepted: ${JSON.stringify(args)}`)
    assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
    assert.equal(adapter.requests.length, 0)
  }
})

test('Cancelling a foreground compatibility wait returns an error and preserves the actual delegated Team task', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams')
  const controller = new AbortController()
  let observedResult
  const pending = execute(captain, 'subagent', {
    description: '可取消前台委派', prompt: DELEGATED_PROMPT, run_in_background: false,
  }, controller.signal).then(result => { observedResult = result; return result })
  const team = await eventually(async () => {
    if (observedResult?.isError) assert.fail(text(observedResult))
    return findTeamByCaptain(stateRoot, captain.id)
  }, 'cancel fixture did not create the actual Team')
  const member = await eventually(async () => (await readTeam(stateRoot, team.id))?.members.find(item => item.id), 'cancel fixture did not create a member')
  await eventually(() => adapter.requests.length > 0, 'cancel fixture greeting never ran')
  adapter.release(0)
  const task = await assignedTask(stateRoot, team.id, member.name)
  await eventually(() => adapter.requests.length > 1, 'cancel fixture task never ran')
  controller.abort(new Error('caller cancelled the foreground wait'))
  const result = await pending
  assert.equal(result.isError, true, 'cancelled waiting cannot be reported as successful foreground output')
  const persisted = await readTeam(stateRoot, team.id)
  const retained = persisted.tasks.find(item => item.id === task.id)
  assert.ok(retained)
  assert.equal(retained.attemptId, task.attemptId)
  assert.ok(['claimed', 'in_progress'].includes(retained.status), 'cancelling collection must not forge a completed or cancelled Team task')
  assert.equal(persisted.members.find(item => item.id === member.id)?.status === 'removed', false)
  const child = ctx.agents.get(SessionId(member.id))
  assert.ok(child, 'the durable delegated task remains owned by its real live member')
  await completeTaskThroughMemberTools(execute, child, retained)
  adapter.release(1)
  assert.equal((await readTeam(stateRoot, team.id)).tasks.find(item => item.id === task.id)?.status, 'completed')
})

test('Native captain retains the official continuable subagent path and creates no AgentTeams state', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'native')
  const result = await execute(captain, 'subagent', {
    description: '原生离线测试',
    prompt: DELEGATED_PROMPT,
  })
  assert.equal(result.isError, false, text(result))
  assert.equal(result.value.kind, 'continuable')
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
  const childId = result.value.subagentId
  await eventually(() => adapter.requests.length > 0, 'native child did not reach its production loop')
  adapter.release()
  await eventually(() => ctx.agents.get(SessionId(childId)) === undefined, 'native child did not settle and unload')
  const session = await readStoredSession(ctx, childId)
  assert.equal(session.header.parentSession, captain.id)
  assert.equal(session.events.find(event => event.type === 'subagent/descriptor')?.data.label, '原生离线测试')
  assert.ok(session.events.some(event => event.type === 'assistant/message'))
})

test('Disposing AgentTeams restores the captain official native execution without growing the persisted Team', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute, teamFiber } = await fixture(t, 'teams')
  const delegated = await execute(captain, 'subagent', { description: '卸载前团队委派', prompt: DELEGATED_PROMPT })
  assert.equal(delegated.isError, false, text(delegated))
  await eventually(() => adapter.requests.length > 0, 'Team fixture child never executed')
  const before = await findTeamByCaptain(stateRoot, captain.id)
  assert.ok(before)
  await teamFiber.dispose()
  const native = await execute(captain, 'subagent', { description: '卸载后官方原生', prompt: DELEGATED_PROMPT })
  assert.equal(native.isError, false, text(native))
  assert.equal(native.value.kind, 'continuable')
  assert.notEqual(native.value.subagentId, delegated.value.subagentId)
  assert.deepEqual(await readTeam(stateRoot, before.id), before, 'removed compatibility hooks must not add Team members or tasks')
  await eventually(() => adapter.requests.length > 1, 'restored native tool never executed a new child')
  adapter.release(1)
  await eventually(() => ctx.agents.get(SessionId(native.value.subagentId)) === undefined, 'restored native child never settled')
  const session = await readStoredSession(ctx, native.value.subagentId)
  assert.equal(session.events.find(event => event.type === 'subagent/descriptor')?.data.label, '卸载后官方原生')
  assert.deepEqual(await readTeam(stateRoot, before.id), before)
})
