import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'

// The focused validation test loads the compiled editor module. Its browser CSS
// import is irrelevant in Node, so resolve it to an empty module before import.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier.endsWith('.css')
      ? { url: 'data:text/javascript,export default {}', shortCircuit: true }
      : nextResolve(specifier, context)
  },
})

const { validateDeepSeekModels } = await import('../lib/client/DeepSeekModelsEditor.js')

const editor = readFileSync(new URL('../src/client/ModelListEditor.tsx', import.meta.url), 'utf8')
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
  assert.match(editor, /readImageInputChoice/)
  assert.match(editor, /applyImageInputChoiceToAll\(models, 'image'\)/)
  assert.match(editor, /applyImageInputChoiceToAll\(models, 'auto'\)/)
  assert.match(editor, /aria-invalid/)
  assert.doesNotMatch(editor, /woyaopro|opencode|cpa/i)
  assert.match(locales, /modelImageAutoHint/)
  assert.match(locales, /modelImageInvalid:/)
  assert.match(locales, /无法确认时按仅文本处理/)
})
