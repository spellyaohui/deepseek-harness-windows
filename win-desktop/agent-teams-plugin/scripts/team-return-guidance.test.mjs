/**
 * Regression for Team children receiving an unusable native return instruction.
 * Uses the official scoped controls, AgentLoop, prompt assembly, continuations,
 * persistence and Team plugin. Only the external model response is offline.
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
import * as ToolSubagentControl from '@deepseek-ai/dsh-tool-subagent-control'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import * as AgentTeams from '../lib/index.js'
import { registerDelegationPolicyLifecycle } from '../lib/routing-policy.js'

function resultText(result) {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
}

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
  release = Promise.withResolvers()
  async resolveModel(provider, model) { return { provider, id: model, name: model } }
  async listModels(provider) { return [{ provider, id: 'offline-model', name: 'offline-model' }] }
  async *stream(options) {
    this.requests.push(options)
    await Promise.race([
      this.release.promise,
      new Promise(resolve => options.signal?.addEventListener('abort', resolve, { once: true })),
    ])
    if (options.signal?.aborted) return
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: '离线返回指引验证结束。' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '离线返回指引验证结束。' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function fixture(t, mode) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-team-return-guidance-'))
  const ctx = new Context()
  const adapter = new OfflineAdapter()
  t.after(async () => {
    adapter.release.resolve()
    await ctx.fiber.dispose()
    // Only this fixture's newly minted temporary directory is removed.
    await rm(workspace, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })
  })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: join(workspace, 'sessions') })
  await ctx.plugin(SessionQuery)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(SubagentRuntime)
  await ctx.plugin(SubagentSpawn, { providerName: 'spawn' })
  // Preset tools are local registrations, not global fixtures. Mount the actual
  // native control package before the continuation manager admits its prompt.
  ctx.on('agent/created', async ({ agent }) => {
    const fiber = agent.ctx.inject(ToolSubagentControl.inject, toolCtx => ToolSubagentControl.apply(toolCtx))
    await fiber.await()
  })
  const initialGetDescriptor = Object.getOwnPropertyDescriptor(ctx.tools, 'get')
  const teamConfig = {
    delegationMode: mode, stateDir: '.agent-teams', memberProvider: 'spawn',
    memberMaxDepth: 0, maxMembers: 4, profiles: {}, slashCommand: false,
  }
  const teamFiber = ctx.plugin(AgentTeams, teamConfig)
  await teamFiber
  ctx.llm.registerAdapter(['offline'], adapter)
  const handle = await ctx.agents.create({
    sessionId: SessionId('return-guidance-captain'), meta: { cwd: workspace },
    agentOptions: { provider: 'offline', model: 'offline-model' },
    setup: async (agentCtx, agent) => {
      const fiber = agentCtx.inject(ToolSubagent.inject, runtimeCtx => {
        ToolSubagent.apply(runtimeCtx, {
          provider: 'spawn', backgroundMode: 'continuable', modelSelectionSettings: false,
        }, agent.session)
      })
      await fiber.await()
    },
  })
  let call = 0
  const execute = (agent, name, args) => ctx.tools.execute({
    callId: ToolCallId(`return-guidance-${++call}`), name, arguments: args,
    agent, signal: new AbortController().signal,
  })
  return { ctx, adapter, captain: handle.agent, execute, teamFiber, teamConfig, initialGetDescriptor }
}

test('Team member first request advertises only usable reporting and no native return instruction', { timeout: 15_000 }, async t => {
  const { ctx, adapter, captain, execute } = await fixture(t, 'teams')
  const created = await execute(captain, 'agent_teams_create', { description: '团队返回指引离线回归' })
  assert.equal(created.isError, false, resultText(created))
  const added = await execute(captain, 'agent_teams_add_member', { name: 'worker', role: '验证返回指引' })
  assert.equal(added.isError, false, resultText(added))
  const request = await eventually(() => adapter.requests.find(item => item.sessionId === added.value.member_id), 'the child did not reach the real model-request boundary')
  const child = ctx.agents.get(SessionId(added.value.member_id))
  assert.ok(child)

  await t.test('forced native control remains denied while Team reporting succeeds', async () => {
    const native = await execute(child, 'send_message', { agent_id: captain.id, message: '不能走原生消息通道。' })
    assert.equal(native.isError, true, 'hiding a schema must not weaken the execution guard')
    const team = await execute(child, 'agent_teams_send_message', { to: 'captain', content: '使用团队消息通道报告。' })
    assert.equal(team.isError, false, resultText(team))
  })
  await t.test('first model tool schemas hide scope-local native messaging controls', () => {
    assert.ok(request.tools.some(tool => tool.name === 'agent_teams_send_message'))
    assert.ok(!request.tools.some(tool => ['send_message', 'interrupt_agent'].includes(tool.name)),
      'a Team child must not be shown scope-local tools its policy forbids')
  })
  await t.test('continuation task content never tells Team members to use native send_message', () => {
    assert.ok(!JSON.stringify(request.messages).includes('Before you finish, send your result to that agent with send_message('),
      'upstream return guidance must not demand a forbidden native message call')
    assert.match(JSON.stringify(request), /agent_teams_send_message/)
  })
})

test('Native continuable child keeps official return guidance and adjacent-Agent authorization', { timeout: 15_000 }, async t => {
  const { ctx, adapter, captain, execute } = await fixture(t, 'native')
  const started = await execute(captain, 'subagent', {
    description: '原生返回指引验证', prompt: '检查原生模式消息通道。', run_in_background: true,
  })
  assert.equal(started.isError, false, resultText(started))
  const request = await eventually(() => adapter.requests.find(item => item.sessionId !== captain.id), 'the native child did not execute')
  const child = ctx.agents.get(SessionId(request.sessionId))
  assert.ok(request.tools.some(tool => tool.name === 'send_message'))
  assert.ok(request.tools.some(tool => tool.name === 'interrupt_agent'))
  assert.match(JSON.stringify(request.messages), /Before you finish, send your result to that agent with send_message\(/)
  const delivered = await execute(child, 'send_message', { agent_id: captain.id, message: '原生模式正确报告给父智能体。' })
  assert.equal(delivered.isError, false, resultText(delivered))
  const denied = await execute(child, 'send_message', { agent_id: 'unrelated-agent', message: '不能发送给非相邻智能体。' })
  assert.equal(denied.isError, true, 'native adjacency authorization must remain strict')
})

test('Team policies hide later scoped native registrations and preserve captain subagent compatibility', { timeout: 15_000 }, async t => {
  const { ctx, adapter, captain, execute } = await fixture(t, 'teams')
  const delegated = await execute(captain, 'subagent', {
    description: '队长临时委派兼容边界', prompt: '离线检查团队控制工具。', run_in_background: true,
  })
  assert.equal(delegated.isError, false, resultText(delegated))
  const request = await eventually(() => adapter.requests.find(item => item.sessionId !== captain.id), 'captain compatibility did not create a real Team child')
  const child = ctx.agents.get(SessionId(request.sessionId))
  const captainAssembly = await ctx.systemPrompt.assemble({ scope: captain })
  assert.ok(captainAssembly.tools.some(tool => tool.name === 'subagent'), 'the captain retains the official compatibility schema')
  assert.ok(ctx.tools.get('subagent', captain), 'official captain lookup retains compatibility entry')

  let executed = false
  child.ctx.tools.register(defineContentToolFixture({
    name: 'list_agents', description: 'late own-scope native tool', parameters: {},
    execute: async () => { executed = true; return [] },
  }))
  assert.equal(ctx.tools.get('list_agents', child), undefined, 'late registrations cannot advertise native return capabilities')
  const childAssembly = await ctx.systemPrompt.assemble({ scope: child })
  assert.ok(!childAssembly.tools.some(tool => tool.name === 'list_agents'))
  const denied = await execute(child, 'list_agents', {})
  assert.equal(denied.isError, true)
  assert.equal(executed, false, 'hidden native tools must not execute through a direct call')
  const nested = await execute(child, 'subagent', {
    description: '成员不可再委派', prompt: '禁止该嵌套调用。', run_in_background: true,
  })
  assert.equal(nested.isError, true, 'captain compatibility must never transfer to members')
})

test('AgentTeams HMR restores lookup and prompt visibility before reapplying policy to live Agents', { timeout: 15_000 }, async t => {
  const { ctx, captain, teamFiber, teamConfig, initialGetDescriptor } = await fixture(t, 'teams')
  const definition = captain.ctx.tools.view(captain).visible.get('send_message')
  assert.ok(definition, 'the own-scope native definition remains owned by its original plugin')
  assert.equal(ctx.tools.get('send_message', captain), undefined)
  await teamFiber.dispose()
  assert.deepEqual(Object.getOwnPropertyDescriptor(ctx.tools, 'get'), initialGetDescriptor,
    'disposing AgentTeams restores the original method descriptor without touching native registrations')
  assert.equal(ctx.tools.get('send_message', captain), definition)
  const unmounted = await ctx.systemPrompt.assemble({ scope: captain })
  assert.ok(unmounted.tools.some(tool => tool.name === 'send_message'))
  assert.ok(!unmounted.sections.some(section => section.name === 'agent-teams:usage'))
  const remounted = ctx.plugin(AgentTeams, teamConfig)
  await remounted
  assert.equal(ctx.tools.get('send_message', captain), undefined)
  const assembly = await ctx.systemPrompt.assemble({ scope: captain })
  assert.ok(!assembly.tools.some(tool => tool.name === 'send_message'))
  assert.equal(assembly.sections.filter(section => section.name === 'agent-teams:usage').length, 1,
    'remount must not duplicate policy sections')
  await remounted.dispose()
  assert.deepEqual(Object.getOwnPropertyDescriptor(ctx.tools, 'get'), initialGetDescriptor)
  assert.equal(ctx.tools.get('send_message', captain), definition)
})

test('a failed existing-Agent policy hydration cannot leak a shared tools.get override', { timeout: 15_000 }, async t => {
  const { ctx, teamFiber, initialGetDescriptor } = await fixture(t, 'native')
  await teamFiber.dispose()
  let caught
  const failing = ctx.plugin(Object.assign(pluginCtx => {
    try {
      registerDelegationPolicyLifecycle(pluginCtx, {
        defaultMode: () => 'teams', order: 117,
        text: () => { throw new Error('injected policy-render failure') },
      })
    } catch (error) {
      caught = error
    }
  }, { inject: ['tools', 'agents', 'systemPrompt'] }))
  await failing
  assert.match(caught?.message ?? '', /injected policy-render failure/)
  await failing.dispose()
  assert.deepEqual(Object.getOwnPropertyDescriptor(ctx.tools, 'get'), initialGetDescriptor,
    'a partially mounted policy must restore its shared lookup override even when hydration throws')
})
