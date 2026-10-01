import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_REASONING_EFFORTS, REASONING_LEVELS, readReasoningLevels, toggleReasoningLevel, materializeModelChoices } from '../lib/client/model-reasoning.js'

test('new models offer Default and all six explicit levels without probing', () => {
  assert.deepEqual(REASONING_LEVELS, ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(readReasoningLevels({ id: 'unknown' }), REASONING_LEVELS)
  assert.deepEqual(materializeModelChoices({ id: 'unknown' }), {
    id: 'unknown', input: ['text'], reasoningEfforts: DEFAULT_REASONING_EFFORTS,
  })
  assert.equal(Object.hasOwn(DEFAULT_REASONING_EFFORTS, 'off'), false)
  assert.equal(DEFAULT_REASONING_EFFORTS.max, 'max')
})

test('manual subsets preserve wire mappings and all other fields', () => {
  const model = { id: 'a', input: ['text', 'image'], reasoningEfforts: { high: 'custom-high', max: 'xhigh' }, compat: { supportsStrictMode: false }, maxTokens: 12000 }
  const next = toggleReasoningLevel(model, 'max', false)
  assert.deepEqual(next.reasoningEfforts, { high: 'custom-high' })
  assert.equal(next.compat, model.compat)
  assert.equal(next.input, model.input)
  assert.deepEqual(model.reasoningEfforts, { high: 'custom-high', max: 'xhigh' })
  assert.deepEqual(toggleReasoningLevel(next, 'minimal', true).reasoningEfforts, { minimal: 'minimal', high: 'custom-high' })
})

test('turning every explicit level off produces Default only and can be reversed', () => {
  const model = toggleReasoningLevel({ id: 'a', reasoningEfforts: { high: 'high' } }, 'high', false)
  assert.equal(model.reasoningEfforts, false)
  assert.deepEqual(readReasoningLevels(model), [])
  assert.deepEqual(toggleReasoningLevel(model, 'max', true).reasoningEfforts, { max: 'max' })
})

test('legacy empty input becomes explicit text while malformed declarations survive validation', () => {
  for (const input of [undefined, []]) {
    assert.deepEqual(materializeModelChoices({ id: 'a', input }).input, ['text'])
  }
  for (const reasoningEfforts of [null, {}, { high: null }, { bogus: 'high' }]) {
    assert.equal(readReasoningLevels({ reasoningEfforts }), 'invalid')
    assert.equal(materializeModelChoices({ id: 'a', reasoningEfforts }).reasoningEfforts, reasoningEfforts)
  }
  const input = ['audio']
  assert.equal(materializeModelChoices({ id: 'a', input }).input, input)
})

test('legacy Off is retired without changing the six explicit wire mappings', () => {
  const original = { id: 'legacy', reasoningEfforts: { off: 'none', high: 'custom-high', max: 'xhigh' } }
  assert.deepEqual(materializeModelChoices(original).reasoningEfforts, { high: 'custom-high', max: 'xhigh' })
  assert.equal(original.reasoningEfforts.off, 'none')
})
