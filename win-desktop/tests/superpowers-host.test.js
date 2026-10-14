import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import * as Superpowers from '../superpowers-plugin/lib/index.js'
import { installDelegationPolicy } from '../agent-teams-plugin/lib/routing-policy.js'
import { createAgentTeamsSubagentGateway } from '../agent-teams-plugin/lib/subagent-gateway.js'
import { createSuperpowersHarness, execute } from './fixtures/superpowers-harness.mjs'

async function mount(t, options = {}) {
  const cwd = await mkdtemp(join(tmpdir(), 'dsh-superpowers-host 中文-'))
  const harness = await createSuperpowersHarness({ cwd, ...options })
  t.after(async () => { await harness.dispose(); await rm(cwd, { recursive: true, force: true }) })
  return harness
}
const sources = (events, kind) => events.filter(event => event.type === 'user/message' && event.data.source.kind === kind)
const text = message => message.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
function registerTool(ctx, name, calls) {
  ctx.tools.register(defineTool({ name, description: 'Controlled test transport', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() { calls.push(name); return 'transport reached' } }))
}

test('explicit slash injects full skill and mapping through the real AgentLoop', async t => {
  const h = await mount(t)
  const events = await h.turn('/brainstorming /missing-skill')
  const loaded = sources(events, 'skill-invocation')
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].data.source.name, 'brainstorming')
  const skill = await h.ctx.skills.get('brainstorming', { cwd: h.agent.session.header.cwd })
  assert.ok(text(loaded[0].data).includes(skill.content))
  assert.match(text(loaded[0].data), /<dsh_tool_mapping>/u)
  h.ctx.skills.register({ name: 'manual-only', description: 'Manual fixture', source: 'runtime',
    content: 'Manual-only instructions', invocation: { modelInvocable: false, userInvocable: true } })
  assert.equal((await execute(h, 'skill', { name: 'manual-only' })).isError, true)
  assert.ok(sources(await h.turn('/manual-only'), 'skill-invocation').some(event => event.data.source.name === 'manual-only'))
})

test('automatic catalog exposes summaries and the actual skill tool loads only selected bodies', async t => {
  const h = await mount(t)
  const events = await h.turn('Describe available skills')
  const catalog = sources(events, 'skill-catalog').at(-1).data
  assert.equal(catalog.source.entries.length, 15)
  assert.ok(catalog.source.entries.every(entry => entry.description.length > 0))
  assert.ok(!text(catalog).includes('<dsh_tool_mapping>'))
  assert.ok(!text(catalog).includes('## HARD-GATE'))
  const result = await execute(h, 'skill', { name: 'systematic-debugging' })
  assert.equal(result.isError, false)
  assert.equal(result.value.name, 'systematic-debugging')
  assert.match(result.value.content, /<dsh_tool_mapping>/u)
  const lift = h.agent.ctx.tools.restrict({ deny: ['skill'] })
  await h.turn('Skill tool unavailable')
  assert.deepEqual(sources(h.agent.session.snapshotEvents(), 'skill-catalog').at(-1).data.source.entries, [])
  lift()
  const calls = []
  registerTool(h.agent.ctx, 'skill', calls)
  await h.turn('Scoped shadow is not the official skill loader')
  assert.deepEqual(sources(h.agent.session.snapshotEvents(), 'skill-catalog').at(-1).data.source.entries, [])
  assert.deepEqual(calls, [])
})

test('two turns, provider replacement and canonical surface compaction retain native skill semantics', async t => {
  const h = await mount(t)
  await h.turn('/brainstorming')
  await h.turn('/systematic-debugging')
  assert.equal(h.requests.length, 2)
  assert.deepEqual(sources(h.agent.session.snapshotEvents(), 'skill-invocation').map(event => event.data.source.name),
    ['brainstorming', 'systematic-debugging'])
  await h.provider.dispose()
  await h.turn('Provider disabled')
  assert.deepEqual(sources(h.agent.session.snapshotEvents(), 'skill-catalog').at(-1).data.source.entries, [])
  const nodes = h.agent.session.surface.nodes.slice(1)
  h.agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Compacted test history' }],
    source: { kind: 'compaction' } }), { surfaceOp: { op: 'replace', startSeq: nodes[0], endSeq: nodes.at(-1) }, sourceEventSeqs: nodes })
  assert.ok(h.agent.session.surface.replaceGeneration > 0)
  assert.ok(!h.agent.session.deriveMessages().some(message => message.source?.kind === 'skill-invocation'))
  await h.ctx.plugin(Superpowers)
  const restored = await h.turn('/brainstorming')
  assert.equal(sources(restored, 'skill-catalog').at(-1).data.source.entries.length, 15)
  assert.ok(h.agent.session.deriveMessages().some(message => message.source?.kind === 'skill-invocation'))
})

test('skill instructions cannot give a Team member captain authority or bypass Team native restrictions', async t => {
  const h = await mount(t, { policy: 'teams-v1', role: 'member' })
  const calls = []
  for (const name of ['agent_teams_create', 'agent_teams_add_member', 'subagent', 'send_message']) registerTool(h.ctx, name, calls)
  const member = await h.ctx.agentLoop.create('member-policy-test', { provider: 'offline', model: 'offline' },
    { cwd: h.agent.session.header.cwd })
  const dispose = installDelegationPolicy({ agent: member, policy: 'teams-v1', order: 120, text: 'member', member: true })
  t.after(dispose)
  for (const name of ['subagent-driven-development', 'requesting-code-review']) {
    const result = await execute({ ...h, agent: member }, 'skill', { name })
    assert.equal(result.isError, false)
  }
  for (const name of ['agent_teams_create', 'agent_teams_add_member', 'subagent', 'send_message']) {
    assert.equal((await execute({ ...h, agent: member }, name)).isError, true)
  }
  assert.equal((await execute(h, 'subagent')).isError, true)
  const native = await mount(t, { policy: 'native-v1' })
  registerTool(native.ctx, 'subagent', calls)
  assert.equal((await execute(native, 'subagent')).isError, false)
  assert.deepEqual(calls, ['subagent'])
})

test('loading a skill leaves Team continuation on the existing durable gateway', async t => {
  const h = await mount(t, { policy: 'teams-v1' })
  const result = await execute(h, 'skill', { name: 'subagent-driven-development' })
  assert.equal(result.isError, false)
  const calls = []
  const gateway = createAgentTeamsSubagentGateway({ agents: h.ctx.agents, logger: h.ctx.logger,
    subagents: {
      async startContinuable(spec) { calls.push(['start', spec.request.parent]); return { childId: 'child', messageId: 'welcome' } },
      async sendMessage(parent) { calls.push(['send', parent]); return 'delivery-only' },
      interrupt(_id, authority) { calls.push(['interrupt', authority.agent]) },
      async drainContinuableChildren(parent) { calls.push(['drain', parent]) },
    } })
  const signal = new AbortController().signal
  await gateway.startContinuable({ provider: 'spawn', label: 'team:member', request: { parent: h.agent,
    prompt: [{ type: 'text', text: 'task' }] }, signal })
  assert.equal(await gateway.sendMessage(h.agent, 'child', [{ type: 'text', text: 'revision' }], { signal }), 'delivery-only')
  await gateway.interrupt(h.agent, 'child')
  await gateway.drainContinuableChildren(h.agent, ['child'])
  assert.deepEqual(calls.map(call => call[0]), ['start', 'send', 'interrupt', 'drain'])
  assert.ok(calls.every(call => call[1] === h.agent))
  const before = calls.length
  await assert.rejects(gateway.sendMessage({ id: h.agent.id, session: h.agent.session }, 'child', [], { signal }), /not attached/u)
  assert.equal(calls.length, before)
})
