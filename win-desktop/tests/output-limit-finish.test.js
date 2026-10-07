import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SessionQuery from '@deepseek-ai/dsh-session-query'
import { SessionId } from '@deepseek-ai/dsh-session'
import * as OutputLimitFinish from '../output-limit-finish-plugin/lib/index.js'

const MODEL_LIMIT = 16_000

/** Offline gateway that, like the observed cli2api route, reports every finish as `stop`. */
class StopReportingGateway extends LlmAdapter {
  constructor(outputTokens, finishKind = 'stop', lateUsage = false) {
    super()
    this.outputTokens = outputTokens
    this.finishKind = finishKind
    this.lateUsage = lateUsage
  }
  async resolveModel(provider, model) { return { provider, id: model, name: model, defaultMaxTokens: MODEL_LIMIT } }
  async listModels(provider) { return [{ provider, id: 'gateway-model', name: 'gateway-model' }] }
  async *stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: '推理把额度用完了' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '推理把额度用完了' } }
    if (this.lateUsage) yield { type: 'finish', reason: { kind: this.finishKind } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: this.outputTokens, totalTokens: this.outputTokens + 1 } }
    if (this.lateUsage) return
    yield { type: 'finish', reason: { kind: this.finishKind } }
  }
}

async function runTurn(t, adapter, { mountPlugin = true, maxTokens } = {}) {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-output-limit-finish-'))
  const ctx = new Context()
  t.after(async () => {
    await ctx.fiber.dispose()
    await rm(workspace, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })
  })
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root: join(workspace, 'sessions') })
  await ctx.plugin(SessionQuery)
  await ctx.plugin(AgentLoop, { agents: [] })
  if (mountPlugin) await ctx.plugin(OutputLimitFinish)
  ctx.llm.registerAdapter(['gateway'], adapter)
  const turnEnds = []
  ctx.on('session/event', (_session, event) => {
    if (event.type === 'turn/end') turnEnds.push(event.data.reason?.kind)
  })
  const handle = await ctx.agents.create({
    sessionId: SessionId('output-limit-session'), meta: { cwd: workspace },
    agentOptions: { provider: 'gateway', model: 'gateway-model', ...maxTokens === undefined ? {} : { maxTokens } },
  })
  handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: '开始' }], source: { kind: 'user' } }))
  const deadline = Date.now() + 5_000
  while (turnEnds.length === 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  return turnEnds
}

test('the plugin only declares the official LLM seam it observes', () => {
  assert.equal(OutputLimitFinish.name, 'output-limit-finish')
  assert.deepEqual(OutputLimitFinish.inject, ['llm'])
  assert.equal(OutputLimitFinish.isTruncatedStop({ kind: 'stop' }, MODEL_LIMIT, MODEL_LIMIT), true)
  assert.equal(OutputLimitFinish.isTruncatedStop({ kind: 'stop' }, MODEL_LIMIT - 1, MODEL_LIMIT), false)
  assert.equal(OutputLimitFinish.isTruncatedStop({ kind: 'tool-calls' }, MODEL_LIMIT, MODEL_LIMIT), false)
  assert.equal(OutputLimitFinish.isTruncatedStop({ kind: 'stop' }, MODEL_LIMIT, undefined), false)
})

async function observeChunks(chunks, options = {}, defaultMaxTokens = 10) {
  let listener
  OutputLimitFinish.apply({ on(_name, callback) { listener = callback; return () => {} },
    llm: { async resolveModelInfo() { return { defaultMaxTokens } } } })
  return Array.fromAsync(listener(options, async function* () { yield* chunks }))
}
const usage = outputTokens => ({ type: 'usage', usage: { outputTokens } })
const stop = { type: 'finish', reason: { kind: 'stop' } }

test('late usage, repeated usage and request limits are applied at terminal stream settlement', async () => {
  assert.equal((await observeChunks([stop, usage(10)])).at(-1).reason.kind, 'max-tokens')
  assert.equal((await observeChunks([usage(1), usage(10), { type: 'usage' }, stop])).at(-1).reason.kind, 'max-tokens')
  assert.equal((await observeChunks([usage(10), stop], { maxTokens: 20 })).at(-1).reason.kind, 'stop')
  assert.equal((await observeChunks([usage(6), stop], { maxTokens: 6 })).at(-1).reason.kind, 'max-tokens')
  assert.equal((await observeChunks([stop])).at(-1).reason.kind, 'stop')
  assert.equal((await observeChunks([usage(10), stop], {}, null)).at(-1).reason.kind, 'stop')
  const controller = new AbortController(); controller.abort()
  assert.equal((await observeChunks([usage(10), stop], { signal: controller.signal })).at(-1).reason.kind, 'stop')
  assert.equal((await observeChunks([usage(10), { type: 'finish', reason: { kind: 'cancelled' } }])).at(-1).reason.kind, 'cancelled')
})

test('a stop that consumed the whole adapter default output budget ends the real turn as max-tokens', { timeout: 15_000 }, async t => {
  assert.deepEqual(await runTurn(t, new StopReportingGateway(MODEL_LIMIT)), ['max-tokens'])
})
test('real AgentLoop settles late usage and uses the actual explicit request budget', { timeout: 15_000 }, async t => {
  assert.deepEqual(await runTurn(t, new StopReportingGateway(6, 'stop', true), { maxTokens: 6 }), ['max-tokens'])
  assert.deepEqual(await runTurn(t, new StopReportingGateway(6), { maxTokens: 7 }), ['completed'])
})

test('without the plugin the same gateway response is mistaken for a completed turn', { timeout: 15_000 }, async t => {
  assert.deepEqual(await runTurn(t, new StopReportingGateway(MODEL_LIMIT), { mountPlugin: false }), ['completed'])
})

test('responses below the limit and non-stop finishes keep their reported reason', { timeout: 15_000 }, async t => {
  assert.deepEqual(await runTurn(t, new StopReportingGateway(MODEL_LIMIT - 1)), ['completed'])
})
