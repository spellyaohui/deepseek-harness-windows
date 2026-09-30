import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

// These focused helpers are in the compiled editor. Rendering is irrelevant
// here, so supply just the primitives its component declarations reference.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('.css')) {
      return { url: 'data:text/javascript,export default {}', shortCircuit: true }
    }
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      return {
        url: 'data:text/javascript,export const Button = () => null; export const Checkbox = () => null; export const IconChevronDownOutlineRegular = () => null; export const IconChevronRightOutlineRegular = () => null; export const IconPlusOutlineRegular = () => null; export const IconTrashOutlineRegular = () => null; export const Modal = () => null',
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
})

const {
  capabilityProbeRequestFor, filterModelCandidates, inputFallbackForModel,
} = await import('../lib/client/ModelListEditor.js')
const { automaticInputHintKey } = await import('../lib/client/ModelInputTypes.js')

test('installed catalog input types override the route default without materializing a draft value', () => {
  const defaults = new Map([
    ['vision-model', ['text', 'image']],
  ])
  assert.deepEqual(inputFallbackForModel(defaults, ['text'], 'vision-model'), ['text', 'image'])
  assert.deepEqual(inputFallbackForModel(defaults, ['text'], 'unknown-model'), ['text'])
  assert.equal(automaticInputHintKey(inputFallbackForModel(defaults, ['text'], 'vision-model')), 'modelImageSupportedHint')
  assert.equal(automaticInputHintKey(inputFallbackForModel(defaults, ['text'], 'unknown-model')), 'modelImageAutoHint')
})

test('candidate search filters ids and display names without changing the selected source rows', () => {
  const rows = [
    { id: 'gpt-vision', name: 'Vision' },
    { id: 'plain-text', name: 'General purpose' },
  ]
  assert.deepEqual(filterModelCandidates(rows, 'vision').map(row => row.id), ['gpt-vision'])
  assert.deepEqual(filterModelCandidates(rows, 'general').map(row => row.id), ['plain-text'])
  assert.equal(filterModelCandidates(rows, 'missing').length, 0)
})

test('capability probe sends a stored credential reference to the Host without replacing a typed key', () => {
  const request = capabilityProbeRequestFor(
    'custom-model', 'openai-completions', 'https://example.invalid/v1',
    { credentialRef: 'providers.custom.apiKey', apiKey: 'one-shot' }, { reasoningEfforts: { low: 'low' } },
  )
  assert.equal(request.credentialRef, 'providers.custom.apiKey')
  assert.equal(request.apiKey, 'one-shot')
  assert.deepEqual(request.candidate, { reasoningEfforts: { low: 'low' } })
})
