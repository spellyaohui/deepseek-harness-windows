import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const wrapperRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const modelsRoot = join(wrapperRoot, 'models-settings-plugin')
const manifest = JSON.parse(readFileSync(join(modelsRoot, 'package.json'), 'utf8'))
const source = readFileSync(join(modelsRoot, 'src/client/ModelListEditor.tsx'), 'utf8')
const remoteSource = readFileSync(join(modelsRoot, 'src/remote.ts'), 'utf8')
const bundle = readFileSync(join(modelsRoot, 'lib/client.js'), 'utf8')

test('Models package keeps one provider-neutral capability probe entry across routes', () => {
  assert.equal(manifest.exports['./remote']?.default, './lib/typert.remote-client.js')
  assert.match(source, /modelCapabilities\.probe/)
  assert.match(source, /applyCapabilityProbeResult/)
  assert.match(source, /capabilityOverwrite/)
  assert.match(remoteSource, /namespace: 'model-capabilities'/)
  assert.match(bundle, /capabilityDraftHint|model-capabilities/)
  assert.doesNotMatch(source, /woyaopro|opencode|commandcode|cpa/i)
})
