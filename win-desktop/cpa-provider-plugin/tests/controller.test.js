import assert from 'node:assert/strict'
import test from 'node:test'

import { createCpaController } from '../lib/client/controller.js'

function ok(value) {
  return { ok: true, value }
}

test('discovers CPA models with the normalized Responses draft and one-shot Token', async () => {
  let payload
  const api = {
    llm: {
      async discoverModels(settingsNs, next) {
        payload = { settingsNs, ...next }
        return ok([{ id: 'gpt-5.6-sol' }, { id: 'model-b', name: 'Model B' }])
      },
    },
    settings: { mutate: async () => ok({}) },
    credentials: { set: async () => ok({}) },
  }
  const controller = createCpaController(api, { timeoutMs: 100 })
  const models = await controller.discover({ baseURL: 'https://proxy.example.invalid', token: 'test-token' })

  assert.deepEqual(payload, {
    settingsNs: 'llm-pi-ai',
    provider: 'cpa',
    api: 'openai-responses',
    baseURL: 'https://proxy.example.invalid/v1',
    apiKey: 'test-token',
  })
  assert.deepEqual(models, [
    { id: 'gpt-5.6-sol', name: 'gpt-5.6-sol', selected: true },
    { id: 'model-b', name: 'Model B', selected: true },
  ])
})

test('saves the redacted profile before the Token', async () => {
  const calls = []
  const api = {
    llm: { discoverModels: async () => ok({ models: [] }) },
    settings: {
      async mutate(ns, ops, expectedRevision) {
        calls.push({ kind: 'settings', payload: { ns, ops, expectedRevision } })
        return ok({ revision: 8 })
      },
    },
    credentials: {
      async set(ref, value) {
        calls.push({ kind: 'credential', payload: { ref, value } })
        return ok({})
      },
    },
  }
  const controller = createCpaController(api)
  const stages = []
  const result = await controller.save({
    baseURL: 'https://proxy.example.invalid',
    token: 'test-token',
    models: [{ id: 'model-a', selected: true }],
  }, 7, stage => { stages.push(stage) })

  assert.deepEqual(calls.map(call => call.kind), ['settings', 'credential'])
  assert.deepEqual(stages, ['profile', 'credential'])
  assert.equal(JSON.stringify(calls[0].payload).includes('test-token'), false)
  assert.deepEqual(calls[1].payload, { ref: 'CPA_API_KEY', value: 'test-token' })
  assert.deepEqual(result, { ok: true })
})

test('retries only credential storage after the profile has committed', async () => {
  let settingsCalls = 0
  let credentialCalls = 0
  const api = {
    llm: { discoverModels: async () => ok({ models: [] }) },
    settings: {
      async mutate() {
        settingsCalls += 1
        return ok({ revision: 8 })
      },
    },
    credentials: {
      async set() {
        credentialCalls += 1
        return credentialCalls === 1
          ? { ok: false, error: { code: 'credentials/unavailable', message: 'credential unavailable' } }
          : ok({})
      },
    },
  }
  const controller = createCpaController(api)
  const draft = {
    baseURL: 'https://proxy.example.invalid',
    token: 'test-token',
    models: [{ id: 'model-a', selected: true }],
  }

  assert.deepEqual(await controller.save(draft, 7), {
    ok: false, stage: 'credential', message: 'credential unavailable',
  })
  assert.deepEqual(await controller.save(draft, 7), { ok: true })
  assert.equal(settingsCalls, 1)
  assert.equal(credentialCalls, 2)
})
