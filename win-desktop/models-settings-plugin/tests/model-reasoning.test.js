import assert from 'node:assert/strict'
import test from 'node:test'
import { registerHooks } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { materializeModelInput } from '../lib/client/model-input.js'

registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true }
  if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return { url: 'data:text/javascript,export let switchProps; export const Switch = props => { switchProps = props; return null }; export const Tooltip = () => null; export const Checkbox = () => null; export const IconPlusOutlineRegular = () => null; export const IconTrashOutlineRegular = () => null; export const IconChevronDownOutlineRegular = () => null; export const IconChevronRightOutlineRegular = () => null', shortCircuit: true }
  return next(specifier, context)
} })
const { validateReasoningEfforts, ModelReasoningEfforts } = await import('../lib/client/ModelReasoningEfforts.js')
const primitives = await import('@deepseek-ai/dsh-client-ui-primitives')

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

test('the upstream reasoning switch stores false only after explicit disable and preserves untouched absence', () => {
  let changed
  const original = { id: 'inherited', marker: 'preserved' }
  const render = model => renderToStaticMarkup(createElement(ModelReasoningEfforts, {
    model, levels: ['off', 'low', 'high'], position: 1, disabled: false,
    t: key => key, onChange: next => { changed = next },
  }))
  render(original)
  assert.equal(changed, undefined, 'displaying inherited absence must not create a declaration')
  assert.equal(primitives.switchProps.checked, false)
  primitives.switchProps.onChange(true)
  assert.equal(typeof changed.reasoningEfforts, 'object')
  render(changed)
  assert.equal(primitives.switchProps.checked, true)
  primitives.switchProps.onChange(false)
  assert.deepEqual(changed, { ...original, reasoningEfforts: false })
  assert.deepEqual(original, { id: 'inherited', marker: 'preserved' })
  assert.equal(validateReasoningEfforts([changed]), undefined)
})
