import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyImageInputChoice,
  applyImageInputChoiceToAll,
  readImageInputChoice,
} from '../lib/client/model-input.js'

test('missing and empty input use automatic resolution', () => {
  assert.equal(readImageInputChoice({ id: 'unset' }), 'auto')
  assert.equal(readImageInputChoice({ id: 'empty', input: [] }), 'auto')
})

test('valid explicit input lists map to image or text-only', () => {
  assert.equal(readImageInputChoice({ input: ['text', 'image'] }), 'image')
  assert.equal(readImageInputChoice({ input: ['image', 'text'] }), 'image')
  assert.equal(readImageInputChoice({ input: ['text'] }), 'text-only')
})

test('invalid input is reported instead of normalized', () => {
  for (const input of [null, 'image', ['audio'], ['text', 1]]) {
    assert.equal(readImageInputChoice({ input }), 'invalid')
  }
})

test('one-model edits preserve unknown fields and do not mutate the source', () => {
  const original = { id: 'vision', api: 'openai-responses', compat: { strict: false }, input: ['image', 'text'] }
  const changed = applyImageInputChoice(original, 'text-only')
  assert.deepEqual(changed, { ...original, input: ['text'] })
  assert.deepEqual(original.input, ['image', 'text'])
  assert.notEqual(changed, original)
})

test('automatic mode deletes only the model-level override', () => {
  assert.deepEqual(
    applyImageInputChoice({ id: 'known', input: ['text'], maxTokens: 8192 }, 'auto'),
    { id: 'known', maxTokens: 8192 },
  )
})

test('bulk operations affect every supplied row and preserve other fields', () => {
  const models = [{ id: 'a', marker: 1 }, { id: 'b', input: ['text'], marker: 2 }]
  assert.deepEqual(applyImageInputChoiceToAll(models, 'image'), [
    { id: 'a', marker: 1, input: ['text', 'image'] },
    { id: 'b', marker: 2, input: ['text', 'image'] },
  ])
  assert.deepEqual(applyImageInputChoiceToAll(models, 'auto'), [
    { id: 'a', marker: 1 },
    { id: 'b', marker: 2 },
  ])
})
