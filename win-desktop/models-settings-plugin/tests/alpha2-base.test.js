import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8')

test('Models fork uses the Alpha.2 operations and child-slot base without the removed client runtime', () => {
  const packageJson = JSON.parse(read('../package.json'))
  const client = read('../src/client/index.ts')
  const section = read('../src/client/ModelsSection.tsx')
  const operations = read('../src/client/operations.ts')
  const store = read('../src/client/store.ts')
  const slots = read('../src/client/slot-contract.ts')

  assert.equal(packageJson.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime'), false)
  assert.equal(packageJson.peerDependencies?.['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.match(section, /ModelsOperations/)
  assert.match(operations, /expectedRevision/)
  assert.match(operations, /interface ModelsRemoteContext/)
  assert.doesNotMatch(operations, /Context as ClientContext/)
  assert.doesNotMatch(store, /Context as ClientContext/)
  assert.match(client, /as unknown as ModelsRemoteContext/)
  assert.match(slots, /settings\.models\.provider-card/)
  assert.match(slots, /settings\.models\.footer/)
})
