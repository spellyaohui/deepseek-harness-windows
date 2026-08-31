import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { normalizeProviderProfile } from '../lib/client/provider-profile.js'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')

test('Alpha.2 editor and custom-provider writes retain the adapter normalization seam', () => {
  const client = read('../src/client/index.ts')
  const section = read('../src/client/ModelsSection.tsx')
  const editor = read('../src/client/ProviderEditor.tsx')
  const custom = read('../src/client/CustomProviderCard.tsx')

  assert.match(client, /settings\.models\/normalize-provider-profile/)
  assert.match(client, /ProviderProfileNormalizer/)
  assert.match(section, /normalizeProviderProfile/)
  assert.match(editor, /normalizeProviderProfile/)
  assert.match(custom, /normalizeProviderProfile/)
})

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
