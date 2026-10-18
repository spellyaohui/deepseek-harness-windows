import { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import * as SkillTool from '@deepseek-ai/dsh-tool-skill'
import * as Superpowers from '../../superpowers-plugin/lib/index.js'
import { installDelegationPolicy } from '../../agent-teams-plugin/lib/routing-policy.js'

class OfflineAdapter extends LlmAdapter {
  requests = []
  async resolveModel(provider, id) { return { provider, id, name: id } }
  async listModels(provider) { return [{ provider, id: 'offline', name: 'offline' }] }
  async *stream(options) {
    this.requests.push(options)
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'Offline fixture response' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Offline fixture response' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export async function createSuperpowersHarness({ cwd, policy = 'native-v1', role = 'captain' }) {
  const ctx = new Context()
  try {
    await mountAgentLoopTestDependencies(ctx, { workingDirectory: true })
    await ctx.plugin(SkillRegistry)
    const provider = await ctx.plugin(Superpowers)
    await ctx.plugin(SkillTool)
    const harness = await mountAgentLoopTestHarness(ctx)
    const adapter = new OfflineAdapter()
    ctx.llm.registerAdapter(['offline'], adapter)
    const agent = await harness.create('superpowers-test', { provider: 'offline', model: 'offline' }, { cwd })
    const disposePolicy = installDelegationPolicy({ agent, policy, order: 120,
      text: `AgentTeams delegation policy: ${policy}`, member: role === 'member' })
    const ends = []
    ctx.on('session/event', (_session, event) => { if (event.type === 'turn/end') ends.push(event) })
    return {
      ctx, agent, provider, requests: adapter.requests,
      async turn(text) {
        const before = ends.length
        agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
        const deadline = Date.now() + 5_000
        while (ends.length === before && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
        if (ends.length === before) throw new Error('offline AgentLoop turn did not settle')
        if (ends.at(-1).data.reason?.kind !== 'completed') throw new Error(JSON.stringify(ends.at(-1).data))
        return agent.session.snapshotEvents()
      },
      async dispose() { disposePolicy(); await ctx.fiber.dispose() },
    }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}

export function execute(harness, name, args = {}) {
  return harness.ctx.tools.execute({ callId: `test-${name}`, name, arguments: args,
    agent: harness.agent, signal: new AbortController().signal })
}
