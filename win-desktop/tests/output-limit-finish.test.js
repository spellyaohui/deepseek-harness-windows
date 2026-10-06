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
  constructor(outputTokens, finishKind = 'stop') {
    super()
    this.outputTokens = outputTokens
    this.finishKind = finishKind
  }
  async resolveModel(provider, model) { return { provider, id: model, name: model, defaultMaxTokens: MODEL_LIMIT } }
  async listModels(provider) { return [{ provider, id: 'gateway-model', name: 'gateway-model' }] }
  async *stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: '推理把额度用完了' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: '推理把额度用完了' } }
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: this.outputTokens, totalTokens: this.outputTokens + 1 } }
    yield { type: 'finish', reason: { kind: this.finishKind } }
  }
}

async function runTurn(t, adapter, { mountPlugin = true } = {}) {
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
    agentOptions: { provider: 'gateway', model: 'gateway-model' },
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

test('a stop that consumed the whole adapter default output budget ends the real turn as max-tokens', { timeout: 15_000 }, async t => {
  assert.deepEqual(await runTurn(t, new StopReportingGateway(MODEL_LIMIT)), ['max-tokens'])
})

test('without the plugin the same gateway response is mistaken for a completed turn', { timeout: 15_000 }, async t => {
  assert.deepEqual(await runTurn(t, new StopReportingGateway(MODEL_LIMIT), { mountPlugin: false }), ['completed'])
})

test('responses below the limit and non-stop finishes keep their reported reason', { timeout: 15_000 }, async t => {
  assert.deepEqual(await runTurn(t, new StopReportingGateway(MODEL_LIMIT - 1)), ['completed'])
})
