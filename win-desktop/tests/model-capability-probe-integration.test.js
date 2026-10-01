import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { materializeModelChoices, toggleReasoningLevel } from '../models-settings-plugin/lib/client/model-reasoning.js'
import { apply as mountPiAi } from '@deepseek-ai/dsh-llm-pi-ai'
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8')
test('manual model declarations reach the official Harness catalog with exact supported levels', async () => {
  let row = materializeModelChoices({ id: 'manual', maxTokens: 12000 })
  row = toggleReasoningLevel(row, 'minimal', false)
  row = toggleReasoningLevel(row, 'max', false)
  let adapter
  mountPiAi({
    fiber: { entry: { options: { id: 'llm-pi-ai' } } }, inject() {}, on() {}, get() {},
    logger: { warn() {}, error() {} },
    llm: { registerConfigurableProviders: () => ({ replace() {} }), registerModelDiscovery() {}, registerAdapter: (_routes, value) => { adapter = value; return { replace() {} } } },
  }, { providers: { get: () => ({ 'fixture-manual': { api: 'openai-responses', baseURL: 'https://example.invalid/v1', models: [row], defaultInput: ['text', 'image'] } }) } })
  const result = await adapter.resolveModel('fixture-manual', 'manual')
  assert.deepEqual(result.inputModalities, ['text'])
  assert.deepEqual(result.reasoning.efforts.map(level => level.id), ['low', 'medium', 'high', 'xhigh'])
  assert.equal(result.reasoning.defaultEffort, undefined)
  assert.equal(result.defaultMaxTokens, 12000)
  const defaultProfile = adapter.config.profiles().get('fixture-manual')
  assert.equal(defaultProfile.reasoning, undefined)
})
test('Models UI and Host expose manual choices without any capability RPC', () => {
  const manifest = JSON.parse(read('models-settings-plugin/package.json'))
  assert.equal(manifest.exports['./remote'], undefined)
  for (const path of ['models-settings-plugin/src/client/ModelListEditor.tsx','models-settings-plugin/src/client/index.ts','models-settings-plugin/src/index.ts','models-settings-plugin/lib/client.js']) {
    assert.doesNotMatch(read(path), /modelCapabilities|model-capabilities|capabilityProbe|ModelCapabilityProbeService/)
  }
  assert.match(read('models-settings-plugin/lib/client.js'), /modelReasoningLevels/)
})
