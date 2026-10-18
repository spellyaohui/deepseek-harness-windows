import assert from 'node:assert/strict'
import test from 'node:test'
import { createAgentTeamsSubagentGateway } from '../lib/subagent-gateway.js'

test('managed member creation uses the upstream activation adapter inside exact-parent admission', async () => {
  const parent = { id: 'parent', session: { id: 'parent' } }
  const calls = []
  const ctx = {
    agents: { get: id => id === parent.id ? parent : undefined },
    subagents: {
      async startActivation(spec) { calls.push(spec); return { childId: 'child', result: Promise.resolve() } },
      interrupt() {},
    },
    logger: { warn() {} },
  }
  const gateway = createAgentTeamsSubagentGateway(ctx)
  const spec = { provider: 'spawn', label: 'member', request: { parent, prompt: [], persona: 'role', toolFilter: { deny: ['write'] } }, signal: new AbortController().signal }
  assert.equal((await gateway.startContinuable(spec)).childId, 'child')
  assert.equal(calls[0].request.parent, parent)
  assert.equal(calls[0].delivery, 'parent')
  assert.equal(Object.hasOwn(calls[0].request, 'persona'), false)
  assert.equal(Object.hasOwn(calls[0].request, 'toolFilter'), false)
  await assert.rejects(gateway.startContinuable({ ...spec, request: { ...spec.request, parent: { ...parent } } }), /rejected parent handle/)
  assert.equal(calls.length, 1)
})

test('targeted managed drain stays inside the same child admission boundary', async () => {
  const parent = { id: 'parent', session: { id: 'parent' } }
  const events = []
  const gateway = createAgentTeamsSubagentGateway({
    agents: { get: () => parent },
    subagents: { interrupt(id) { events.push(['interrupt', id]) }, async drainChildren(agent, ids) { assert.equal(agent, parent); events.push(['drain', ...ids]) } },
    logger: { warn() {} },
  })
  await gateway.interruptAndDrain(parent, ['child'], async () => { events.push(['fallback']) })
  assert.deepEqual(events, [['interrupt', 'child'], ['drain', 'child']])
})
