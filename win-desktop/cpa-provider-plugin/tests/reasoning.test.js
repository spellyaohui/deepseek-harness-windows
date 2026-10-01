import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeLegacyEffort, reasoningEffortsForModel } from '../lib/reasoning.js'

test('normalizes historical ultra to max', () => {
  assert.equal(normalizeLegacyEffort('ultra'), 'max')
  assert.equal(normalizeLegacyEffort(' HIGH '), 'high')
})

test('offers the complete CPA R vocabulary to unclassified models', () => {
  assert.deepEqual(Object.values(reasoningEffortsForModel('other-model')), [
    'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
  ])
})

test('offers all default levels to gateway model names', () => {
  for (const model of ['gpt-5.6', 'gpt-5.6-sol', 'openai/gpt-5.6-pro']) {
    assert.deepEqual(Object.values(reasoningEffortsForModel(model)), [
      'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
    ])
  }
  assert.equal('minimal' in reasoningEffortsForModel('gpt-5.60'), true)
})
