/**
 * Offline reproduction of Team-mode native `subagent` compatibility.
 * The Cordis registry, tool validation/guards, production AgentLoop, spawn
 * provider, continuation manager, JSONL sessions and AgentTeams disk state are
 * real. Only the LLM adapter is deterministic test data; no network is used.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { createVolatile, updateVolatile } from '@deepseek-ai/cosmokit'
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
import { findTeamByCaptain, readMailbox, readTeam, withTeamLock } from '../lib/state.js'
import { haltTeamWork, applyQualityFollowUp } from '../lib/tools.js'
import { installAgentTeamsGestureBoundary } from '../lib/command.js'

const CHILD_OUTPUT = '离线子智能体已完成真实团队任务。'
const DELEGATED_PROMPT = '读取测试任务上下文，并在团队任务中报告结果；这是离线夹具，不访问任何外部服务。'
const ORDINARY_PROFILE = { profiles: { ordinary: { taskPlanning: 'captain', members: [{ name: 'worker', reasoning_mode: 'target-default' }] } }, defaultProfile: 'ordinary' }

function authorizeTemporary(captain) {
  captain.session.append('turn/start', { turn: 2 })
  captain.session.append('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '/agent-teams --temporary offline continuation' }] }, { surfaceOp: 'append' })
}

function text(result) {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

async function eventually(read, message, timeoutMs = 5_000, diagnose) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (value) return value
    await delay(10)
  }
  assert.fail(diagnose === undefined ? message : `${message}; ${await diagnose()}`)
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
    return {
      provider, id: model, name: model,
      reasoning: { efforts: ['low', 'high'].map(id => ({ id, name: id })) },
    }
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

async function fixture(t, mode, { modelSelection = false, profiles = {}, defaultProfile, maxMembers = 4, temporaryMember, temporaryAuthorization = false, currentUserMessage } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-team-subagent-compat-'))
  const ctx = new Context()
  const adapter = new OfflineAdapter()
  const statusEvents = []
  const toolResults = []
  ctx.on('agent/status', ({ agent, status }) => { statusEvents.push({ id: agent.id, status }) })
  ctx.on('agent/error', ({ agent, error }) => { statusEvents.push({ id: agent.id, error: String(error) }) })
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
    ...(defaultProfile === undefined ? {} : { defaultProfile }),
    ...(temporaryMember === undefined ? {} : { temporaryMember }),
    slashCommand: false,
  })
  await teamFiber
  ctx.llm.registerAdapter(['offline', 'temporary-offline'], adapter)
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
  if (mode === 'teams' && (temporaryAuthorization || currentUserMessage !== undefined)) {
    handle.agent.session.append('turn/start', { turn: 1 })
    handle.agent.session.append('user/message', {
      source: { kind: 'user' }, content: [{ type: 'text', text: currentUserMessage ?? '/agent-teams --temporary offline regression' }],
    }, { surfaceOp: 'append' })
  }
  let callSeq = 0
  const execute = (agent, name, args, signal = new AbortController().signal) => ctx.tools.execute({
    signal,
    callId: ToolCallId(`compat-call-${++callSeq}`),
    name,
    arguments: args,
    agent,
  }).then(result => {
    toolResults.push({ name, isError: result.isError, error: result.error?.message })
    return result
  })
  const stateRoot = join(workspace, '.agent-teams')
  const diagnose = async () => {
    const team = await findTeamByCaptain(stateRoot, handle.agent.id)
    return JSON.stringify({
      phase: team?.phase,
      members: team?.members.map(({ id, name, status }) => ({ id, name, status, liveStatus: ctx.agents.get(SessionId(id))?.status })),
      tasks: team?.tasks.map(({ id, status, assignee, attemptId }) => ({ id, status, assignee, attemptId })),
      childRequests: adapter.requests.map(({ sessionId }) => sessionId),
      statusEvents: statusEvents.slice(-128), toolResults: toolResults.slice(-64),
    })
  }
  return { ctx, workspace, stateRoot, adapter, captain: handle.agent, execute, teamFiber, diagnose }
}

async function readStoredSession(ctx, id) {
  const handle = await ctx.sessionPersistence.open(SessionId(id), 'read')
  try {
    return { header: handle.header, events: (await handle.read()).events }
  } finally {
    await handle.close()
  }
}

test('missing trusted Profile rejects model Profile, inline and empty create without writes', async t => {
  const { captain, stateRoot, execute } = await fixture(t, 'teams', { profiles: ORDINARY_PROFILE.profiles })
  for (const args of [{}, { profile: 'ordinary' }, { profile: ' ' }, { plan: { members: [{ name: 'worker' }], tasks: [{ id: 't', subject: 'work', assignee: 'worker' }] } }]) {
    const result = await execute(captain, 'agent_teams_create', { description: 'unbound model plan', ...args })
    assert.equal(result.isError, true)
    assert.match(text(result), /requires.*Profile/i)
    assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
  }
})

test('an ended direct-user Profile command cannot bind a later model creation', async t => {
  const { captain, stateRoot, execute } = await fixture(t, 'teams', { profiles: ORDINARY_PROFILE.profiles, currentUserMessage: '/agent-teams --profile ordinary work' })
  captain.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const result = await execute(captain, 'agent_teams_create', { description: 'expired command' })
  assert.equal(result.isError, true)
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
})

test('creation freezes one Profile revision before waiting for the captain lock', async t => {
  const { ctx, captain, stateRoot, teamFiber } = await fixture(t, 'teams', ORDINARY_PROFILE)
  const entered = Promise.withResolvers()
  const release = Promise.withResolvers()
  const holding = withTeamLock(`captain:${stateRoot}:${captain.id}`, async () => { entered.resolve(); await release.promise })
  await entered.promise
  const volatile = teamFiber.config.profiles
  try {
    // Direct registered execute enters its synchronous admission before awaiting the held lock.
    const pending = ctx.tools.get('agent_teams_create', captain).execute({ description: 'snapshot race' }, { agent: captain, callId: ToolCallId('race-create'), signal: new AbortController().signal })
    updateVolatile(volatile, createVolatile({ ordinary: { taskPlanning: 'captain', members: [{ name: 'changed-role', reasoning_mode: 'target-default' }] } }))
    release.resolve()
    const result = await pending
    const team = await readTeam(stateRoot, result.team_id)
    assert.deepEqual(team.members.map(member => member.name), ['worker'])
  } finally { release.resolve(); await holding }
})

test('ordinary admission rejects description guessing and temporary exact or numbered clones', async t => {
  const { captain, stateRoot, execute } = await fixture(t, 'teams', { ...ORDINARY_PROFILE, temporaryAuthorization: true })
  const created = await execute(captain, 'agent_teams_create', { description: 'role admission' })
  assert.equal(created.isError, false, text(created))
  const temporary = await execute(captain, 'agent_teams_add_member', { name: 'temporary', role: 'worker' })
  assert.equal(temporary.isError, false, text(temporary))
  captain.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const before = await readTeam(stateRoot, created.value.team_id)
  for (const args of [
    { name: 'guessed', role: 'worker' }, { name: 'guessed', role: 'worker', provider: 'offline', model: 'offline-model' },
    { name: 'clone', role_template: 'temporary' }, { name: 'temporary2' },
  ]) {
    const denied = await execute(captain, 'agent_teams_add_member', args)
    assert.equal(denied.isError, true)
    assert.deepEqual(await readTeam(stateRoot, before.id), before)
  }
})

test('contradictory, quoted, cancelled and untrusted grants do not expose or execute temporary tools', async t => {
  const { ctx, captain, stateRoot, execute, adapter } = await fixture(t, 'teams')
  for (const [source, message] of [
    ['user', '允许使用临时子智能体，但是不能调用临时子智能体'], ['user', '允许使用临时子智能体，取消授权'],
    ['user', '“允许使用临时子智能体”'], ['plugin', '/agent-teams --temporary work'],
    ['user', '/agent-teams --temporary'], ['user', '/agent-teams --temporary 不要启动，只解释边界'],
    ['user', '/agent-teams --temporary review; cancel authorization'],
    ['user', '/agent-teams --temporary inspect this; do not spawn a temporary subagent'],
    ['user', '/agent-teams --temporary 请只解释，不允许调用临时子智能体'],
  ]) {
    captain.session.append('turn/start', { turn: 1 })
    captain.session.append('user/message', { source: { kind: source, plugin: 'skill' }, content: [{ type: 'text', text: message }] }, { surfaceOp: 'append' })
    assert.equal(ctx.tools.schemas(captain).some(item => item.name === 'subagent'), false)
    const denied = await execute(captain, 'subagent', { description: 'no permission', prompt: DELEGATED_PROMPT })
    assert.equal(denied.isError, true)
    assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
    assert.equal(adapter.requests.length, 0)
  }
})

test('staged temporary tasks require fresh admission for additions, edits and amendments', { timeout: 15_000 }, async t => {
  const { captain, stateRoot, execute } = await fixture(t, 'teams', {
    profiles: { delivery: { taskPlanning: 'captain', members: [{ name: 'reviewer', reasoning_mode: 'target-default' }] } },
    defaultProfile: 'delivery', temporaryAuthorization: true,
  })
  const created = await execute(captain, 'agent_teams_create', { description: 'staged admission', approval: 'required' })
  assert.equal(created.isError, false, text(created))
  const added = await execute(captain, 'agent_teams_add_member', { name: 'temporary-worker' })
  assert.equal(added.isError, false, text(added))
  const edit = operations => execute(captain, 'agent_teams_edit_plan', { operations })
  const admitted = await edit([{ action: 'add_task', subject: 'authorized work', assignee: 'temporary-worker' }])
  assert.equal(admitted.isError, false, text(admitted))
  const before = await readTeam(stateRoot, created.value.team_id)
  assert.equal(before.tasks[0].temporaryAdmission, true, 'authorized staged work must be schedulable')
  captain.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  for (const operations of [
    [{ action: 'add_task', subject: 'unauthorized new work', assignee: 'temporary-worker' }],
    [{ action: 'update_task', task_id: before.tasks[0].id, subject: 'changed scope' }],
    [{ action: 'update_member', member_name: 'temporary-worker', execution_prompt: 'new work' }],
  ]) {
    const denied = await edit(operations)
    assert.equal(denied.isError, true, 'expired admission cannot change temporary work')
    assert.deepEqual(await readTeam(stateRoot, before.id), before, 'rejection must be atomic')
  }
  const amendment = await execute(captain, 'agent_teams_amend_task', { task_id: before.tasks[0].id, reason: 'new scope', objective: 'different work' })
  assert.equal(amendment.isError, true)
  assert.deepEqual(await readTeam(stateRoot, before.id), before)
  const reassigned = await edit([{ action: 'update_task', task_id: before.tasks[0].id, assignee: 'reviewer' }])
  assert.equal(reassigned.isError, false, text(reassigned))
  assert.equal((await readTeam(stateRoot, before.id)).tasks[0].temporaryAdmission, undefined)
})

test('rejected temporary gestures never activate an ordinary Team while valid temporary and Profile aliases remain distinct', async t => {
  const { captain, stateRoot, ctx, adapter } = await fixture(t, 'teams', ORDINARY_PROFILE)
  let gesture
  const profiles = { ...ORDINARY_PROFILE.profiles, temporary: ORDINARY_PROFILE.profiles.ordinary }
  installAgentTeamsGestureBoundary({ on(name, callback) { assert.equal(name, 'agent/pre-step'); gesture = callback } }, () => profiles)
  const enter = async command => {
    const messages = [{ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: command }] }]
    return gesture({ messages, signal: new AbortController().signal }, async () => ({ kind: 'enter', messages }))
  }
  const invalidDecisions = []
  for (const command of ['/agent-teams --temporary', '/agent-teams --temporary 不要启动，只解释边界',
    '/agent-teams --temporary review; cancel authorization',
    '/agent-teams --temporary inspect this; do not spawn a temporary subagent',
    '/agent-teams --temporary 请只解释，不允许调用临时子智能体',
  ]) {
    invalidDecisions.push(await enter(command))
    assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
    assert.equal((await ctx.subagents.listChildren(captain.id)).length, 0)
    assert.equal(adapter.requests.length, 0)
  }
  assert.ok(invalidDecisions.every(decision => decision.messages.length === 1), 'neither missing-goal nor refused temporary gesture may add activation')
  const temporary = await enter('/agent-teams --temporary inspect current boundary')
  assert.match(temporary.messages.at(-1).content[0].text, /official subagent/)
  assert.doesNotMatch(temporary.messages.at(-1).content[0].text, /agent_teams_create/)
  const alias = await enter('/agent-teams-temporary inspect current boundary')
  assert.match(alias.messages.at(-1).content[0].text, /profile="temporary"/)
  assert.match(alias.messages.at(-1).content[0].text, /agent_teams_create/)
})

test('host quality follow-up inherits temporary admission only from the original task owner', () => {
  const implementation = { id: 't1', kind: 'implementation', status: 'completed', assignee: 'builder', temporaryAdmission: true, inScope: ['src/parser.ts'], verify: ['pnpm test'], objective: 'parser', dependencies: [] }
  const review = { id: 't2', kind: 'review', status: 'failed', assignee: 'critic', temporaryAdmission: true, reviewedTaskId: 't1', verdict: 'needs_revision', acceptance: ['no high findings'], dependencies: [], findings: [{ id: 'F1', severity: 'high', problem: 'null crash', requiredFix: 'guard empty input', file: 'src/parser.ts' }] }
  const team = { taskSeq: 2, members: ['builder', 'critic'].map(name => ({ name, id: name, status: 'idle', temporaryAdmission: true })), tasks: [implementation, review] }
  const followup = applyQualityFollowUp(team, review)
  assert.equal(followup.created.length, 2)
  assert.deepEqual(followup.created.map(task => [task.kind, task.assignee, task.temporaryAdmission]), [['repair', 'builder', true], ['review', 'critic', true]])
  const unadmitted = structuredClone(team)
  unadmitted.tasks = [ { ...implementation, temporaryAdmission: undefined }, { ...review, temporaryAdmission: undefined } ]
  const rejectedInheritance = applyQualityFollowUp(unadmitted, unadmitted.tasks[1])
  assert.ok(rejectedInheritance.created.every(task => task.temporaryAdmission === undefined), 'mere model-provided lineage never grants admission')
})

test('dependency-bound verification repair inherits only its actual admitted source owner', () => {
  const implementation = { id: 't1', kind: 'implementation', status: 'completed', assignee: 'builder', temporaryAdmission: true, inScope: ['src/parser.ts'], verify: ['node check'], dependencies: [] }
  const unrelated = { ...implementation, id: 't2', assignee: 'other-builder' }
  const verification = { id: 't3', kind: 'verification', status: 'failed', assignee: 'tester', temporaryAdmission: true, dependencies: ['t1'], findings: [{ id: 'F1', severity: 'high', problem: 'null crash', requiredFix: 'guard empty input', file: 'src/parser.ts' }] }
  const makeTeam = () => ({ taskSeq: 3, members: ['builder', 'other-builder', 'tester'].map(name => ({ name, id: name, status: 'idle', temporaryAdmission: true })), tasks: structuredClone([implementation, unrelated, verification]) })
  const team = makeTeam()
  const followup = applyQualityFollowUp(team, team.tasks[2])
  assert.deepEqual(followup.created.map(task => [task.kind, task.assignee, task.temporaryAdmission]), [['repair', 'builder', true], ['verification', 'tester', true]])
  for (const change of ['unadmitted', 'unrelated', 'different-owner']) {
    const denied = makeTeam()
    if (change === 'unadmitted') delete denied.tasks[0].temporaryAdmission
    if (change === 'unrelated') denied.tasks[2].dependencies = []
    if (change === 'different-owner') denied.members[0].status = 'removed'
    const result = applyQualityFollowUp(denied, denied.tasks[2])
    assert.ok(result.created.filter(task => task.kind === 'repair').every(task => task.temporaryAdmission === undefined), change)
  }
})

test('expired temporary owners complete two dependency-bound verification repair rounds without a new grant', { timeout: 25_000 }, async t => {
  const { ctx, captain, stateRoot, adapter, execute } = await fixture(t, 'teams', { ...ORDINARY_PROFILE, temporaryAuthorization: true })
  const created = await execute(captain, 'agent_teams_create', { description: 'temporary verification lineage' })
  assert.equal(created.isError, false, text(created))
  for (const name of ['builder', 'tester']) {
    const added = await execute(captain, 'agent_teams_add_member', { name })
    assert.equal(added.isError, false, text(added))
  }
  const implementation = await execute(captain, 'agent_teams_create_task', { subject: 'parser', assignee: 'builder', kind: 'implementation', objective: 'parser', inScope: ['src/parser.ts'], acceptance: ['parses empty input'], verify: ['node check'] })
  assert.equal(implementation.isError, false, text(implementation))
  const verification = await execute(captain, 'agent_teams_create_task', { subject: 'verify parser', assignee: 'tester', dependencies: [implementation.value.task_id], kind: 'verification', objective: 'verify parser', acceptance: ['parses empty input'], verify: ['node check'] })
  assert.equal(verification.isError, false, text(verification))
  captain.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const team = await readTeam(stateRoot, created.value.team_id)
  const builder = team.members.find(member => member.name === 'builder')
  const tester = team.members.find(member => member.name === 'tester')
  await eventually(() => adapter.requests.length === 2, 'temporary owner greetings must run')
  adapter.release(0); adapter.release(1)
  const finish = async (member, task, args) => {
    const child = await eventually(() => ctx.agents.get(SessionId(member.id)), 'actual verification actor must be live')
    for (const [name, fields] of [
      ['agent_teams_claim_task', {}], ['agent_teams_update_task', { status: 'in_progress', attempt_id: task.attemptId }],
      ['agent_teams_update_task', { ...args, attempt_id: task.attemptId }],
    ]) {
      const result = await execute(child, name, { task_id: task.id, ...fields })
      assert.equal(result.isError, false, text(result))
    }
    adapter.requests.forEach((request, i) => { if (request.sessionId === member.id) adapter.release(i) })
  }
  const implTask = await assignedTask(stateRoot, team.id, builder.name)
  await finish(builder, implTask, { status: 'completed', output: 'parser', changedPaths: ['src/parser.ts'], acceptanceResults: [{ criterion: 'parses empty input', status: 'passed' }], commandsRun: [{ command: 'node check', status: 'passed' }] })
  await eventually(() => ctx.agents.get(SessionId(builder.id)) === undefined, 'implementation owner must unload before automatic repair')
  for (const round of [1, 2]) {
    const gate = await assignedTask(stateRoot, team.id, tester.name)
    assert.equal(gate.kind, 'verification')
    assert.equal(gate.reviewedTaskId, undefined)
    assert.equal(gate.sourceTaskId, undefined)
    assert.equal(gate.temporaryAdmission, true)
    await finish(tester, gate, { status: 'failed', findings: [{ id: `F${round}`, severity: 'high', problem: 'null crash', requiredFix: 'guard empty input', file: 'src/parser.ts' }] })
    const afterFailure = await readTeam(stateRoot, team.id)
    const generated = afterFailure.tasks.find(task => task.kind === 'repair' && task.round === round + 1)
    assert.equal(generated?.temporaryAdmission, true, `verification round ${round} must admit its dependency-derived repair`)
    const repair = await assignedTask(stateRoot, team.id, builder.name)
    assert.equal(repair.id, generated.id)
    await finish(builder, repair, { status: 'completed', output: 'guarded', changedPaths: ['src/parser.ts'], acceptanceResults: [{ criterion: 'guard empty input', status: 'passed' }], commandsRun: [{ command: 'node check', status: 'passed' }], findingsResolved: [`F${round}`] })
  }
  const finalCheck = await assignedTask(stateRoot, team.id, tester.name)
  assert.equal(finalCheck.kind, 'verification')
  assert.equal(finalCheck.round, 3)
  assert.equal(finalCheck.temporaryAdmission, true)
  await finish(tester, finalCheck, { status: 'completed', output: 'verification passed', acceptanceResults: [{ criterion: 'parses empty input', status: 'passed' }], commandsRun: [{ command: 'node check', status: 'passed' }] })
  assert.equal((await readTeam(stateRoot, team.id)).tasks.find(task => task.id === finalCheck.id).status, 'completed')
  assert.equal(ctx.tools.schemas(captain).some(item => item.name === 'subagent'), false, 'no fresh temporary grant was introduced')
})

test('expired temporary owners complete a real cold repair and next review after a failing review', { timeout: 20_000 }, async t => {
  const { ctx, captain, stateRoot, adapter, execute } = await fixture(t, 'teams', { ...ORDINARY_PROFILE, temporaryAuthorization: true })
  const created = await execute(captain, 'agent_teams_create', { description: 'temporary quality lineage' })
  assert.equal(created.isError, false, text(created))
  for (const name of ['builder', 'critic']) {
    const added = await execute(captain, 'agent_teams_add_member', { name })
    assert.equal(added.isError, false, text(added))
  }
  const implementation = await execute(captain, 'agent_teams_create_task', { subject: 'parser', assignee: 'builder', kind: 'implementation', objective: 'parser', inScope: ['src/parser.ts'], acceptance: ['parses empty input'], verify: ['node check'] })
  assert.equal(implementation.isError, false, text(implementation))
  const review = await execute(captain, 'agent_teams_create_task', { subject: 'review parser', assignee: 'critic', dependencies: [implementation.value.task_id], kind: 'review', objective: 'review parser', acceptance: ['no high findings'], reviewedTaskId: implementation.value.task_id })
  assert.equal(review.isError, false, text(review))
  captain.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const team = await readTeam(stateRoot, created.value.team_id)
  const builder = team.members.find(member => member.name === 'builder')
  const critic = team.members.find(member => member.name === 'critic')
  await eventually(() => adapter.requests.length === 2, 'temporary owner greetings must run')
  adapter.release(0); adapter.release(1)
  const implTask = await assignedTask(stateRoot, team.id, builder.name)
  await eventually(() => adapter.requests.some((request, i) => i >= 2 && request.sessionId === builder.id), 'implementation must run')
  const finish = async (member, task, args) => {
    const child = await eventually(() => ctx.agents.get(SessionId(member.id)), 'actual quality actor must be live')
    for (const [name, fields] of [
      ['agent_teams_claim_task', {}], ['agent_teams_update_task', { status: 'in_progress', attempt_id: task.attemptId }],
      ['agent_teams_update_task', { ...args, attempt_id: task.attemptId }],
    ]) {
      const result = await execute(child, name, { task_id: task.id, ...fields })
      assert.equal(result.isError, false, text(result))
    }
  }
  await finish(builder, implTask, { status: 'completed', output: 'parser', changedPaths: ['src/parser.ts'], acceptanceResults: [{ criterion: 'parses empty input', status: 'passed' }], commandsRun: [{ command: 'node check', status: 'passed' }] })
  adapter.requests.forEach((request, i) => { if (request.sessionId === builder.id) adapter.release(i) })
  await eventually(() => ctx.agents.get(SessionId(builder.id)) === undefined, 'the implementation owner must unload before automatic repair')
  const reviewTask = await assignedTask(stateRoot, team.id, critic.name)
  await eventually(() => adapter.requests.some((request, i) => i >= 2 && request.sessionId === critic.id), 'first review must run')
  await finish(critic, reviewTask, { status: 'failed', verdict: 'needs_revision', findings: [{ id: 'F1', severity: 'high', problem: 'null crash', requiredFix: 'guard empty input', file: 'src/parser.ts' }] })
  adapter.requests.forEach((request, i) => { if (request.sessionId === critic.id) adapter.release(i) })
  const repair = await assignedTask(stateRoot, team.id, builder.name)
  assert.equal(repair.kind, 'repair')
  assert.equal(repair.temporaryAdmission, true)
  await finish(builder, repair, { status: 'completed', output: 'guarded', changedPaths: ['src/parser.ts'], acceptanceResults: [{ criterion: 'guard empty input', status: 'passed' }], commandsRun: [{ command: 'node check', status: 'passed' }], findingsResolved: ['F1'] })
  adapter.requests.forEach((request, i) => { if (request.sessionId === builder.id) adapter.release(i) })
  const recheck = await assignedTask(stateRoot, team.id, critic.name)
  assert.notEqual(recheck.id, reviewTask.id)
  assert.equal(recheck.temporaryAdmission, true)
  await finish(critic, recheck, { status: 'completed', verdict: 'pass', output: 'review passed', acceptanceResults: [{ criterion: 'no high findings', status: 'passed' }] })
  assert.equal((await readTeam(stateRoot, team.id)).tasks.find(task => task.id === recheck.id).verdict, 'pass')
})

async function assignedTask(stateRoot, teamId, memberName, diagnose) {
  return eventually(async () => {
    const team = await readTeam(stateRoot, teamId)
    return team?.tasks.find(item => item.assignee === memberName && ['claimed', 'in_progress'].includes(item.status))
  }, 'the real Team scheduler never assigned the delegated task', 5_000, diagnose)
}

test('Team captain cannot see or directly execute temporary subagent without current user authorization', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { temporaryMember: TEMPORARY_MEMBER_POLICY, temporaryAuthorization: false })
  assert.equal(ctx.tools.schemas(captain).some(item => item.name === 'subagent'), false,
    'an unapproved Team captain must not receive the native subagent schema')
  const result = await execute(captain, 'subagent', { description: '未授权临时委派', prompt: DELEGATED_PROMPT })
  assert.equal(result.isError, true, 'a hidden temporary subagent must remain rejected on direct execution')
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
  assert.equal((await ctx.subagents.listChildren(captain.id)).length, 0)
  assert.equal(adapter.requests.length, 0)
})

test('a completed authorized turn expires temporary subagent visibility and direct execution', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { temporaryAuthorization: true, temporaryMember: TEMPORARY_MEMBER_POLICY })
  assert.equal(ctx.tools.schemas(captain).some(item => item.name === 'subagent'), true)
  captain.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  assert.equal(ctx.tools.schemas(captain).some(item => item.name === 'subagent'), false)
  const denied = await execute(captain, 'subagent', { description: '过期临时委派', prompt: DELEGATED_PROMPT })
  assert.equal(denied.isError, true)
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
  assert.equal(adapter.requests.length, 0)
})

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

test('current direct Profile commands bind ordinary create and reject model conflicts before Team writes', { timeout: 15_000 }, async t => {
  const profiles = {
    alpha: { taskPlanning: 'captain', members: [{ name: 'analyst', reasoning_mode: 'target-default' }] },
    beta: { taskPlanning: 'captain', members: [{ name: 'reviewer', reasoning_mode: 'route-aware' }] },
  }
  const { captain, stateRoot, execute } = await fixture(t, 'teams', {
    profiles, defaultProfile: 'alpha', currentUserMessage: '/agent-teams --profile beta trusted release scope',
  })
  const conflict = await execute(captain, 'agent_teams_create', { description: 'model cannot replace the direct Profile', profile: 'alpha' })
  assert.equal(conflict.isError, true)
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined, 'a Profile conflict must fail before durable Team writes')
  const created = await execute(captain, 'agent_teams_create', { description: 'trusted direct Profile wins' })
  assert.equal(created.isError, false, text(created))
  assert.equal((await readTeam(stateRoot, created.value.team_id)).profile.name, 'beta')
})

test('a fixed seed Profile with zero tasks rejects before creating a Team', { timeout: 15_000 }, async t => {
  const { captain, stateRoot, execute } = await fixture(t, 'teams', {
    profiles: { empty: { taskPlanning: 'seed', members: [{ name: 'analyst', reasoning_mode: 'target-default' }], tasks: [] } },
    defaultProfile: 'empty', temporaryAuthorization: false,
  })
  const rejected = await execute(captain, 'agent_teams_create', { description: 'this Profile has no approved fixed work' })
  assert.equal(rejected.isError, true)
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
})

test('Live official Profile changes route new Teams while numbered roles retain each Team frozen route', { timeout: 15_000 }, async t => {
  const firstProfiles = {
    delivery: { taskPlanning: 'captain', members: [{
      name: 'reviewer', role: '代码审查员', provider: 'offline', model: 'alternate-model',
      reasoning_mode: 'explicit', reasoning_effort: 'low', executionPrompt: '保留首次团队的审查职责。',
    }] },
  }
  const { ctx, workspace, stateRoot, adapter, captain, execute, teamFiber } = await fixture(t, 'teams', { profiles: firstProfiles, defaultProfile: 'delivery' })
  const first = await execute(captain, 'agent_teams_create', { description: '首次官方配置快照', profile: 'delivery' })
  assert.equal(first.isError, false, text(first))
  const frozen = await readTeam(stateRoot, first.value.team_id)
  const secondProfiles = {
    delivery: { taskPlanning: 'captain', members: [{
      name: 'reviewer', role: '代码审查员', provider: 'temporary-offline', model: 'blocked-model',
      reasoning_mode: 'explicit', reasoning_effort: 'high', executionPrompt: '新团队使用更新的审查职责。',
    }] },
    'newly-saved': { taskPlanning: 'captain', members: [{ name: 'analyst', reasoning_mode: 'target-default' }] },
  }
  // ConfigEditor uses this same official Volatile boundary without remounting
  // the plugin. No desktop cache or already-created Team state is rewritten.
  updateVolatile(teamFiber.config.profiles, createVolatile(secondProfiles))
  assert.deepEqual((await readTeam(stateRoot, first.value.team_id)).members, frozen.members)
  const firstAdded = await execute(captain, 'agent_teams_add_member', { name: 'reviewer-2' })
  assert.equal(firstAdded.isError, false, text(firstAdded))
  const firstRequest = await eventually(() => adapter.requests.find(request => request.sessionId === firstAdded.value.member_id), 'the first Team numbered reviewer never requested its model')
  assert.equal(firstRequest.provider, 'offline')
  assert.equal(firstRequest.model, 'alternate-model')
  assert.equal(firstRequest.reasoningEffort, 'low')

  const nextCaptain = await ctx.agents.create({
    sessionId: SessionId('profile-second-captain'), meta: { cwd: workspace },
    agentOptions: { provider: 'offline', model: 'offline-model' },
  })
  const second = await execute(nextCaptain.agent, 'agent_teams_create', { description: '更新后的官方配置快照', profile: 'delivery' })
  assert.equal(second.isError, false, text(second))
  const newer = await readTeam(stateRoot, second.value.team_id)
  const reviewer = newer.members.find(member => member.name === 'reviewer')
  assert.equal(reviewer.provider, 'temporary-offline')
  assert.equal(reviewer.model, 'blocked-model')
  assert.equal(reviewer.reasoningMode, 'explicit')
  assert.equal(reviewer.reasoningEffort, 'high')
  assert.equal(reviewer.executionPrompt, secondProfiles.delivery.members[0].executionPrompt)
  const secondAdded = await execute(nextCaptain.agent, 'agent_teams_add_member', { name: 'reviewer-2' })
  assert.equal(secondAdded.isError, false, text(secondAdded))
  const secondRequest = await eventually(() => adapter.requests.find(request => request.sessionId === secondAdded.value.member_id), 'the new Team numbered reviewer never requested its updated model')
  assert.equal(secondRequest.provider, 'temporary-offline')
  assert.equal(secondRequest.model, 'blocked-model')
  assert.equal(secondRequest.reasoningEffort, 'high')

  const discoveredCaptain = await ctx.agents.create({ sessionId: SessionId('profile-discovery-captain'), meta: { cwd: workspace }, agentOptions: { provider: 'offline', model: 'offline-model' } })
  discoveredCaptain.agent.session.append('turn/start', { turn: 1 })
  discoveredCaptain.agent.session.append('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '/agent-teams --profile newly-saved inspect' }] }, { surfaceOp: 'append' })
  const discovered = await execute(discoveredCaptain.agent, 'agent_teams_create', { description: '新保存的配置可被精确选择', profile: 'newly-saved' })
  assert.equal(discovered.isError, false, text(discovered))
  assert.equal((await readTeam(stateRoot, discovered.value.team_id)).profile.name, 'newly-saved')
})

test('Team captain native subagent creates an actual Team member, assigned task and durable child session', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { temporaryAuthorization: true })
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

test('temporary-admission markers are host-only strict state, never model tool fields', { timeout: 15_000 }, async t => {
  const { ctx, captain, stateRoot, execute } = await fixture(t, 'teams', { temporaryAuthorization: true, temporaryMember: TEMPORARY_MEMBER_POLICY })
  const directSchemas = ctx.tools.schemas(captain)
  for (const name of ['agent_teams_add_member', 'agent_teams_create_task', 'agent_teams_reassign_task', 'agent_teams_edit_plan']) {
    const schema = directSchemas.find(item => item.name === name)
    assert.ok(schema, `${name} must remain available to the captain`)
    assert.doesNotMatch(JSON.stringify(schema), /temporaryAdmission/, `${name} must not admit a model-forged marker`)
  }
  const result = await execute(captain, 'subagent', { description: '临时标记验证', prompt: DELEGATED_PROMPT })
  assert.equal(result.isError, false, text(result))
  const team = await findTeamByCaptain(stateRoot, captain.id)
  assert.ok(team)
  assert.equal(team.members.some(member => member.temporaryAdmission === true), true)
  assert.equal(team.tasks.some(task => task.temporaryAdmission === true), true)
  const stateFile = join(stateRoot, team.id, 'team.json')
  const original = await readFile(stateFile, 'utf8')
  const malformedMember = structuredClone(team)
  malformedMember.members.find(member => member.temporaryAdmission === true).temporaryAdmission = false
  await writeFile(stateFile, JSON.stringify(malformedMember))
  await assert.rejects(() => readTeam(stateRoot, team.id), /invalid|temporaryAdmission|valid member/i, 'false member marker is rejected without migration')
  await writeFile(stateFile, original)
  const malformedTask = structuredClone(team)
  malformedTask.tasks.find(task => task.temporaryAdmission === true).temporaryAdmission = false
  await writeFile(stateFile, JSON.stringify(malformedTask))
  await assert.rejects(() => readTeam(stateRoot, team.id), /invalid|temporaryAdmission|valid task|durable team contract/i, 'false task marker is rejected without migration')
})

test('expired temporary authorization cannot assign new work to its existing member', { timeout: 15_000 }, async t => {
  const { captain, stateRoot, execute } = await fixture(t, 'teams', { temporaryAuthorization: true, temporaryMember: TEMPORARY_MEMBER_POLICY })
  const delegated = await execute(captain, 'subagent', { description: '跨回合临时成员', prompt: DELEGATED_PROMPT })
  assert.equal(delegated.isError, false, text(delegated))
  const before = await findTeamByCaptain(stateRoot, captain.id)
  const member = before.members.find(candidate => candidate.temporaryAdmission === true)
  assert.ok(member)
  captain.session.append('turn/start', { turn: 2 })
  captain.session.append('user/message', {
    source: { kind: 'user' }, content: [{ type: 'text', text: 'continue normally without temporary delegation' }],
  }, { surfaceOp: 'append' })
  const denied = await execute(captain, 'agent_teams_create_task', {
    subject: 'ordinary later work', description: 'must not reuse the expired temporary route', assignee: member.name,
  })
  assert.equal(denied.isError, true)
  assert.match(text(denied), /temporary|authorize/i)
  assert.equal((await readTeam(stateRoot, before.id)).tasks.length, before.tasks.length)
})

test('Team explicit foreground waits for its actual assigned task to complete and returns official output', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute, diagnose } = await fixture(t, 'teams', { temporaryAuthorization: true })
  let settled = false
  let observedResult
  const pending = execute(captain, 'subagent', {
    description: '前台团队委派', prompt: DELEGATED_PROMPT, run_in_background: false,
  }).then(result => { settled = true; observedResult = result; return result })
  const team = await eventually(async () => {
    if (observedResult?.isError) assert.fail(`foreground delegation was rejected: ${text(observedResult)}`)
    return findTeamByCaptain(stateRoot, captain.id)
  }, 'foreground delegation did not create a Team')
  const member = await eventually(async () => {
    if (observedResult?.isError) assert.fail(`foreground delegation was rejected: ${text(observedResult)}`)
    return (await readTeam(stateRoot, team.id))?.members.find(item => item.id !== '')
  }, 'foreground delegation never published a member', 5_000, diagnose)
  await eventually(() => adapter.requests.length > 0, 'foreground member greeting never executed')
  assert.equal(settled, false, `foreground cannot complete while the member is still greeting; ${observedResult === undefined ? '' : text(observedResult)}`)
  adapter.release(0)
  const task = await assignedTask(stateRoot, team.id, member.name, diagnose)
  const child = await eventually(() => ctx.agents.get(SessionId(member.id)), 'foreground child never became live')
  await eventually(() => adapter.requests.length > 1, 'foreground child never executed its assigned task')
  assert.equal(settled, false, `the result cannot pretend success before the actual Team task is terminal; ${observedResult === undefined ? '' : text(observedResult)}`)
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
  await eventually(() => ctx.agents.get(SessionId(member.id)) === undefined, 'completed temporary member must unload')
  captain.session.append('turn/start', { turn: 2 })
  captain.session.append('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: 'continue normally' }] }, { surfaceOp: 'append' })
  const beforeMessage = await readTeam(stateRoot, team.id)
  const mailboxBeforeMessage = await readMailbox(stateRoot, team.id, member.name)
  const requestsBeforeMessage = adapter.requests.length
  const deniedMessage = await execute(captain, 'agent_teams_send_message', { to: member.name, content: 'new work without temporary permission' })
  assert.equal(deniedMessage.isError, true)
  assert.match(text(deniedMessage), /temporary|authorize/i)
  assert.deepEqual(await readTeam(stateRoot, team.id), beforeMessage, 'completed temporary member receives no mailbox or task writes')
  assert.deepEqual(await readMailbox(stateRoot, team.id, member.name), mailboxBeforeMessage, 'denial does not append a mailbox entry')
  assert.equal(adapter.requests.length, requestsBeforeMessage, 'completed temporary member is not woken')
})

test('Team members cannot use the native subagent compatibility entry to create extra members or tasks', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams', ORDINARY_PROFILE)
  const created = await execute(captain, 'agent_teams_create', { description: '成员权限夹具' })
  assert.equal(created.isError, false, text(created))
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
    const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { ...ORDINARY_PROFILE, temporaryAuthorization: true })
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
  const { ctx, stateRoot, adapter, captain, execute, diagnose } = await fixture(t, 'teams', { temporaryAuthorization: true })
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
  }, 'concurrent tasks were lost or not assigned', 5_000, diagnose)
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
  const { stateRoot, captain, execute } = await fixture(t, 'teams', { temporaryAuthorization: true })
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
  const { stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { profiles, defaultProfile: 'frozen-profile', temporaryAuthorization: true })
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
  assert.equal(compatibilityMember.model, 'offline-model', 'temporary role prose cannot borrow the frozen Profile route')
  assert.notEqual(compatibilityMember.id, before.members[0].id)
  await eventually(() => adapter.requests.length === 1, 'only the new compatibility member should execute a greeting')
  assert.equal(adapter.requests[0].model, 'offline-model')
  adapter.release(0)
  const assigned = await assignedTask(stateRoot, after.id, compatibilityMember.name)
  assert.ok(assigned.attemptId)
  await eventually(() => adapter.requests.length === 2, 'the role-inheriting compatibility member never executed its real assigned task')
  assert.equal(adapter.requests[1].model, 'offline-model')
  assert.deepEqual((await readTeam(stateRoot, before.id)).members.find(item => item.name === 'reviewer'), before.members.find(item => item.name === 'reviewer'))
})

test('Native compatibility respects the configured Team member cap without adding a task or another child', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, captain, execute } = await fixture(t, 'teams', { temporaryAuthorization: true, maxMembers: 1 })
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
  const { stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { temporaryAuthorization: true, modelSelection: true })
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
  const { stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { temporaryAuthorization: true })
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
  const { ctx, stateRoot, adapter, captain, execute, diagnose } = await fixture(t, 'teams', { temporaryAuthorization: true })
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
  const task = await assignedTask(stateRoot, team.id, member.name, diagnose)
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
  const { ctx, stateRoot, adapter, captain, execute, teamFiber } = await fixture(t, 'teams', { temporaryAuthorization: true })
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

const TEMPORARY_MEMBER_POLICY = {
  provider: 'temporary-offline', model: 'alternate-model', reasoningMode: 'explicit', reasoningEffort: 'high',
}

function assertTemporaryRequest(request, childId) {
  assert.equal(request.sessionId, childId, 'the selected request must belong to the actual delegated child')
  assert.equal(request.provider, TEMPORARY_MEMBER_POLICY.provider)
  assert.equal(request.model, TEMPORARY_MEMBER_POLICY.model)
  assert.equal(request.reasoningEffort, TEMPORARY_MEMBER_POLICY.reasoningEffort)
}

test('Team trusted temporary default selects the configured provider, model and effort without enabling native model selection', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams', {
    temporaryAuthorization: true, temporaryMember: TEMPORARY_MEMBER_POLICY, defaultProfile: 'populated', maxMembers: 4,
    profiles: { populated: { taskPlanning: 'seed', members: ['analyst', 'implementer', 'tester', 'reviewer'].map(name => ({ name, reasoning_mode: 'target-default' })), tasks: [{ id: 'seed', subject: 'must not start', assignee: 'analyst' }] } },
  })
  const schema = ctx.tools.schemas(captain).find(item => item.name === 'subagent')
  assert.equal(schema.parameters.properties.provider, undefined, 'the official tool schema remains closed to model-supplied overrides')
  const result = await execute(captain, 'subagent', { description: '按临时默认模型处理', prompt: DELEGATED_PROMPT })
  assert.equal(result.isError, false, text(result))
  const team = await findTeamByCaptain(stateRoot, captain.id)
  const member = team.members.find(item => item.id === result.value.subagentId)
  assert.ok(member)
  assert.equal(team.members.length, 1, 'temporary delegation must not instantiate the four Profile roles')
  assert.equal(team.tasks.length, 1)
  assert.equal(team.tasks[0].description, DELEGATED_PROMPT)
  assert.equal(team.members[0].modelPolicySource, 'temporary')
  assert.equal(member.provider, TEMPORARY_MEMBER_POLICY.provider)
  assert.equal(member.model, TEMPORARY_MEMBER_POLICY.model)
  assert.equal(member.reasoningMode, 'explicit')
  assert.equal(member.reasoningEffort, 'high')
  await eventually(() => adapter.requests.length === 1, 'temporary child greeting never reached the actual LLM adapter')
  assertTemporaryRequest(adapter.requests[0], member.id)
  adapter.release(0)
  const task = await assignedTask(stateRoot, team.id, member.name)
  await eventually(() => adapter.requests.length === 2, 'temporary child assigned task never reached the actual LLM adapter')
  assertTemporaryRequest(adapter.requests[1], member.id)
  const child = ctx.agents.get(SessionId(member.id))
  await completeTaskThroughMemberTools(execute, child, task)
  adapter.release(1)
})

test('Team temporary default supports two same-role concurrent calls, later delegation and idle member reuse', { timeout: 20_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { temporaryAuthorization: true, temporaryMember: TEMPORARY_MEMBER_POLICY })
  const role = '相同临时职责'
  const concurrent = await Promise.all([1, 2].map(index => execute(captain, 'subagent', {
    description: role, prompt: `${DELEGATED_PROMPT} 并发 ${index}`,
  })))
  for (const result of concurrent) assert.equal(result.isError, false, text(result))
  const childIds = concurrent.map(result => result.value.subagentId)
  assert.equal(new Set(childIds).size, 2, 'concurrent calls cannot accidentally share a busy member')
  await eventually(() => adapter.requests.length === 2, 'both independently routed child greetings must execute')
  for (const request of adapter.requests) {
    assert.ok(childIds.includes(request.sessionId))
    assertTemporaryRequest(request, request.sessionId)
  }
  adapter.release(0)
  adapter.release(1)
  const team = await eventually(async () => {
    const current = await findTeamByCaptain(stateRoot, captain.id)
    return current?.tasks.length === 2 && current.tasks.every(task => task.attemptId) ? current : undefined
  }, 'both same-role tasks must receive separate scheduler attempts')
  await eventually(() => adapter.requests.length === 4, 'both independently routed child tasks must execute')
  assert.equal(team.members.length, 2)
  for (const request of adapter.requests.slice(2)) assertTemporaryRequest(request, request.sessionId)
  for (const task of team.tasks) {
    const member = team.members.find(item => item.name === task.assignee)
    await completeTaskThroughMemberTools(execute, ctx.agents.get(SessionId(member.id)), task)
  }
  adapter.release(2)
  adapter.release(3)
  await eventually(() => childIds.every(id => ctx.agents.get(SessionId(id))?.status !== 'running'), 'completed children never settled to idle')
  authorizeTemporary(captain)
  const third = await execute(captain, 'subagent', { description: '另一个临时职责', prompt: `${DELEGATED_PROMPT} 后续第三次` })
  assert.equal(third.isError, false, text(third))
  assert.equal(childIds.includes(third.value.subagentId), false)
  await eventually(() => adapter.requests.length === 5, 'later temporary delegation never executed')
  assertTemporaryRequest(adapter.requests[4], third.value.subagentId)

  const reused = await execute(captain, 'subagent', { description: role, prompt: `${DELEGATED_PROMPT} 同职责再次调用` })
  assert.equal(reused.isError, false, text(reused))
  assert.ok(childIds.includes(reused.value.subagentId), 'an idle compatible member should remain reusable across repeated calls')
  const after = await findTeamByCaptain(stateRoot, captain.id)
  assert.equal(after.id, team.id)
  assert.equal(after.members.length, 3)
  assert.equal(after.tasks.length, 4)
  await eventually(() => adapter.requests.length === 6, 'reused temporary member never executed the new assigned task')
  assertTemporaryRequest(adapter.requests[5], reused.value.subagentId)
})

test('Unavailable temporary default fails before Team state or child creation instead of falling back to the captain route', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams', {
    temporaryAuthorization: true,
    temporaryMember: { ...TEMPORARY_MEMBER_POLICY, provider: 'unavailable-offline' },
  })
  const childrenBefore = await ctx.subagents.listChildren(captain.id)
  const result = await execute(captain, 'subagent', { description: '不可用临时模型', prompt: DELEGATED_PROMPT })
  assert.equal(result.isError, true, 'a missing configured provider cannot silently execute the captain model')
  assert.match(text(result), /unavailable-offline|provider|unavailable/i)
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
  assert.deepEqual(await ctx.subagents.listChildren(captain.id), childrenBefore)
  assert.equal(adapter.requests.length, 0)
})

test('Native delegation ignores the Team temporary default and retains the official parent route', { timeout: 15_000 }, async t => {
  const { stateRoot, adapter, captain, execute } = await fixture(t, 'native', { temporaryMember: TEMPORARY_MEMBER_POLICY })
  const result = await execute(captain, 'subagent', { description: '原生模型边界', prompt: DELEGATED_PROMPT })
  assert.equal(result.isError, false, text(result))
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
  await eventually(() => adapter.requests.length === 1, 'official Native child never executed')
  assert.equal(adapter.requests[0].sessionId, result.value.subagentId)
  assert.equal(adapter.requests[0].provider, 'offline')
  assert.equal(adapter.requests[0].model, 'offline-model')
  assert.equal(adapter.requests[0].reasoningEffort, undefined)
})

test('Team custom members use temporary defaults while frozen Profile routes stay independent', { timeout: 15_000 }, async t => {
  const profiles = {
    'explicit-profile': {
      taskPlanning: 'captain', tasks: [], members: [{
        name: 'reviewer', role: '固定代码审查', provider: 'offline', model: 'alternate-model',
        reasoning_mode: 'explicit', reasoning_effort: 'low', executionPrompt: '保留审查职责与角色模型。',
      }],
    },
  }
  const { ctx, stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { profiles, defaultProfile: 'explicit-profile', temporaryAuthorization: true, temporaryMember: TEMPORARY_MEMBER_POLICY })
  const created = await execute(captain, 'agent_teams_create', { description: '角色与临时模型独立', profile: 'explicit-profile' })
  assert.equal(created.isError, false, text(created))
  const before = await readTeam(stateRoot, created.value.team_id)
  const queued = await execute(captain, 'agent_teams_create_task', { subject: '固定角色审查', description: DELEGATED_PROMPT, assignee: 'reviewer' })
  assert.equal(queued.isError, false, text(queued))
  await eventually(() => adapter.requests.length === 1, 'the configured Profile reviewer never executed')
  assert.equal(adapter.requests[0].provider, 'offline')
  assert.equal(adapter.requests[0].model, 'alternate-model')
  assert.equal(adapter.requests[0].reasoningEffort, 'low')
  const ordinary = await execute(captain, 'agent_teams_add_member', { name: 'ordinary', role: '普通新增成员' })
  assert.equal(ordinary.isError, false, text(ordinary))
  await eventually(() => adapter.requests.length === 2, 'ordinary add-member never executed')
  const ordinaryRequest = adapter.requests.find(request => request.sessionId === ordinary.value.member_id)
  assertTemporaryRequest(ordinaryRequest, ordinary.value.member_id)
  assert.equal((await readTeam(stateRoot, before.id)).members.find(item => item.name === 'ordinary').modelPolicySource, 'temporary')
  const delegated = await execute(captain, 'subagent', { description: '临时专项工作', prompt: DELEGATED_PROMPT })
  assert.equal(delegated.isError, false, text(delegated))
  await eventually(() => adapter.requests.length === 3, 'temporary delegation alongside Profile members never executed')
  assertTemporaryRequest(adapter.requests.find(request => request.sessionId === delegated.value.subagentId), delegated.value.subagentId)
  const after = await readTeam(stateRoot, before.id)
  for (const key of ['provider', 'model', 'reasoningMode', 'reasoningEffort', 'executionPrompt']) {
    assert.equal(after.members.find(item => item.name === 'reviewer')[key], before.members.find(item => item.name === 'reviewer')[key], `temporary default rewrote Profile reviewer ${key}`)
  }
  assert.ok(ctx.agents.get(SessionId(delegated.value.subagentId)))
})

test('Advertised native call overrides win over the temporary default but remain subject to the official allowed-model list', { timeout: 15_000 }, async t => {
  const { stateRoot, adapter, captain, execute } = await fixture(t, 'teams', { temporaryAuthorization: true, modelSelection: true, temporaryMember: TEMPORARY_MEMBER_POLICY })
  const blocked = await execute(captain, 'subagent', {
    description: '未授权显式模型', prompt: DELEGATED_PROMPT, provider: 'offline', model: 'blocked-model',
  })
  assert.equal(blocked.isError, true)
  assert.equal(await findTeamByCaptain(stateRoot, captain.id), undefined)
  const allowed = await execute(captain, 'subagent', {
    description: '授权显式模型', prompt: DELEGATED_PROMPT, provider: 'offline', model: 'alternate-model', reasoning_effort: 'low',
  })
  assert.equal(allowed.isError, false, text(allowed))
  await eventually(() => adapter.requests.length === 1, 'explicit allowed route never executed')
  assert.equal(adapter.requests[0].sessionId, allowed.value.subagentId)
  assert.equal(adapter.requests[0].provider, 'offline')
  assert.equal(adapter.requests[0].model, 'alternate-model')
  assert.equal(adapter.requests[0].reasoningEffort, 'low')
})
