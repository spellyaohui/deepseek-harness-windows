import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'

// The focused validation test loads the compiled editor module. Its browser CSS
// import is irrelevant in Node, so resolve it to an empty module before import.
// The validation path also does not render its plus icon; stubbing that one
// primitive keeps this unit test independent from the primitives package's
// UI-only dependency closure.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('.css')) {
      return { url: 'data:text/javascript,export default {}', shortCircuit: true }
    }
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
      return {
        url: 'data:text/javascript,export const Checkbox = () => null; export const IconChevronDownOutlineRegular = () => null; export const IconChevronRightOutlineRegular = () => null; export const IconPlusOutlineRegular = () => null; export const IconTrashOutlineRegular = () => null',
        shortCircuit: true,
      }
    }
    return nextResolve(specifier, context)
  },
})

const { validateDeepSeekModels } = await import('../lib/client/DeepSeekModelsEditor.js')

const editor = readFileSync(new URL('../src/client/ModelListEditor.tsx', import.meta.url), 'utf8')
const inputTypes = readFileSync(new URL('../src/client/ModelInputTypes.tsx', import.meta.url), 'utf8')
const locales = readFileSync(new URL('../src/client/locales.ts', import.meta.url), 'utf8')

test('model validation accepts automatic and supported modality lists', () => {
  for (const input of [undefined, [], ['text'], ['image'], ['image', 'text']]) {
    const model = input === undefined ? { id: 'model' } : { id: 'model', input }
    assert.equal(validateDeepSeekModels([model]), undefined)
  }
})

test('model validation rejects malformed modality lists', () => {
  for (const input of [null, 'image', ['audio'], ['text', 1]]) {
    assert.deepEqual(validateDeepSeekModels([{ id: 'model', input }]), {
      index: 0,
      key: 'modelInputInvalid',
    })
  }
})

test('pi-ai model rows expose provider-neutral image controls and bulk actions', () => {
  assert.match(editor, /ModelRow/)
  assert.match(inputTypes, /readImageInputChoice/)
  assert.match(editor, /applyImageInputChoiceToAll\(models, 'image'\)/)
  assert.match(editor, /applyImageInputChoiceToAll\(models, 'text-only'\)/)
  assert.match(inputTypes, /modelInputInvalid/)
  assert.doesNotMatch(editor, /woyaopro|opencode|cpa/i)
  assert.doesNotMatch(inputTypes, /modelImageAuto|automaticInputHint/)
  assert.match(locales, /modelImageInvalid:/)
  assert.match(locales, /modelReasoningLevels/)
})
