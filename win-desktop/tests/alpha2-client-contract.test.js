import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = relativePath => readFileSync(new URL(relativePath, root), 'utf8')
const parse = relativePath => JSON.parse(read(relativePath))

test('Alpha.2 client owners do not register or import the removed client runtime', () => {
  const desktop = parse('desktop-settings-plugin/package.json')
  const models = parse('models-settings-plugin/package.json')

  assert.doesNotMatch(JSON.stringify(desktop), /dsh-client-runtime/u)

  assert.doesNotMatch(JSON.stringify(models), /dsh-client-runtime/u)
  for (const relativePath of [
    'models-settings-plugin/src/client/DeepSeekOnboardingDialog.tsx',
    'models-settings-plugin/src/client/WelcomeNotice.tsx',
    'models-settings-plugin/src/client/welcome-store.ts',
    'models-settings-plugin/tsdown.config.ts',
  ]) {
    assert.doesNotMatch(read(relativePath), /dsh-client-runtime/u)
  }
})
