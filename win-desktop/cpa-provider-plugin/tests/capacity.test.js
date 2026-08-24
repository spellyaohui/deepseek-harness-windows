import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCapacityDrafts,
  capacityDraftsFromModels,
  mergeCapacityDrafts,
} from '../lib/client/capacity.js'

const model = { id: 'gpt-5.6-sol', selected: true }

test('parses raw CPA context and output capacities exactly', () => {
  assert.deepEqual(applyCapacityDrafts([model], new Map([['gpt-5.6-sol', {
    contextWindow: '1050000',
    maxTokens: '128000',
  }]])), {
    ok: true,
    models: [{ ...model, contextWindow: 1050000, maxTokens: 128000 }],
  })
})

test('allows context and output capacity to be blank independently', () => {
  assert.deepEqual(applyCapacityDrafts([model], new Map([['gpt-5.6-sol', {
    contextWindow: '',
    maxTokens: '128000',
  }]])), {
    ok: true,
    models: [{ ...model, maxTokens: 128000 }],
  })
  assert.deepEqual(applyCapacityDrafts([model], new Map([['gpt-5.6-sol', {
    contextWindow: '1050000',
    maxTokens: '',
  }]])), {
    ok: true,
    models: [{ ...model, contextWindow: 1050000 }],
  })
  assert.deepEqual(applyCapacityDrafts([model], new Map([['gpt-5.6-sol', {
    contextWindow: '',
    maxTokens: '',
  }]])), { ok: true, models: [model] })
})

test('rejects non-positive, non-decimal, and unsafe capacity text', () => {
  for (const value of ['0', '-1', '+1', '1.5', '1e6', '1,000', '1 000', ' 1', '1 ', '9007199254740992']) {
    assert.deepEqual(applyCapacityDrafts([model], new Map([['gpt-5.6-sol', {
      contextWindow: value,
      maxTokens: '',
    }]])), { ok: false, modelId: 'gpt-5.6-sol', field: 'contextWindow' })
  }
})

test('creates exact draft text and preserves edits across discovery', () => {
  const drafts = capacityDraftsFromModels([
    { id: 'configured', contextWindow: 1050000, maxTokens: 128000 },
  ])
  assert.deepEqual(drafts.get('configured'), {
    contextWindow: '1050000',
    maxTokens: '128000',
  })

  drafts.set('configured', { contextWindow: '777777', maxTokens: '' })
  const merged = mergeCapacityDrafts(drafts, [
    { id: 'configured' },
    { id: 'new-model', contextWindow: 262144, maxTokens: 32768 },
  ])
  assert.deepEqual(merged.get('configured'), { contextWindow: '777777', maxTokens: '' })
  assert.deepEqual(merged.get('new-model'), { contextWindow: '262144', maxTokens: '32768' })
})
