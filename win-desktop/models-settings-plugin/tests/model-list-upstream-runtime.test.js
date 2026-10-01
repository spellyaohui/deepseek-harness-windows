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
  filterModelCandidates,
} = await import('../lib/client/ModelListEditor.js')
test('candidate search filters ids and display names without changing the selected source rows', () => {
  const rows = [
    { id: 'gpt-vision', name: 'Vision' },
    { id: 'plain-text', name: 'General purpose' },
  ]
  assert.deepEqual(filterModelCandidates(rows, 'vision').map(row => row.id), ['gpt-vision'])
  assert.deepEqual(filterModelCandidates(rows, 'general').map(row => row.id), ['plain-text'])
  assert.equal(filterModelCandidates(rows, 'missing').length, 0)
})
