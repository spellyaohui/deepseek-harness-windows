/** Exercise real production message producers under the pre-v3 source contract.
 * Only the exported format version is substituted; every lifecycle tool runs,
 * and every captured message is decoded by the installed released-v2 catalog. */
import assert from 'node:assert/strict'
import { registerHooks, createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const sessionUrl = import.meta.resolve('@deepseek-ai/dsh-session')
const llmUrl = import.meta.resolve('@deepseek-ai/dsh-llm')
const wrapped = source => `data:text/javascript,${encodeURIComponent(source)}`
const messages = globalThis[Symbol.for('agent-teams.legacy-source-fixture')] = []
const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@deepseek-ai/dsh-session' && context.parentURL?.endsWith('/lib/harness-compat.js')) {
    return { shortCircuit: true, url: wrapped(`export * from ${JSON.stringify(sessionUrl)}; export const SESSION_FORMAT_VERSION = 2;`) }
  }
  if (specifier === '@deepseek-ai/dsh-llm' && /\/lib\/(tools|members)\.js$/.test(context.parentURL ?? '')) {
    return { shortCircuit: true, url: wrapped(`export * from ${JSON.stringify(llmUrl)};
      import { createUserMessage as original } from ${JSON.stringify(llmUrl)};
      export function createUserMessage(input) {
        globalThis[Symbol.for('agent-teams.legacy-source-fixture')].push(input);
        return original(input);
      }`) }
  }
  return next(specifier, context)
} })
try {
  await import('./lifecycle-verify.mjs')
  const texts = messages.map(message => message.content.map(block => block.text ?? '').join(''))
  for (const phrase of ['AgentTeams message from member', 'AgentTeams approval committed', 'approved the staged AgentTeams plan', 'Return to chat and revise', 'discarded the staged AgentTeams plan']) {
    assert.ok(texts.some(text => text.toLowerCase().includes(phrase.toLowerCase())), `production point not exercised: ${phrase}`)
  }
  const require = createRequire(import.meta.url)
  const nested = createRequire(join(dirname(require.resolve('@deepseek-ai/dsh-session/package.json')), 'package.json'))
  const { releasedV2SessionFormatCodec: codec } = await import(pathToFileURL(nested.resolve('@deepseek-ai/dsh-session-format-v1-to-v2')).href)
  const { createSessionFormatCatalogWithChildren } = await import(pathToFileURL(nested.resolve('@deepseek-ai/dsh-session-format-catalog')).href)
  for (const [index, message] of messages.entries()) {
    assert.deepEqual(message.source, { kind: 'plugin', plugin: '@nanmicoder/dsh-agent-teams' }, `production message ${index}: ${texts[index].slice(0, 100)}`)
    const restore = createSessionFormatCatalogWithChildren([]).createRestore(codec.encodeHeader({ version: 2, id: `legacy-producer-${index}`, createdAt: 1, isSeeded: false, delegationDepth: 0 }, 0), { recovery: 'strict', validation: 'current' })
    const rows = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } },
      { type: 'step/start', seq: 1, time: 2, data: { turn: 1, step: 1 } },
      { type: 'user/message', seq: 2, time: 3, data: { id: `m${index}`, role: 'user', ...message }, surfaceOp: 'append' },
      { type: 'step/end', seq: 3, time: 4, data: { turn: 1, step: 1 } },
      { type: 'turn/end', seq: 4, time: 5, data: { turn: 1, reason: { kind: 'completed' } } },
    ]
    for (const row of rows) restore.decodeRow(codec.encodeEvent(row))
    assert.equal(restore.finish().events.find(event => event.type === 'user/message').data.source.kind, 'plugin:@nanmicoder/dsh-agent-teams')
  }
  console.log(`legacy production sources: ${messages.length} messages passed released-v2 to current migration; all five producers and lifecycle halt/resume exercised`)
} finally {
  hooks.deregister()
  delete globalThis[Symbol.for('agent-teams.legacy-source-fixture')]
}
