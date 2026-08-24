import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeProviderProfile } from '../lib/client/provider-profile.js'

test('provider normalization composes the registered transformer', () => {
  const normalized = normalizeProviderProfile(
    'cpa',
    { models: [{ id: 'gpt-5.6-sol' }] },
    (_provider, value) => ({
      ok: true,
      value: { ...value, api: 'openai-responses' },
    }),
  )

  assert.equal(normalized.ok, true)
  assert.equal(normalized.value.api, 'openai-responses')
})

test('provider normalization keeps the original draft without a transformer', () => {
  const draft = { baseURL: 'https://proxy.example/v1' }
  const normalized = normalizeProviderProfile('cpa', draft)

  assert.deepEqual(normalized, { ok: true, value: draft })
})
