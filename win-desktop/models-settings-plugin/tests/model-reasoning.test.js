import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'
import { materializeModelInput } from '../lib/client/model-input.js'

registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true }
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { url: 'data:text/javascript,export const Switch = () => null; export const Tooltip = () => null; export const Checkbox = () => null; export const IconPlusOutlineRegular = () => null; export const IconTrashOutlineRegular = () => null; export const IconChevronDownOutlineRegular = () => null; export const IconChevronRightOutlineRegular = () => null', shortCircuit: true }
  return next(specifier, context)
} })
const { validateReasoningEfforts } = await import('../lib/client/ModelReasoningEfforts.js')

test('new models retain upstream reasoning defaults while input defaults to text', () => {
  assert.deepEqual(materializeModelInput({ id: 'new' }), { id: 'new', input: ['text'] })
  assert.equal(validateReasoningEfforts([{ id: 'new' }]), undefined)
})

test('manual subsets, Off and false survive unrelated input defaults without changing wire values', () => {
  for (const reasoningEfforts of [false, { high: 'custom-high', max: 'xhigh' }, { off: null, high: 'xhigh' }, { off: 'none', low: 'low' }]) {
    const model = { id: 'a', reasoningEfforts, maxTokens: 12000, compat: { supportsStrictMode: false } }
    const next = materializeModelInput(model)
    assert.equal(next.reasoningEfforts, reasoningEfforts)
    assert.equal(next.compat, model.compat)
    assert.equal(next.maxTokens, 12000)
    assert.equal(validateReasoningEfforts([next]), undefined)
    assert.equal(Object.hasOwn(model, 'input'), false)
  }
})

test('upstream reasoning validation rejects empty declarations and malformed wire mappings', () => {
  for (const reasoningEfforts of [null, {}, { off: null }, { high: null }, { high: '' }]) {
    const model = { id: 'bad', reasoningEfforts }
    assert.ok(validateReasoningEfforts([model]))
    assert.equal(materializeModelInput(model).reasoningEfforts, reasoningEfforts)
  }
})

test('missing and empty input become text while invalid input remains available for rejection', () => {
  for (const input of [undefined, []]) assert.deepEqual(materializeModelInput({ id: 'a', input }).input, ['text'])
  const input = ['audio']
  assert.equal(materializeModelInput({ id: 'a', input }).input, input)
})
