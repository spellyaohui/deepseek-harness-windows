/** Real registered tools, AgentLoop, continuations, JSONL sessions and Team state;
 * only the external model adapter is replaced, so this regression stays offline. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
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
import * as ToolSubagent from '@deepseek-ai/dsh-tool-subagent'
import * as AgentTeams from '../lib/index.js'
import { readTeam } from '../lib/state.js'

const CAPTAIN = { provider: 'offline', model: 'captain-model', reasoningMode: 'target-default' }
const TEMPORARY = { provider: 'cli2api', model: 'qwen3.8-flash', reasoningMode: 'explicit', reasoningEffort: 'xhigh' }
const CUSTOM_NAMES = ['code-reviewer', 'stability-auditor', 'feature-auditor', 'ui-reviewer', 'verifier']
const text = result => result.content.filter(block => block.type === 'text').map(block => block.text).join('')

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
  release(index) { this.released.add(index); this.gates[index]?.resolve() }
  releaseAll() { this.releasingAll = true; this.gates.forEach(gate => gate.resolve()) }
  async listModels(provider) {
    return ['captain-model', 'qwen3.8-flash', 'role-model', 'explicit-model'].map(id => ({ provider, id, name: id }))
  }
  async resolveModel(provider, model) {
    if (!(await this.listModels(provider)).some(entry => entry.id === model)) throw new Error(`unknown offline model ${model}`)
    return { provider, id: model, name: model, reasoning: { efforts: ['low', 'high', 'xhigh'].map(id => ({ id, name: id })) } }
  }
  async *stream(options) {
    assert.ok(options.sessionId, 'the real AgentLoop must stamp request ownership')
    const index = this.requests.length
    this.requests.push(options)
    if (options.sessionId === 'routing-captain' && this.captainTool !== undefined) {
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

async function fixture(t, { temporaryMember, profiles = {} } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-custom-member-routing-'))
  const ctx = new Context()
  const adapter = new OfflineAdapter()
  t.after(async () => {
    adapter.releaseAll()
    await ctx.fiber.dispose()
    // Only remove the newly minted temporary fixture, never a user workspace.
    await rm(workspace, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })
  })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: join(workspace, 'sessions') })
  await ctx.plugin(SessionQuery)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime, { maxActiveSubagents: 16 })
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  const teamFiber = ctx.plugin(AgentTeams, {
    delegationMode: 'teams', stateDir: '.agent-teams', memberProvider: 'spawn',
    memberMaxDepth: 0, maxMembers: 16, profiles, slashCommand: false,
    ...(temporaryMember === undefined ? {} : { temporaryMember }),
  })
  await teamFiber
  ctx.llm.registerAdapter(['offline', 'cli2api'], adapter)
  const handle = await ctx.agents.create({
    sessionId: SessionId('routing-captain'), meta: { cwd: workspace },
    agentOptions: { provider: CAPTAIN.provider, model: CAPTAIN.model },
    setup: async (agentCtx, agent) => {
      const fiber = agentCtx.inject(ToolSubagent.inject, runtimeCtx => ToolSubagent.apply(runtimeCtx, {
        provider: 'spawn', backgroundMode: 'continuable', modelSelectionSettings: false,
      }, agent.session))
      await fiber.await()
    },
  })
  let callSeq = 0
  const execute = (name, args) => ctx.tools.execute({
    signal: new AbortController().signal, callId: ToolCallId(`routing-${++callSeq}`),
    name, arguments: args, agent: handle.agent,
  })
  const call = async (name, args) => {
    const result = await execute(name, args)
    assert.equal(result.isError, false, text(result))
    return result.value
  }
  const stateRoot = join(workspace, '.agent-teams')
  return { ctx, stateRoot, adapter, captain: handle.agent, teamFiber, execute, call }
}

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

test('Bare Team uses saved temporary policy for five concurrent custom members and freezes later continuations', { timeout: 20_000 }, async t => {
  const profiles = { 'saved-profile': { taskPlanning: 'captain', members: [{ name: 'reviewer', reasoning_mode: 'target-default' }] } }
  const { ctx, stateRoot, adapter, captain, teamFiber, call } = await fixture(t, { temporaryMember: TEMPORARY, profiles })
  const created = await call('agent_teams_create', { description: 'ad-hoc specialist review' })
  const empty = await readTeam(stateRoot, created.team_id)
  assert.equal(empty.profile, undefined, 'bare create must never choose an implicit Profile')
  assert.deepEqual(empty.members, [])
  const additions = await Promise.all(CUSTOM_NAMES.map(name => call('agent_teams_add_member', { name })))
  assert.equal(new Set(additions.map(item => item.member_id)).size, 5)
  const team = await readTeam(stateRoot, created.team_id)
  assert.equal(team.members.length, 5, 'custom members must not be limited to four built-in roles')
  for (const member of team.members) {
    assertPolicy(member, TEMPORARY)
    assert.equal(member.modelPolicySource, 'temporary')
    await assertRequest(adapter, member.id, TEMPORARY)
  }
  const original = team.members[0]
  const changedDefault = { provider: 'offline', model: 'explicit-model', reasoningMode: 'explicit', reasoningEffort: 'high' }
  updateVolatile(teamFiber.config.temporaryMember, createVolatile(changedDefault))
  const later = await call('agent_teams_add_member', { name: 'accessibility-auditor' })
  assertPolicy((await readTeam(stateRoot, team.id)).members.find(member => member.id === later.member_id), changedDefault)
  await assertRequest(adapter, later.member_id, changedDefault)
  const oldIndex = adapter.requests.findIndex(request => request.sessionId === original.id)
  adapter.release(oldIndex)
  await eventually(() => ctx.agents.get(SessionId(original.id)) === undefined, 'the original child never unloaded after its greeting')
  const countBeforeResume = adapter.requests.filter(request => request.sessionId === original.id).length
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
    const { stateRoot, adapter, teamFiber, call } = await fixture(t, { temporaryMember: TEMPORARY, profiles })
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
    const exactRole = await call('agent_teams_add_member', { name: 'special-reviewer', role: 'reviewer responsibilities' })
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
  const { stateRoot, adapter, call } = await fixture(t)
  const created = await call('agent_teams_create', { description: 'unconfigured custom member' })
  const added = await call('agent_teams_add_member', { name: 'feature-auditor' })
  assertPolicy((await readTeam(stateRoot, created.team_id)).members[0], CAPTAIN)
  assert.equal((await readTeam(stateRoot, created.team_id)).members[0].modelPolicySource, 'captain')
  await assertRequest(adapter, added.member_id, CAPTAIN)
})

test('Unavailable or invalid custom-member defaults reject before any Team or child write', { timeout: 15_000 }, async t => {
  const { ctx, stateRoot, adapter, captain, teamFiber, execute, call } = await fixture(t, { temporaryMember: TEMPORARY })
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
      const { ctx, stateRoot, adapter, captain, teamFiber, call } = await fixture(t, { temporaryMember: TEMPORARY, profiles })
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
  const { ctx, stateRoot, adapter, captain, execute, call } = await fixture(t, { temporaryMember: TEMPORARY, profiles })
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
