import assert from 'node:assert/strict'
import test from 'node:test'

import { buildCpaModels, buildCpaProfile, mergeCpaCandidates } from '../lib/profile.js'

test('builds deduplicated CPA models with exact per-model reasoning metadata', () => {
  const models = buildCpaModels([
    { id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol', selected: true, contextWindow: 400000 },
    { id: 'gpt-5.6-sol', name: 'duplicate', selected: true },
    { id: 'other-model', selected: false },
  ])
  assert.deepEqual(models, [{
    id: 'gpt-5.6-sol',
    name: 'GPT 5.6 Sol',
    contextWindow: 400000,
    reasoningEfforts: {
      off: 'none', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
    },
  }])
})

test('requires at least one selected model', () => {
  assert.throws(() => buildCpaModels([{ id: 'unused', selected: false }]), /at least one model/i)
})

test('preserves configured models omitted by a later discovery', () => {
  assert.deepEqual(mergeCpaCandidates(
    [{ id: 'configured-only', name: 'Configured', selected: true }],
    [{ id: 'new-model', name: 'New', selected: true }],
  ), [
    { id: 'new-model', name: 'New', selected: true },
    { id: 'configured-only', name: 'Configured', selected: true },
  ])
})

test('assembles the stable CPA llm-pi-ai route', () => {
  const profile = buildCpaProfile({
    baseURL: 'https://proxy.example.invalid',
    token: 'fixture',
    models: [{ id: 'model-a', selected: true }],
  })
  assert.equal(profile.displayName, 'CPA / CLIProxyAPI')
  assert.equal(profile.apiKeyEnv, 'CPA_API_KEY')
  assert.equal(profile.api, 'openai-responses')
  assert.equal(profile.baseURL, 'https://proxy.example.invalid/v1')
  assert.equal(JSON.stringify(profile).includes('fixture'), false)
})
