import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)
const read = relativePath => readFileSync(new URL(relativePath, root), 'utf8')
const parse = relativePath => JSON.parse(read(relativePath))

test('Alpha.2 client owners do not register or import the removed client runtime', () => {
  const desktop = parse('desktop-settings-plugin/package.json')
  const session = parse('session-markdown-export-plugin/package.json')
  const models = parse('models-settings-plugin/package.json')

  assert.doesNotMatch(JSON.stringify(desktop), /dsh-client-runtime/u)
  assert.doesNotMatch(JSON.stringify(session), /dsh-client-runtime/u)
  assert.equal(session.dsh.client.inject.includes('@deepseek-ai/dsh-client-store'), true)
  assert.equal(session.peerDependencies?.['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.equal(session.peerDependencies?.['@deepseek-ai/dsh-client-store'], '^0.1.2-alpha.2')
  assert.doesNotMatch(read('session-markdown-export-plugin/src/client/controller.ts'), /dsh-client-runtime/u)
  assert.doesNotMatch(read('session-markdown-export-plugin/src/client/HeaderAction.tsx'), /dsh-client-runtime/u)
  assert.doesNotMatch(read('session-markdown-export-plugin/src/client/index.tsx'), /dsh-client-runtime/u)
  assert.doesNotMatch(read('session-markdown-export-plugin/tsdown.config.ts'), /dsh-client-runtime/u)

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
