import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const source = (path) => readFileSync(new URL(`../src/client/${path}`, import.meta.url), 'utf8')

test('the 0.1.7 editor retains per-model input-types through shared model rows', () => {
  assert.equal(existsSync(new URL('../src/client/ModelInputTypes.tsx', import.meta.url)), true)
  assert.match(source('ModelRow.tsx'), /ModelInputTypes/)
  assert.match(source('ModelListEditor.tsx'), /inputDefaults/)
  assert.match(source('ModelListEditor.tsx'), /inputFallbackForModel/)
  assert.match(source('ModelInputTypes.tsx'), /readImageInputChoice/)
  assert.match(source('DeepSeekModelsEditor.tsx'), /inputField="inputModalities"/)
})

test('the 0.1.7 Models section retains custom API onboarding and account-first ordering', () => {
  const section = source('ModelsSection.tsx')
  assert.match(section, /CustomProviderCard/)
  assert.match(section, /deepseek-account/)
  assert.match(section, /type AddMode = 'catalog' \| 'custom'/)
})
