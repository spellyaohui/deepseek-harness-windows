/** Real registered tools, AgentLoop, continuations, JSONL sessions and Team state;
 * only the external model adapter is replaced, so this regression stays offline. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, readdir, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import { createVolatile, updateVolatile } from '@deepseek-ai/cosmokit'
import { LlmAdapter, ToolCallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import { SessionId } from '@deepseek-ai/dsh-session'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import * as SubagentSpawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import * as ToolSubagent from '@deepseek-ai/dsh-tool-subagent'
import * as AgentTeams from '../lib/index.js'
import { readTeam, readMailbox, appendMailbox, createMessage, CAPTAIN_KEY } from '../lib/state.js'
import { mailboxPrompt, readCurrentMailbox } from '../lib/mailbox.js'
import { steerCaptainReport } from '../lib/members.js'
import { MEMBER_TOOL_NAMES } from '../lib/tool-names.js'
import { assembleTeamSnapshot } from '../lib/snapshot.js'
import SessionController from '@deepseek-ai/dsh-api-session-controller'
import { agentPresetProjectionDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { haltTeamWork } from '../lib/tools.js'

const CAPTAIN = { provider: 'offline', model: 'captain-model', reasoningMode: 'target-default' }
const TEMPORARY = { provider: 'cli2api', model: 'qwen3.8-flash', reasoningMode: 'explicit', reasoningEffort: 'xhigh' }
const INLINE_PLAN_CAPTAIN = { provider: 'captain-gateway', model: 'captain-large', reasoningMode: 'explicit', reasoningEffort: 'max' }
const INLINE_PLAN_TEMPORARY = { provider: 'alt-gateway', model: 'worker-small', reasoningMode: 'explicit', reasoningEffort: 'high' }
const CUSTOM_NAMES = ['code-reviewer', 'stability-auditor', 'feature-auditor', 'ui-reviewer', 'verifier']
const text = result => result.content.filter(block => block.type === 'text').map(block => block.text).join('')
const systemText = request => request.messages.filter(message => message.role === 'system').flatMap(message => message.content).filter(block => block.type === 'text').map(block => block.text).join('')

async function eventually(read, message) {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const value = await read()
    if (value) return value
    await delay(10)
  }
  assert.fail(message)
}

class OfflineAdapter extends LlmAdapter {
  requests = []
  gates = []
  released = new Set()
  releasingAll = false
  captainTool
  captainToolSession = 'routing-captain'
  release(index) { this.released.add(index); this.gates[index]?.resolve() }
  releaseAll() { this.releasingAll = true; this.gates.forEach(gate => gate.resolve()) }
  async listModels(provider) {
    return ['captain-model', 'qwen3.8-flash', 'role-model', 'explicit-model', 'captain-large', 'worker-small'].map(id => ({ provider, id, name: id }))
  }
  async resolveModel(provider, model) {
    if (!(await this.listModels(provider)).some(entry => entry.id === model)) throw new Error(`unknown offline model ${model}`)
    return { provider, id: model, name: model, reasoning: { efforts: ['low', 'high', 'xhigh', 'max'].map(id => ({ id, name: id })) } }
  }
  async *stream(options) {
    assert.ok(options.sessionId, 'the real AgentLoop must stamp request ownership')
    const index = this.requests.length
    this.requests.push(options)
    if (options.sessionId === this.captainToolSession && this.captainTool !== undefined) {
      const block = { type: 'tool-call', id: ToolCallId('routing-approval'), name: 'agent_teams_approve', arguments: JSON.stringify(this.captainTool) }
      this.captainTool = undefined
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: block.id, name: block.name, argumentsDelta: block.arguments }
      yield { type: 'block-end', index: 0, block }
      yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 8 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const gate = Promise.withResolvers()
    this.gates[index] = gate
    if (this.releasingAll || this.released.has(index)) gate.resolve()
    if (options.signal?.aborted) throw new Error('offline child aborted')
    await Promise.race([gate.promise, new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('offline child aborted')), { once: true })
    })])
    if (options.signal?.aborted) throw new Error('offline child aborted')
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'offline result' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'offline result' } }
    yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 8 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function fixture(t, { temporaryMember, profiles = { fixture: { taskPlanning: 'captain', members: [{ name: 'fixture-role', reasoning_mode: 'target-default' }] } }, temporaryAuthorization = false, captainPolicy = CAPTAIN, toolPolicies = {}, captainPreset, executionPrompt } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-custom-member-routing-'))
  const ctx = new Context()
  const adapter = new OfflineAdapter()
  t.after(async () => {
    adapter.releaseAll()
    await ctx.fiber.dispose()
    // Only remove the newly minted temporary fixture, never a user workspace.
    await rm(workspace, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })
  })
  await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
  await ctx.plugin(JsonlSessionPersistence, { root: join(workspace, 'sessions') })
  await ctx.plugin(SessionQuery)
  ctx.sessionProjections.register(agentPresetProjectionDefinition)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime, { maxActiveSubagents: 16 })
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  const teamFiber = ctx.plugin(AgentTeams, {
    delegationMode: 'teams', stateDir: '.agent-teams', memberProvider: 'spawn',
    memberMaxDepth: 0, maxMembers: 16, profiles, toolPolicies, slashCommand: false,
    defaultProfile: Object.keys(profiles)[0],
    ...(executionPrompt === undefined ? {} : { executionPrompt }),
    ...(temporaryMember === undefined ? {} : { temporaryMember }),
  })
  await teamFiber
  ctx.llm.registerAdapter(['offline', 'cli2api', 'alt-gateway', 'captain-gateway'], adapter)
  const handle = await ctx.agents.create({
    sessionId: SessionId('routing-captain'), meta: { cwd: workspace, ...(captainPreset === undefined ? {} : { agentPreset: captainPreset }) },
    agentOptions: { provider: captainPolicy.provider, model: captainPolicy.model, reasoningEffort: captainPolicy.reasoningEffort },
    setup: async (agentCtx, agent) => {
      const fiber = agentCtx.inject(ToolSubagent.inject, runtimeCtx => ToolSubagent.apply(runtimeCtx, {
        provider: 'spawn', backgroundMode: 'continuable', modelSelectionSettings: false,
      }, agent.session))
      await fiber.await()
    },
  })
  let callSeq = 0
  const authorizeTemporary = () => {
    handle.agent.session.append('turn/start', { turn: 1 })
    handle.agent.session.append('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: '/agent-teams --temporary offline custom member regression' }] }, { surfaceOp: 'append' })
  }
  if (temporaryAuthorization) authorizeTemporary()
  const execute = (name, args, agent = handle.agent) => ctx.tools.execute({
    signal: new AbortController().signal, callId: ToolCallId(`routing-${++callSeq}`),
    name, arguments: args, agent,
  })
  const call = async (name, args) => {
    if (name === 'agent_teams_create' && args.plan !== undefined) {
      // Inline model plans are rejected; the same test-owned roster is then saved as a trusted Profile.
      const denied = await execute(name, args)
      assert.equal(denied.isError, true)
      assert.deepEqual(await ctx.subagents.listChildren(handle.agent.id), [])
      const plan = args.plan
      const profile = { ...plan, taskPlanning: plan.tasks.length ? 'seed' : 'captain', members: plan.members.map(member => ({ ...member, reasoning_mode: member.reasoning_mode ?? 'target-default', ...(member.provider?.trim() ? {} : { provider: undefined }), ...(member.model?.trim() ? {} : { model: undefined }) })) }
      updateVolatile(teamFiber.config.profiles, createVolatile({ fixture: profile }))
      updateVolatile(teamFiber.config.defaultProfile, createVolatile('fixture'))
      const { plan: _plan, ...rest } = args
      args = rest
    }
    const result = await execute(name, args)
    assert.equal(result.isError, false, text(result))
    return result.value
  }
  const stateRoot = join(workspace, '.agent-teams')
  return { ctx, workspace, handle, stateRoot, adapter, captain: handle.agent, teamFiber, execute, call, authorizeTemporary }
}

// Only browser/attachment/workspace chrome is replaced. The controller's real
// create/adopt, projected preset validation, AgentLoop resume and JSONL are used.
function mountController(ctx, workspace) {
  const record = { id: 'fixture-workspace', path: workspace, sessionIds: [], attachSession: async () => {} }
  ctx.provide('workspaceRegistry', { create: async () => record, get: () => record, list: () => [record], archivedSessionIds: [] })
  ctx.provide('typert', { resources: { register: () => () => {} }, lookups: { configure: () => () => {} }, contexts: { configureHost: () => () => {} } })
  ctx.provide('agentDefaultModel', { currentSelection: () => CAPTAIN, saveSelection: async () => {} })
  ctx.provide('attachments', { imageLimits: { maxImageBytes: 5_000_000, maxImagesPerMessage: 20, maxMessageImageBytes: 100_000_000, maxImagePixels: 40_000_000, maxImageDimension: 2000, mediaTypes: ['image/png'] }, admitPromptContent: async content => content })
  ctx.provide('fileUploads', { registerAgentResolver: () => () => {}, resolve: () => undefined, bindPrompt: () => ({ commit() {}, [Symbol.dispose]() {} }), retirePrompt() {} })
  return new SessionController(ctx, { nativeOpen: false })
}

for (const captainPreset of [undefined, 'custom-review']) {
  test(`real SessionController restores cold captain with ${captainPreset ?? 'absent'} preset`, { timeout: 20_000 }, async t => {
    const { ctx, workspace, handle, captain, adapter, stateRoot, call, execute } = await fixture(t, { captainPreset })
    mountController(ctx, workspace)
    const created = await call('agent_teams_create', { description: 'cold anchor preset' })
    captain.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'materialize original' }] }))
    const request = await eventually(() => adapter.requests.find(item => item.sessionId === captain.id), 'original did not materialize')
    adapter.release(adapter.requests.indexOf(request))
    await captain.whenIdle()
    await handle.dispose()
    assert.equal(ctx.agents.get(captain.id), undefined)
    const fork = await ctx.agents.create({ sessionId: SessionId('cold-anchor-fork'), meta: { cwd: workspace, parentSession: captain.id }, agentOptions: CAPTAIN })
    const result = await execute('agent_teams_add_member', { role_template: 'fixture-role', name: 'restored-child' }, fork.agent)
    assert.equal(result.isError, false, text(result))
    const anchor = ctx.agents.get(captain.id)
    assert.ok(anchor, 'actual controller must publish the resumed original')
    assert.notEqual(anchor, captain)
    assert.equal(anchor.session.header.agentPreset, captainPreset)
    assert.equal((await readTeam(stateRoot, created.team_id)).captainSessionId, captain.id)
    await assertRequest(adapter, result.value.member_id, CAPTAIN)
    const child = await ctx.sessionPersistence.open(SessionId(result.value.member_id), 'read')
    try { assert.equal(child.header.parentSession, captain.id) } finally { await child.close() }
  })
}

test('warm fork Stop closes the actual anchor before and after child drain', { timeout: 20_000 }, async t => {
  const { ctx, workspace, captain, adapter, stateRoot, call } = await fixture(t)
  const created = await call('agent_teams_create', { description: 'fork stop' })
  const added = await call('agent_teams_add_member', { role_template: 'fixture-role', name: 'running-child' })
  await assertRequest(adapter, added.member_id, CAPTAIN)
  captain.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'run anchor' }] }))
  await eventually(() => adapter.requests.some(item => item.sessionId === captain.id), 'anchor must be running')
  const fork = await ctx.agents.create({ sessionId: SessionId('stop-fork'), meta: { cwd: workspace, parentSession: captain.id }, agentOptions: CAPTAIN })
  const pendingMail = createMessage('running-child', CAPTAIN_KEY, 'Pending report must survive Stop')
  await appendMailbox(stateRoot, created.team_id, CAPTAIN_KEY, pendingMail)
  await haltTeamWork({ ctx, stateRoot, teamId: created.team_id, captain: fork.agent })
  await eventually(() => captain.status !== 'running', 'original anchor survived fork Stop')
  assert.equal((await readTeam(stateRoot, created.team_id)).halted, true)
  assert.equal(ctx.agents.get(SessionId(added.member_id)), undefined)
  const count = adapter.requests.length
  await delay(80)
  assert.equal(captain.status, 'idle')
  assert.equal(adapter.requests.length, count, 'settled notification must not restart halted work')
  assert.deepEqual((await readMailbox(stateRoot, created.team_id, CAPTAIN_KEY)).find(item => item.id === pendingMail.id), pendingMail)
  captain.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'unrelated user work after Stop' }] }))
  await eventually(() => adapter.requests.length > count, 'Stop must not disable unrelated subsequent user work')
})

test('fork approval second-spawn failure rolls back through original parent and drains all children', { timeout: 20_000 }, async t => {
  const { ctx, workspace, captain, adapter, stateRoot, call } = await fixture(t)
  const created = await call('agent_teams_create', { approval: 'required', plan: {
    members: [{ name: 'first' }, { name: 'second' }],
    tasks: [{ id: 'one', subject: 'first work', assignee: 'first' }, { id: 'two', subject: 'second work', assignee: 'second' }],
  } })
  const submitted = await call('agent_teams_edit_plan', { operations: [], submit_for_review: true })
  const before = await readTeam(stateRoot, created.team_id)
  const fork = await ctx.agents.create({ sessionId: SessionId('approval-fork'), meta: { cwd: workspace, parentSession: captain.id }, agentOptions: CAPTAIN })
  const start = ctx.subagents.startActivation.bind(ctx.subagents)
  const interrupt = ctx.subagents.interrupt.bind(ctx.subagents)
  const parents = []
  const startedIds = []
  const interruptedParents = []
  ctx.subagents.startActivation = async spec => {
    parents.push(spec.request.parent.id)
    if (parents.length === 2) throw new Error('fixture second spawn failure')
    const started = await start(spec)
    startedIds.push(started.childId)
    return started
  }
  ctx.subagents.interrupt = (id, reason) => { interruptedParents.push(reason.agent.id); return interrupt(id, reason) }
  adapter.captainToolSession = fork.agent.id
  adapter.captainTool = { confirmation: 'I approve the AgentTeams plan', expected_plan_revision: submitted.plan_revision }
  fork.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'I approve the AgentTeams plan' }] }))
  await eventually(() => adapter.requests.filter(item => item.sessionId === fork.agent.id).length >= 2, 'approval tool did not settle its failure')
  assert.deepEqual(parents, [captain.id, captain.id])
  assert.ok(interruptedParents.length > 0)
  assert.ok(interruptedParents.every(id => id === captain.id), `rollback used wrong parents: ${interruptedParents}`)
  assert.deepEqual(await readTeam(stateRoot, created.team_id), before, 'partial roster must not commit')
  assert.equal((await ctx.subagents.listChildren(captain.id)).filter(child => child.status === 'running').length, 0)
  assert.equal(startedIds.length, 1, 'first spawn must actually succeed before the second fails')
  for (const id of startedIds) {
    assert.equal(ctx.agents.get(SessionId(id)) === undefined, true, 'rollback must drain the active first child before returning')
  }
})

for (const cold of [false, true]) {
  test(`quality follow-up persists and reaches real ${cold ? 'cold recovery' : 'live pre-step'} inbox admission`, { timeout: 20_000 }, async t => {
    const { ctx, workspace, handle, captain, adapter, stateRoot, call, execute } = await fixture(t)
    await mkdir(join(workspace, 'src'))
    await writeFile(join(workspace, 'src/parser.ts'), 'export const parse = () => null\n')
    const created = await call('agent_teams_create', { description: 'quality inbox' })
    const added = await call('agent_teams_add_member', { role_template: 'fixture-role', name: 'critic', role: 'reviewer' })
    const critic = await eventually(() => ctx.agents.get(SessionId(added.member_id)), 'critic not live')
    const impl = await call('agent_teams_create_task', { subject: 'parser', assignee: 'captain', kind: 'implementation', objective: 'parser', inScope: ['src/parser.ts'], acceptance: ['parses'], verify: ['node check'] })
    const claim = await call('agent_teams_claim_task', { task_id: impl.task_id })
    await call('agent_teams_update_task', { task_id: impl.task_id, status: 'in_progress', attempt_id: claim.attempt_id })
    await call('agent_teams_update_task', { task_id: impl.task_id, status: 'completed', attempt_id: claim.attempt_id, changedPaths: ['src/parser.ts'], acceptanceResults: [{ criterion: 'parses', status: 'passed' }], commandsRun: [{ command: 'node check', status: 'passed' }] })
    const review = await call('agent_teams_create_task', { subject: 'review parser', assignee: 'critic', kind: 'review', objective: 'review parser', acceptance: ['no high findings'], reviewedTaskId: impl.task_id })
    const memberCall = async (name, args) => { const result = await execute(name, args, critic); assert.equal(result.isError, false, text(result)); return result.value }
    const reviewClaim = await memberCall('agent_teams_claim_task', { task_id: review.task_id })
    await memberCall('agent_teams_update_task', { task_id: review.task_id, status: 'in_progress', attempt_id: reviewClaim.attempt_id })
    if (cold) {
      captain.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'materialize captain' }] }))
      const request = await eventually(() => adapter.requests.find(item => item.sessionId === captain.id), 'captain not materialized')
      adapter.release(adapter.requests.indexOf(request))
      await captain.whenIdle()
      await handle.dispose()
    }
    await memberCall('agent_teams_update_task', { task_id: review.task_id, status: 'failed', attempt_id: reviewClaim.attempt_id, verdict: 'needs_revision', findings: [{ id: 'Q1', severity: 'high', file: 'src/parser.ts', problem: 'null result', requiredFix: 'return parsed value' }] })
    const mail = (await readMailbox(stateRoot, created.team_id, CAPTAIN_KEY)).find(item => item.content.startsWith('Automatic quality follow-up'))
    assert.ok(mail, 'notification must exist durably before its receipt is delivered')
    if (cold) {
      assert.equal(mail.readAt, undefined)
      assert.ok((await readCurrentMailbox(stateRoot, created.team_id, CAPTAIN_KEY)).some(item => item.id === mail.id))
      mountController(ctx, workspace)
      const resumed = await ctx.sessionController.resolveAgent(captain.id)
      assert.ok('agent' in resumed)
      assert.equal(steerCaptainReport(ctx.agents.get(captain.id), CAPTAIN_KEY, mail.content, mailboxPrompt(created.team_id, CAPTAIN_KEY, [mail])), true)
    }
    await eventually(() => adapter.requests.find(item => item.sessionId === captain.id && JSON.stringify(item).includes('Automatic quality follow-up')), 'real pre-step discarded the follow-up receipt')
    assert.ok((await readMailbox(stateRoot, created.team_id, CAPTAIN_KEY)).find(item => item.id === mail.id).readAt, 'only successful real admission must acknowledge the persisted receipt')
  })
}

test('owner policy survives direct spawn and cold continuation without global tool leakage', { timeout: 20_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, call } = await fixture(t, { toolPolicies: { restricted: { allow: ['agent_teams_status'] } } })
  const created = await call('agent_teams_create', { description: 'policy snapshot' })
  const added = await call('agent_teams_add_member', { role_template: 'fixture-role', name: 'auditor', tool_policy: 'restricted' })
  const team = await readTeam(stateRoot, created.team_id)
  const member = team.members.find(member => member.id === added.member_id)
  assert.equal(member.toolPolicy, 'restricted')
  assert.deepEqual(new Set(member.toolFilter.allow), new Set(MEMBER_TOOL_NAMES))
  const checkTools = request => {
    const names = request.tools.map(tool => tool.name)
    for (const name of MEMBER_TOOL_NAMES) assert.ok(names.includes(name), `${name} must remain exposed`)
    assert.ok(!names.includes('agent_teams_create'), 'captain-only tools must stay denied')
    assert.equal(names.length, MEMBER_TOOL_NAMES.length, JSON.stringify(names))
  }
  const request = await eventually(() => adapter.requests.find(item => item.sessionId === added.member_id), 'policy child did not start')
  checkTools(request)
  assert.ok(ctx.tools.get('agent_teams_create', captain.session), 'child filter must not leak into captain registry')
  const snapshot = await assembleTeamSnapshot(ctx, stateRoot, 'fixture', team)
  assert.equal(snapshot.members.find(item => item.id === member.id).toolPolicy, 'restricted')
  assert.deepEqual(snapshot.members.find(item => item.id === member.id).toolFilter, member.toolFilter)
  adapter.release(adapter.requests.indexOf(request))
  await eventually(() => !ctx.agents.get(SessionId(member.id)), 'child did not unload')
  await call('agent_teams_send_message', { to: member.name, content: 'resume policy' })
  checkTools(await eventually(() => adapter.requests.filter(item => item.sessionId === member.id)[1], 'child did not cold resume'))
})

for (const legacyFallback of [false, true]) {
  test(`managed cold recovery preserves ${legacyFallback ? 'existing V2' : 'new frozen'} global guidance and accepts reordered tool sets`, { timeout: 20_000 }, async t => {
    const guidance = '  Original global execution guidance.  '
    const { ctx, stateRoot, adapter, teamFiber, call, authorizeTemporary } = await fixture(t, {
      executionPrompt: guidance,
      temporaryAuthorization: true,
      toolPolicies: { restricted: { allow: ['agent_teams_status'] } },
    })
    const created = await call('agent_teams_create', { description: 'freeze effective guidance' })
    const added = await call('agent_teams_add_member', { name: 'auditor', tool_policy: 'restricted' })
    const first = await eventually(() => adapter.requests.find(row => row.sessionId === added.member_id), 'child did not start')
    assert.match(systemText(first), /Original global execution guidance/)
    adapter.release(adapter.requests.indexOf(first))
    await eventually(() => !ctx.agents.get(SessionId(added.member_id)), 'child did not unload')
    const team = await readTeam(stateRoot, created.team_id)
    const member = team.members.find(row => row.id === added.member_id)
    assert.equal(member.executionPrompt, guidance, 'freeze the effective global fallback without trimming stored text')
    if (legacyFallback) delete member.executionPrompt // Shape produced by the earlier managed adapter.
    for (const key of ['allow', 'deny']) {
      const names = member.runtimeSetup.toolFilter[key]
      member.runtimeSetup.toolFilter[key] = [...names].reverse().concat(names[0])
    }
    await writeFile(join(stateRoot, team.id, 'team.json'), JSON.stringify(team))
    teamFiber.config.executionPrompt = 'Later global guidance must not replace the frozen role.'
    authorizeTemporary()
    await call('agent_teams_send_message', { to: member.name, content: 'resume frozen guidance' })
    const resumed = await eventually(() => adapter.requests.filter(row => row.sessionId === member.id)[1], 'child did not cold resume')
    assert.match(systemText(resumed), /Original global execution guidance/)
    assert.doesNotMatch(systemText(resumed), /Later global guidance/)
    assert.deepEqual(resumed.tools.map(tool => tool.name).sort(), [...MEMBER_TOOL_NAMES].sort())
    const restored = (await readTeam(stateRoot, team.id)).members.find(row => row.id === member.id)
    assert.equal(restored.executionPrompt, legacyFallback ? undefined : guidance, 'recovery must not migrate the saved record')
  })
}

for (const drift of ['frozen-filter', 'captain-deny', 'persona']) {
  test(`managed cold recovery rejects runtime setup ${drift} drift before a model request`, { timeout: 20_000 }, async t => {
    const { ctx, stateRoot, adapter, call, execute } = await fixture(t, {
      toolPolicies: { restricted: { allow: ['agent_teams_status'] } },
    })
    const created = await call('agent_teams_create', { description: 'runtime setup consistency' })
    const added = await call('agent_teams_add_member', {
      role_template: 'fixture-role', name: 'auditor',
      ...(drift === 'frozen-filter' ? { tool_policy: 'restricted' } : {}),
    })
    const first = await eventually(() => adapter.requests.find(row => row.sessionId === added.member_id), 'child did not start')
    adapter.release(adapter.requests.indexOf(first))
    await eventually(() => !ctx.agents.get(SessionId(added.member_id)), 'child did not unload')
    const team = await readTeam(stateRoot, created.team_id)
    const member = team.members.find(row => row.id === added.member_id)
    assert.ok(member.runtimeSetup)
    if (drift === 'frozen-filter') delete member.runtimeSetup.toolFilter.allow
    if (drift === 'captain-deny') member.runtimeSetup.toolFilter.deny = member.runtimeSetup.toolFilter.deny.filter(name => name !== 'agent_teams_create')
    if (drift === 'persona') member.runtimeSetup.persona = 'altered system instructions'
    await writeFile(join(stateRoot, team.id, 'team.json'), JSON.stringify(team))
    assert.ok(await readTeam(stateRoot, team.id), 'the altered snapshot remains structurally valid V2')
    const result = await execute('agent_teams_send_message', { to: member.name, content: 'resume altered setup' })
    assert.equal(adapter.requests.filter(row => row.sessionId === member.id).length, 1, 'altered setup must not reach the model')
    assert.equal(result.value?.delivered, 'mailbox', 'failed restoration must retain the message for explicit recovery')
    assert.equal(ctx.agents.get(SessionId(member.id)), undefined, 'failed restoration must not publish a live child')
  })
}

for (const staged of [false, true]) {
  for (const binding of ['numbered', 'role_template']) {
    test(`${binding} role clone inherits frozen tool restriction through ${staged ? 'approval' : 'direct spawn'} and cold resume`, { timeout: 20_000 }, async t => {
      const profiles = { audit: { taskPlanning: 'seed', members: [{ name: 'reviewer', reasoning_mode: 'target-default', tool_policy: 'restricted' }], tasks: [{ id: 'audit', subject: 'Offline audit', assignee: 'reviewer' }] } }
      const { ctx, stateRoot, adapter, captain, teamFiber, execute, call } = await fixture(t, { profiles, toolPolicies: { restricted: { allow: ['read'] } } })
      let writes = 0
      for (const name of ['read', 'write', 'pwsh']) {
        ctx.tools.register(defineContentToolFixture({ name, description: 'Harmless offline permission fixture', parameters: {}, async execute() {
          if (name !== 'read') writes++
          return [{ type: 'text', text: 'offline fixture' }]
        } }))
      }
      const created = await call('agent_teams_create', { approval: staged ? 'required' : 'automatic' })
      const original = (await readTeam(stateRoot, created.team_id)).members[0]
      // A later settings change must not widen a current Team's frozen role.
      await teamFiber.dispose()
      await ctx.plugin(AgentTeams, {
        delegationMode: 'teams', stateDir: '.agent-teams', memberProvider: 'spawn',
        memberMaxDepth: 0, maxMembers: 16, profiles, defaultProfile: 'audit', slashCommand: false,
        toolPolicies: { restricted: { allow: ['write', 'pwsh'] } },
      })
      const name = binding === 'numbered' ? 'reviewer-2' : 'audit-copy'
      await call('agent_teams_add_member', { name, ...(binding === 'role_template' ? { role_template: 'reviewer' } : {}) })
      let member = (await readTeam(stateRoot, created.team_id)).members.find(item => item.name === name)
      assert.equal(member.toolPolicy, 'restricted')
      assert.deepEqual(member.toolFilter, original.toolFilter)
      if (staged) {
        await call('agent_teams_create_task', { subject: 'Offline cloned audit', assignee: name })
        const submitted = await call('agent_teams_edit_plan', { operations: [], submit_for_review: true })
        adapter.captainTool = { confirmation: 'I approve the AgentTeams plan', expected_plan_revision: submitted.plan_revision }
        captain.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'I approve the AgentTeams plan' }] }))
        member = await eventually(async () => (await readTeam(stateRoot, created.team_id)).members.find(item => item.name === name && item.id), 'approved role clone never started')
      }
      const checkTools = request => {
        assert.deepEqual(new Set(request.tools.map(tool => tool.name)), new Set(['read', ...MEMBER_TOOL_NAMES]))
      }
      const first = await eventually(() => adapter.requests.find(item => item.sessionId === member.id), 'role clone never reached real AgentLoop')
      checkTools(first)
      const child = ctx.agents.get(SessionId(member.id))
      assert.equal((await execute('read', {}, child)).isError, false)
      assert.equal((await execute('write', {}, child)).isError, true)
      assert.equal((await execute('pwsh', {}, child)).isError, true)
      assert.equal(writes, 0, 'restricted tool implementations must not execute')
      assert.ok(ctx.tools.schemas(captain).some(tool => tool.name === 'write'), 'member filter must not restrict captain')
      if (staged) {
        let task = (await readTeam(stateRoot, created.team_id)).tasks.find(item => item.assignee === name)
        if (!task.attemptId) {
          adapter.release(adapter.requests.indexOf(first))
          task = await eventually(async () => (await readTeam(stateRoot, created.team_id)).tasks.find(item => item.assignee === name && item.attemptId), 'approved clone task was not dispatched')
          checkTools(await eventually(() => adapter.requests.filter(item => item.sessionId === member.id)[1], 'approved clone task never executed'))
        }
        const executingChild = ctx.agents.get(SessionId(member.id))
        for (const [tool, args] of [
          ['agent_teams_claim_task', { task_id: task.id, attempt_id: task.attemptId }],
          ['agent_teams_update_task', { task_id: task.id, attempt_id: task.attemptId, status: 'in_progress' }],
          ['agent_teams_update_task', { task_id: task.id, attempt_id: task.attemptId, status: 'completed', output: 'Offline clone permission checks passed.' }],
        ]) {
          const result = await execute(tool, args, executingChild)
          assert.equal(result.isError, false, text(result))
        }
        assert.equal((await readTeam(stateRoot, created.team_id)).tasks.find(item => item.id === task.id).status, 'completed')
        const execution = adapter.requests.filter(item => item.sessionId === member.id).at(-1)
        adapter.release(adapter.requests.indexOf(execution))
      } else adapter.release(adapter.requests.indexOf(first))
      await eventually(() => !ctx.agents.get(SessionId(member.id)), 'role clone did not unload')
      const previousRequests = adapter.requests.filter(item => item.sessionId === member.id).length
      await call('agent_teams_send_message', { to: name, content: 'Offline cold continuation' })
      checkTools(await eventually(() => adapter.requests.filter(item => item.sessionId === member.id)[previousRequests], 'role clone did not cold resume'))
      assert.deepEqual((await readTeam(stateRoot, created.team_id)).members.find(item => item.name === name).toolFilter, original.toolFilter)
    })
  }
}

test('explicit clone tool policy overrides the inherited frozen restriction', { timeout: 20_000 }, async t => {
  const profiles = { audit: { taskPlanning: 'captain', members: [{ name: 'reviewer', reasoning_mode: 'target-default', tool_policy: 'restricted' }] } }
  const { stateRoot, adapter, call } = await fixture(t, { profiles, toolPolicies: { restricted: { allow: ['agent_teams_status'] }, alternate: { allow: ['agent_teams_claim_task'] } } })
  const created = await call('agent_teams_create', {})
  const added = await call('agent_teams_add_member', { name: 'reviewer-2', tool_policy: 'alternate' })
  assert.equal((await readTeam(stateRoot, created.team_id)).members.find(item => item.id === added.member_id).toolPolicy, 'alternate')
  const request = await eventually(() => adapter.requests.find(item => item.sessionId === added.member_id), 'explicit clone policy did not start')
  assert.deepEqual(new Set(request.tools.map(tool => tool.name)), new Set(MEMBER_TOOL_NAMES))
})

test('warm multihop captain fork spawns and sends through the original durable gateway parent', { timeout: 20_000 }, async t => {
  const { ctx, workspace, handle, stateRoot, adapter, captain, execute, call } = await fixture(t)
  const created = await call('agent_teams_create', { description: 'forked captain' })
  const fork = await ctx.agents.create({ sessionId: SessionId('routing-fork-one'), meta: { cwd: workspace, parentSession: captain.id }, agentOptions: CAPTAIN })
  const second = await ctx.agents.create({ sessionId: SessionId('routing-fork-two'), meta: { cwd: workspace, parentSession: fork.agent.id }, agentOptions: CAPTAIN })
  const added = await execute('agent_teams_add_member', { role_template: 'fixture-role', name: 'fork-member' }, second.agent)
  assert.equal(added.isError, false, text(added))
  const member = (await readTeam(stateRoot, created.team_id)).members.find(member => member.id === added.value.member_id)
  const session = await ctx.sessionPersistence.open(SessionId(member.id), 'read')
  try { assert.equal(session.header.parentSession, captain.id, 'fork must not rewrite direct child ownership') } finally { await session.close() }
  const first = await eventually(() => adapter.requests.find(item => item.sessionId === member.id), 'fork member did not start')
  adapter.release(adapter.requests.indexOf(first))
  await eventually(() => !ctx.agents.get(SessionId(member.id)), 'fork member did not unload')
  const sent = await execute('agent_teams_send_message', { to: member.name, content: 'continue from second fork' }, second.agent)
  assert.equal(sent.isError, false, text(sent))
  assert.equal(sent.value.delivered, 'wake')
  await eventually(() => adapter.requests.filter(item => item.sessionId === member.id).length === 2, 'fork delivery did not cold resume member')
  assert.equal((await readTeam(stateRoot, created.team_id)).captainSessionId, captain.id)
  // Empty new sessions are intentionally not materialized by Harness. Give
  // the intermediate fork a real turn before testing durable cold ancestry.
  fork.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'persist fork history' }] }))
  const forkRequest = await eventually(() => adapter.requests.find(item => item.sessionId === fork.agent.id), 'intermediate fork did not materialize')
  adapter.release(adapter.requests.indexOf(forkRequest))
  await fork.agent.whenIdle()
  await fork.dispose()
  const coldIntermediate = await execute('agent_teams_status', { detail: 'full' }, second.agent)
  assert.equal(coldIntermediate.isError, false, text(coldIntermediate))
  assert.equal(coldIntermediate.value.active, true, 'cold intermediate ancestry must resolve from persisted headers')
  const removed = await execute('agent_teams_remove_member', { name: member.name }, second.agent)
  assert.equal(removed.isError, false, text(removed))
  assert.equal((await readTeam(stateRoot, created.team_id)).members.find(item => item.id === member.id).status, 'removed')
  captain.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'persist captain history' }] }))
  const captainRequest = await eventually(() => adapter.requests.find(item => item.sessionId === captain.id), 'captain did not materialize')
  adapter.release(adapter.requests.indexOf(captainRequest))
  adapter.releaseAll()
  await captain.whenIdle()
  await handle.dispose()
  const coldOriginal = await execute('agent_teams_status', { detail: 'full' }, second.agent)
  assert.equal(coldOriginal.isError, false, text(coldOriginal))
  assert.equal(coldOriginal.value.active, true, 'cold original and intermediate must resolve read identity')
  const before = await readTeam(stateRoot, created.team_id)
  const blocked = await execute('agent_teams_add_member', { role_template: 'fixture-role', name: 'cold-parent-member' }, second.agent)
  assert.equal(blocked.isError, true)
  assert.match(text(blocked), /live captain session.*no session controller/)
  assert.deepEqual(await readTeam(stateRoot, created.team_id), before, 'missing anchor controller must fail before Team writes')
})

for (const source of ['inline', 'profile']) {
  test(`${source === 'inline' ? 'rejected inline roster saved as a trusted Profile' : 'Profile'} staged tool policy and route freeze survive prompt edit and approval`, { timeout: 20_000 }, async t => {
    const plan = { members: [{ name: 'auditor', tool_policy: 'restricted', reasoning_mode: 'target-default' }], tasks: [{ id: 'audit', subject: 'audit work', assignee: 'auditor' }] }
    const profiles = { audit: { ...plan, taskPlanning: 'seed' } }
    const { ctx, stateRoot, adapter, captain, teamFiber, call } = await fixture(t, { temporaryMember: INLINE_PLAN_TEMPORARY, profiles, toolPolicies: { restricted: { allow: ['agent_teams_status'] } } })
    const created = await call('agent_teams_create', { approval: 'required', ...(source === 'inline' ? { plan } : { profile: 'audit' }) })
    const original = (await readTeam(stateRoot, created.team_id)).members[0]
    assertPolicy(original, CAPTAIN)
    await call('agent_teams_edit_plan', { operations: [{ action: 'update_member', member_name: 'auditor', execution_prompt: 'Preserve owner policy.' }] })
    const edited = (await readTeam(stateRoot, created.team_id)).members[0]
    assert.equal(edited.toolPolicy, 'restricted')
    assert.deepEqual(edited.toolFilter, original.toolFilter)
    assert.deepEqual(await ctx.subagents.listChildren(captain.id), [])
    updateVolatile(teamFiber.config.temporaryMember, createVolatile(TEMPORARY))
    const submitted = await call('agent_teams_edit_plan', { operations: [], submit_for_review: true })
    adapter.captainTool = { confirmation: 'I approve the AgentTeams plan', expected_plan_revision: submitted.plan_revision }
    captain.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'I approve the AgentTeams plan' }] }))
    const running = await eventually(async () => { const team = await readTeam(stateRoot, created.team_id); return team.phase === 'running' ? team : undefined }, 'staged policy approval did not start')
    const member = running.members[0]
    assertPolicy(member, CAPTAIN)
    assert.deepEqual(member.toolFilter, original.toolFilter)
    await assertRequest(adapter, member.id, CAPTAIN)
    const request = adapter.requests.find(item => item.sessionId === member.id)
    assert.deepEqual(new Set(request.tools.map(tool => tool.name)), new Set(MEMBER_TOOL_NAMES))
  })
}

test('model inline plans cannot bypass a bound Profile with temporary, partial or unknown policies', { timeout: 20_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, teamFiber, execute } = await fixture(t, { temporaryMember: INLINE_PLAN_TEMPORARY })
  const cases = [
    { policy: { ...INLINE_PLAN_TEMPORARY, model: 'missing-model' }, member: {} },
    { policy: { ...INLINE_PLAN_TEMPORARY, provider: 'missing-provider' }, member: {} },
    { policy: { ...INLINE_PLAN_TEMPORARY, reasoningEffort: 'missing-effort' }, member: {} },
    { policy: INLINE_PLAN_TEMPORARY, member: { provider: 'alt-gateway' } },
    { policy: INLINE_PLAN_TEMPORARY, member: { model: 'worker-small' } },
    { policy: INLINE_PLAN_TEMPORARY, member: { reasoning_mode: 'explicit', reasoning_effort: 'high' } },
    { policy: INLINE_PLAN_TEMPORARY, member: { tool_policy: 'unknown' } },
  ]
  for (const { policy, member } of cases) {
    updateVolatile(teamFiber.config.temporaryMember, createVolatile(policy))
    const result = await execute('agent_teams_create', { plan: { members: [{ name: 'auditor', ...member }], tasks: [] } })
    assert.equal(result.isError, true, `must reject ${JSON.stringify(member)} with ${JSON.stringify(policy)}`)
    assert.deepEqual(await readdir(stateRoot).catch(error => { if (error.code === 'ENOENT') return []; throw error }), [])
    assert.deepEqual(await ctx.subagents.listChildren(captain.id), [])
    assert.equal(adapter.requests.length, 0)
  }
})

test('rejected inline roster saved as a trusted Profile preserves captain fallback and non-default reasoning modes', { timeout: 20_000 }, async t => {
  const { stateRoot, call } = await fixture(t, { captainPolicy: INLINE_PLAN_CAPTAIN })
  const created = await call('agent_teams_create', { approval: 'required', plan: { members: [
    { name: 'default' }, { name: 'aware', reasoning_mode: 'route-aware' },
    { name: 'explicit', provider: 'alt-gateway', model: 'worker-small', reasoning_mode: 'explicit', reasoning_effort: 'high' },
  ], tasks: [] } })
  const members = (await readTeam(stateRoot, created.team_id)).members
  assertPolicy(members[0], { ...INLINE_PLAN_CAPTAIN, reasoningMode: 'target-default', reasoningEffort: undefined })
  assertPolicy(members[1], { ...INLINE_PLAN_CAPTAIN, reasoningMode: 'route-aware', reasoningEffort: undefined })
  assertPolicy(members[2], INLINE_PLAN_TEMPORARY)
})

function assertPolicy(member, expected) {
  for (const key of ['provider', 'model', 'reasoningMode', 'reasoningEffort']) {
    assert.equal(member[key], expected[key], `${member.name}: durable ${key} must follow the selected policy`)
  }
}

async function assertRequest(adapter, childId, expected) {
  const request = await eventually(() => adapter.requests.find(item => item.sessionId === childId), `child ${childId} never reached the real AgentLoop adapter`)
  for (const key of ['provider', 'model', 'reasoningEffort']) {
    assert.equal(request[key], expected[key], `child ${childId}: actual request ${key} must follow the durable policy`)
  }
}

test('Profile-bound Team uses authorized temporary policy for five concurrent custom members and freezes continuations', { timeout: 20_000 }, async t => {
  const profiles = { 'saved-profile': { taskPlanning: 'captain', members: [{ name: 'reviewer', reasoning_mode: 'target-default' }] } }
  const { ctx, stateRoot, adapter, captain, teamFiber, call, authorizeTemporary } = await fixture(t, { temporaryAuthorization: true, temporaryMember: TEMPORARY, profiles })
  const created = await call('agent_teams_create', { description: 'ad-hoc specialist review' })
  const empty = await readTeam(stateRoot, created.team_id)
  assert.equal(empty.profile.name, 'saved-profile', 'bare model create must bind the explicitly saved fixture Profile')
  assert.deepEqual(empty.members.map(member => member.name), ['reviewer'])
  const additions = await Promise.all(CUSTOM_NAMES.map(name => call('agent_teams_add_member', { name })))
  assert.equal(new Set(additions.map(item => item.member_id)).size, 5)
  const team = await readTeam(stateRoot, created.team_id)
  assert.equal(team.members.length, 6, 'custom members must not be limited to four built-in roles')
  for (const member of team.members.filter(member => CUSTOM_NAMES.includes(member.name))) {
    assertPolicy(member, TEMPORARY)
    assert.equal(member.modelPolicySource, 'temporary')
    await assertRequest(adapter, member.id, TEMPORARY)
  }
  const original = team.members.find(member => member.name === CUSTOM_NAMES[0])
  const changedDefault = { provider: 'offline', model: 'explicit-model', reasoningMode: 'explicit', reasoningEffort: 'high' }
  updateVolatile(teamFiber.config.temporaryMember, createVolatile(changedDefault))
  const later = await call('agent_teams_add_member', { name: 'accessibility-auditor' })
  assertPolicy((await readTeam(stateRoot, team.id)).members.find(member => member.id === later.member_id), changedDefault)
  await assertRequest(adapter, later.member_id, changedDefault)
  const oldIndex = adapter.requests.findIndex(request => request.sessionId === original.id)
  adapter.release(oldIndex)
  await eventually(() => ctx.agents.get(SessionId(original.id)) === undefined, 'the original child never unloaded after its greeting')
  const countBeforeResume = adapter.requests.filter(request => request.sessionId === original.id).length
  authorizeTemporary()
  await call('agent_teams_send_message', { to: original.name, content: 'continue with the frozen policy' })
  const resumed = await eventually(() => {
    const requests = adapter.requests.filter(request => request.sessionId === original.id)
    return requests.length > countBeforeResume ? requests.at(-1) : undefined
  }, 'the cold continuation never reached the real AgentLoop')
  assert.equal(resumed.provider, TEMPORARY.provider)
  assert.equal(resumed.model, TEMPORARY.model)
  assert.equal(resumed.reasoningEffort, TEMPORARY.reasoningEffort)
  assertPolicy((await readTeam(stateRoot, team.id)).members.find(member => member.id === original.id), TEMPORARY)
  const session = await ctx.sessionPersistence.open(SessionId(original.id), 'read')
  try { assert.equal(session.header.parentSession, captain.id) } finally { await session.close() }
})

for (const taskPlanning of ['captain', 'seed']) {
  test(`${taskPlanning} Profile keeps all frozen role modes while custom members use temporary defaults`, { timeout: 20_000 }, async t => {
    const rolePolicies = {
      reviewer: { provider: 'offline', model: 'role-model', reasoningMode: 'explicit', reasoningEffort: 'low' },
      analyst: { provider: 'offline', model: 'role-model', reasoningMode: 'target-default' },
      implementer: { ...CAPTAIN, reasoningMode: 'route-aware' },
    }
    const members = Object.entries(rolePolicies).map(([name, policy]) => ({
      name, role: `${name} responsibilities`, provider: policy.provider, model: policy.model,
      reasoning_mode: policy.reasoningMode, ...(policy.reasoningEffort === undefined ? {} : { reasoning_effort: policy.reasoningEffort }),
      executionPrompt: `frozen ${name} prompt`,
    }))
    const profiles = { delivery: { taskPlanning, members, tasks: [{ id: 'review', subject: 'fixed review', assignee: 'reviewer' }] } }
    const { stateRoot, adapter, teamFiber, call } = await fixture(t, { temporaryAuthorization: true, temporaryMember: TEMPORARY, profiles })
    const created = await call('agent_teams_create', { description: 'profile policy isolation', profile: 'delivery' })
    const frozen = await readTeam(stateRoot, created.team_id)
    assert.equal(frozen.profile.taskPlanning, taskPlanning)
    assert.equal(frozen.tasks.length, taskPlanning === 'seed' ? 1 : 0)
    for (const member of frozen.members) assertPolicy(member, rolePolicies[member.name])
    if (taskPlanning === 'captain') await call('agent_teams_create_task', { subject: 'captain planned review', assignee: 'reviewer' })
    const reviewer = await eventually(async () => (await readTeam(stateRoot, frozen.id)).members.find(member => member.name === 'reviewer' && member.id), 'the Profile reviewer never spawned for its task')
    await assertRequest(adapter, reviewer.id, rolePolicies.reviewer)
    updateVolatile(teamFiber.config.profiles, createVolatile({ delivery: { taskPlanning, members: members.map(member => ({ ...member, provider: 'cli2api', model: 'qwen3.8-flash' })) } }))
    for (const [base, policy] of Object.entries(rolePolicies)) {
      const clone = await call('agent_teams_add_member', { name: `${base}-2` })
      const persisted = (await readTeam(stateRoot, frozen.id)).members.find(member => member.id === clone.member_id)
      assertPolicy(persisted, policy)
      assert.equal(persisted.modelPolicySource, 'role-template')
      assert.equal(persisted.executionPrompt, `frozen ${base} prompt`)
      await assertRequest(adapter, clone.member_id, policy)
    }
    const exactRole = await call('agent_teams_add_member', { name: 'special-reviewer', role: 'reviewer responsibilities', role_template: 'reviewer' })
    assertPolicy((await readTeam(stateRoot, frozen.id)).members.find(member => member.id === exactRole.member_id), rolePolicies.reviewer)
    await assertRequest(adapter, exactRole.member_id, rolePolicies.reviewer)
    const custom = await call('agent_teams_add_member', { name: 'stability-auditor' })
    assertPolicy((await readTeam(stateRoot, frozen.id)).members.find(member => member.id === custom.member_id), TEMPORARY)
    await assertRequest(adapter, custom.member_id, TEMPORARY)
    const explicit = { provider: 'offline', model: 'explicit-model', reasoningMode: 'explicit', reasoningEffort: 'high' }
    const override = await call('agent_teams_add_member', { name: 'reviewer-3', provider: explicit.provider, model: explicit.model, reasoning_mode: explicit.reasoningMode, reasoning_effort: explicit.reasoningEffort })
    assertPolicy((await readTeam(stateRoot, frozen.id)).members.find(member => member.id === override.member_id), explicit)
    await assertRequest(adapter, override.member_id, explicit)
    for (const original of frozen.members) assertPolicy((await readTeam(stateRoot, frozen.id)).members.find(member => member.name === original.name), rolePolicies[original.name])
  })
}

test('Absent temporary policy retains captain target-default for a direct custom member', { timeout: 15_000 }, async t => {
  const { stateRoot, adapter, call } = await fixture(t, { temporaryAuthorization: true })
  const created = await call('agent_teams_create', { description: 'unconfigured custom member' })
  const added = await call('agent_teams_add_member', { name: 'feature-auditor' })
  assertPolicy((await readTeam(stateRoot, created.team_id)).members.find(member => member.id === added.member_id), CAPTAIN)
  assert.equal((await readTeam(stateRoot, created.team_id)).members.find(member => member.id === added.member_id).modelPolicySource, 'captain')
  await assertRequest(adapter, added.member_id, CAPTAIN)
})

test('rejected inline roster saved as a trusted Profile uses role defaults and preserves explicit policy', { timeout: 20_000 }, async t => {
  const { stateRoot, adapter, call } = await fixture(t, {
    captainPolicy: INLINE_PLAN_CAPTAIN,
    temporaryMember: INLINE_PLAN_TEMPORARY,
  })
  const created = await call('agent_teams_create', {
    name: 'inline-default-routing',
    description: 'real Tools and AgentLoop create-plan routing',
    plan: {
      members: [
        { name: 'omitted-route' },
        { name: 'echoed-default', reasoning_mode: 'target-default' },
        { name: 'blank-optional-route', provider: ' ', model: ' ', reasoning_mode: 'target-default' },
        { name: 'captain-explicit', provider: INLINE_PLAN_CAPTAIN.provider, model: INLINE_PLAN_CAPTAIN.model, reasoning_mode: 'explicit', reasoning_effort: INLINE_PLAN_CAPTAIN.reasoningEffort },
      ],
      tasks: [
        { id: 'omitted', subject: 'omitted route task', assignee: 'omitted-route', dependencies: [] },
        { id: 'echoed', subject: 'echoed default task', assignee: 'echoed-default', dependencies: [] },
        { id: 'blank', subject: 'blank optional task', assignee: 'blank-optional-route', dependencies: [] },
        { id: 'explicit', subject: 'explicit route task', assignee: 'captain-explicit', dependencies: [] },
      ],
    },
  })
  const team = await readTeam(stateRoot, created.team_id)
  for (const name of ['omitted-route', 'echoed-default', 'blank-optional-route']) {
    const member = await eventually(async () => (await readTeam(stateRoot, team.id)).members.find(item => item.name === name && item.id), `${name} was not dispatched through the real scheduler`)
    assertPolicy(member, { ...INLINE_PLAN_CAPTAIN, reasoningMode: 'target-default', reasoningEffort: undefined })
    assert.equal(member.modelPolicySource, 'profile')
    await assertRequest(adapter, member.id, { ...INLINE_PLAN_CAPTAIN, reasoningEffort: undefined })
  }
  const explicit = await eventually(async () => (await readTeam(stateRoot, team.id)).members.find(item => item.name === 'captain-explicit' && item.id), 'explicit planned member was not dispatched')
  assertPolicy(explicit, INLINE_PLAN_CAPTAIN)
  assert.equal(explicit.modelPolicySource, 'profile')
  await assertRequest(adapter, explicit.id, INLINE_PLAN_CAPTAIN)
})

test('Unavailable or invalid custom-member defaults reject before any Team or child write', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, teamFiber, execute, call } = await fixture(t, { temporaryAuthorization: true, temporaryMember: TEMPORARY })
  const created = await call('agent_teams_create', { description: 'invalid route is fail closed' })
  for (const policy of [
    { ...TEMPORARY, provider: 'missing-provider' },
    { ...TEMPORARY, model: 'missing-model' },
    { ...TEMPORARY, reasoningEffort: 'missing-effort' },
    { provider: TEMPORARY.provider, reasoningMode: 'explicit', reasoningEffort: 'xhigh' },
  ]) {
    // Exercise the volatile live configuration boundary without weakening the
    // settings schema; malformed durable/default data must also fail closed.
    updateVolatile(teamFiber.config.temporaryMember, createVolatile(policy))
    const before = await readTeam(stateRoot, created.team_id)
    const childrenBefore = await ctx.subagents.listChildren(captain.id)
    const result = await execute('agent_teams_add_member', { name: 'verifier' })
    assert.equal(result.isError, true, `invalid default was silently replaced by captain routing: ${JSON.stringify(policy)}`)
    assert.match(text(result), /provider|model|effort|reasoning|policy/i)
    assert.deepEqual(await readTeam(stateRoot, created.team_id), before, 'refused selection must leave durable Team state unchanged')
    assert.deepEqual(await ctx.subagents.listChildren(captain.id), childrenBefore, 'refused selection must not create a durable child')
    assert.equal(adapter.requests.length, 0)
  }
})

for (const taskPlanning of ['captain', 'seed']) {
  for (const approval of ['automatic', 'required']) {
    test(`role_template binds frozen ${taskPlanning} Profile routes and prompts with ${approval} approval`, { timeout: 20_000 }, async t => {
      const rolePolicy = { provider: 'offline', model: 'role-model', reasoningMode: 'explicit', reasoningEffort: 'low' }
      const prompt = 'Review the frozen Team contract and report specific findings.'
      const profileMember = { name: 'reviewer', role: 'configured reviewer', provider: rolePolicy.provider, model: rolePolicy.model,
        reasoning_mode: rolePolicy.reasoningMode, reasoning_effort: rolePolicy.reasoningEffort, executionPrompt: prompt }
      const profiles = { delivery: { taskPlanning, members: [profileMember], tasks: [{ id: 'fixed', subject: 'fixed reviewer work', assignee: 'reviewer' }] } }
      const { ctx, stateRoot, adapter, captain, teamFiber, call } = await fixture(t, { temporaryAuthorization: true, temporaryMember: TEMPORARY, profiles })
      const created = await call('agent_teams_create', { profile: 'delivery', description: 'explicit frozen role binding', approval })
      const initial = await readTeam(stateRoot, created.team_id)
      assert.equal(initial.profile.taskPlanning, taskPlanning)
      updateVolatile(teamFiber.config.profiles, createVolatile({ delivery: { taskPlanning, members: [{ ...profileMember,
        provider: TEMPORARY.provider, model: TEMPORARY.model, reasoning_effort: TEMPORARY.reasoningEffort, executionPrompt: 'Changed live Profile prompt.' }] } }))
      const bound = await call('agent_teams_add_member', { name: 'code-reviewer', role: 'custom review responsibility', role_template: 'reviewer' })
      const custom = await call('agent_teams_add_member', { name: 'stability-auditor' })
      const explicit = { provider: 'offline', model: 'explicit-model', reasoningMode: 'explicit', reasoningEffort: 'high' }
      const override = await call('agent_teams_add_member', { name: 'ui-reviewer', role_template: 'reviewer',
        provider: explicit.provider, model: explicit.model, reasoning_mode: explicit.reasoningMode, reasoning_effort: explicit.reasoningEffort })
      let team = await readTeam(stateRoot, initial.id)
      assertPolicy(team.members.find(member => member.name === 'code-reviewer'), rolePolicy)
      assertPolicy(team.members.find(member => member.name === 'stability-auditor'), TEMPORARY)
      assert.equal(team.members.find(member => member.name === 'reviewer').modelPolicySource, 'profile')
      assert.equal(team.members.find(member => member.name === 'code-reviewer').modelPolicySource, 'role-template')
      assert.equal(team.members.find(member => member.name === 'ui-reviewer').modelPolicySource, 'explicit')
      assertPolicy(team.members.find(member => member.name === 'ui-reviewer'), explicit)
      for (const name of ['reviewer', 'code-reviewer', 'ui-reviewer']) assert.equal(team.members.find(member => member.name === name).executionPrompt, prompt)
      if (approval === 'required') {
        assert.equal(team.phase, 'staged')
        assert.equal(bound.member_id, '')
        assert.equal(override.member_id, '')
        assert.equal(custom.member_id, '')
        assert.deepEqual(await ctx.subagents.listChildren(captain.id), [])
        assert.equal(adapter.requests.length, 0, 'staged template binding must not run a model')
        for (const assignee of ['code-reviewer', 'ui-reviewer', 'stability-auditor']) await call('agent_teams_create_task', { subject: `${assignee} planned work`, assignee })
        const submitted = await call('agent_teams_edit_plan', { operations: [], submit_for_review: true })
        const status = await call('agent_teams_status', {})
        assert.equal(status.active, true)
        assert.equal(status.phase, 'staged')
        // A genuine new AgentLoop turn supplies the approval statement, tool
        // call and durable evidence. The approval validator is unmodified.
        adapter.captainTool = { confirmation: 'I approve the AgentTeams plan', expected_plan_revision: submitted.plan_revision }
        captain.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'I approve the AgentTeams plan' }] }))
        team = await eventually(async () => {
          const current = await readTeam(stateRoot, initial.id)
          return current.phase === 'running' ? current : undefined
        }, 'the actual approval turn never started the staged Team')
        assert.equal(team.approvalSource, 'chat')
        assert.equal(team.approvedPlanRevision, submitted.plan_revision)
      }
      const boundMember = team.members.find(member => member.name === 'code-reviewer')
      const overrideMember = team.members.find(member => member.name === 'ui-reviewer')
      assert.ok(boundMember.id)
      assert.ok(overrideMember.id)
      assertPolicy(boundMember, rolePolicy)
      assertPolicy(overrideMember, explicit)
      await assertRequest(adapter, boundMember.id, rolePolicy)
      await assertRequest(adapter, overrideMember.id, explicit)
      const customMember = team.members.find(member => member.name === 'stability-auditor')
      assertPolicy(customMember, TEMPORARY)
      assert.equal(customMember.modelPolicySource, 'temporary')
      await assertRequest(adapter, customMember.id, TEMPORARY)
      for (const member of [boundMember, overrideMember]) {
        const request = adapter.requests.find(item => item.sessionId === member.id)
        assert.ok(JSON.stringify(request).includes(prompt), `${member.name}: real assembled request must include the frozen role prompt`)
        assert.equal(JSON.stringify(request).includes('Changed live Profile prompt.'), false)
      }
    })
  }
}

test('staged prompt edits preserve routing provenance while actual policy changes become explicit', async t => {
  const profiles = { delivery: { taskPlanning: 'captain', members: [{ name: 'reviewer',
    provider: 'offline', model: 'role-model', reasoning_mode: 'explicit', reasoning_effort: 'low' }] } }
  const { stateRoot, call } = await fixture(t, { profiles })
  const created = await call('agent_teams_create', { profile: 'delivery', approval: 'required' })
  const edit = async fields => {
    await call('agent_teams_edit_plan', { operations: [{ action: 'update_member', member_name: 'reviewer', ...fields }] })
    return (await readTeam(stateRoot, created.team_id)).members[0]
  }
  assert.equal((await edit({ role: 'updated responsibility', execution_prompt: 'updated prompt' })).modelPolicySource, 'profile')
  assert.equal((await edit({ reasoning_effort: 'high' })).modelPolicySource, 'explicit')
  assert.equal((await edit({ execution_prompt: 'another prompt' })).modelPolicySource, 'explicit')
})

test('role_template rejects unknown, removed and blank explicit names without writes or spawning', { timeout: 15_000 }, async t => {
  const profiles = { delivery: { taskPlanning: 'captain', members: ['reviewer', 'retired'].map(name => ({
    name, provider: 'offline', model: 'role-model', reasoning_mode: 'explicit', reasoning_effort: 'low',
  })) } }
  const { ctx, stateRoot, adapter, captain, execute, call } = await fixture(t, { temporaryAuthorization: true, temporaryMember: TEMPORARY, profiles })
  const created = await call('agent_teams_create', { profile: 'delivery', description: 'invalid role binding' })
  await call('agent_teams_remove_member', { name: 'retired' })
  assert.equal((await readTeam(stateRoot, created.team_id)).members.find(member => member.name === 'retired').status, 'removed')
  for (const role_template of ['missing-role', 'retired', '', ' \t ']) {
    const before = await readTeam(stateRoot, created.team_id)
    const childrenBefore = await ctx.subagents.listChildren(captain.id)
    const result = await execute('agent_teams_add_member', { name: 'code-reviewer', role_template })
    assert.equal(result.isError, true, `invalid explicit role_template was accepted: ${JSON.stringify(role_template)}`)
    assert.match(text(result), /role_template|template/i)
    assert.deepEqual(await readTeam(stateRoot, created.team_id), before)
    assert.deepEqual(await ctx.subagents.listChildren(captain.id), childrenBefore)
    assert.equal(adapter.requests.length, 0)
  }
})
