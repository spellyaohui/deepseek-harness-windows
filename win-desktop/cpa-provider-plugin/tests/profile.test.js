import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildCpaModels,
  buildCpaProfile,
  mergeCpaCandidates,
  normalizeCpaProviderProfile,
} from '../lib/profile.js'

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
    input: ['text', 'image'],
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

test('preserves configured capacities when discovery omits them', () => {
  assert.deepEqual(mergeCpaCandidates(
    [{ id: 'same', name: 'Configured', contextWindow: 1050000, maxTokens: 128000, selected: true }],
    [{ id: 'same', name: 'Fresh name', selected: true }],
  ), [{
    id: 'same',
    name: 'Fresh name',
    contextWindow: 1050000,
    maxTokens: 128000,
    selected: true,
  }])
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
  assert.deepEqual(profile.defaultInput, ['text', 'image'])
  assert.deepEqual(profile.models[0].input, ['text', 'image'])
  assert.equal(JSON.stringify(profile).includes('fixture'), false)
})

test('normalizes native CPA edits without scaling capacities or leaking the Token', () => {
  const profile = normalizeCpaProviderProfile({
    baseURL: 'https://proxy.example.invalid',
    api: 'openai-completions',
    apiKeyEnv: 'WRONG_KEY',
    models: [{ id: ' gpt-5.6-sol ', contextWindow: 1050000, maxTokens: 131072 }],
  })

  assert.equal(profile.baseURL, 'https://proxy.example.invalid/v1')
  assert.equal(profile.api, 'openai-responses')
  assert.equal(profile.apiKeyEnv, 'CPA_API_KEY')
  assert.equal(profile.models[0].id, 'gpt-5.6-sol')
  assert.equal(profile.models[0].contextWindow, 1050000)
  assert.equal(profile.models[0].maxTokens, 131072)
  assert.deepEqual(profile.defaultInput, ['text', 'image'])
  assert.deepEqual(profile.models[0].input, ['text', 'image'])
  assert.deepEqual(Object.values(profile.models[0].reasoningEfforts), [
    'none', 'low', 'medium', 'high', 'xhigh', 'max',
  ])
})

test('preserves an explicit native modality override while defaulting CPA models to vision', () => {
  const profile = normalizeCpaProviderProfile({
    baseURL: 'https://proxy.example.invalid/v1',
    defaultInput: ['text'],
    models: [
      { id: 'vision-model', input: ['text', 'image'] },
      { id: 'text-only-model', input: ['text'] },
      { id: 'default-vision-model' },
    ],
  })

  assert.deepEqual(profile.defaultInput, ['text', 'image'])
  assert.deepEqual(profile.models.map(model => model.input), [
    ['text', 'image'],
    ['text'],
    ['text', 'image'],
  ])
})
