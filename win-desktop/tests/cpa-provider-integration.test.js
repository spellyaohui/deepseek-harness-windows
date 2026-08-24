import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const patch = readFileSync(new URL('../config/agent-teams.patch.yml', import.meta.url), 'utf8')
const service = readFileSync(new URL('../src/dsh-service.js', import.meta.url), 'utf8')
const modelsBundle = readFileSync(new URL('../models-settings-plugin/lib/client.js', import.meta.url), 'utf8')
const require = createRequire(import.meta.url)

function packageRoot(name) {
  return dirname(require.resolve(`${name}/package.json`))
}

const cpaPackageRoot = packageRoot('@deepseek-ai/dsh-cpa-provider')
const cpaBundle = readFileSync(join(cpaPackageRoot, 'lib/client.js'), 'utf8')
const cpaPackage = JSON.parse(readFileSync(join(cpaPackageRoot, 'package.json'), 'utf8'))
const sourceCpaPackage = JSON.parse(readFileSync(new URL('../cpa-provider-plugin/package.json', import.meta.url), 'utf8'))

test('wrapper installs the local Models fork and CPA plugin', () => {
  assert.equal(
    packageJson.dependencies['@deepseek-ai/dsh-client-ui-settings-models'],
    'file:models-settings-plugin',
  )
  assert.equal(packageJson.dependencies['@deepseek-ai/dsh-cpa-provider'], 'file:cpa-provider-plugin')
  assert.equal(
    lockfile.packages['node_modules/@deepseek-ai/dsh-cpa-provider']?.resolved,
    'file:cpa-provider-plugin',
  )
  assert.equal(sourceCpaPackage.version, '0.1.1')
  assert.equal(cpaPackage.version, '0.1.1')
  assert.equal(lockfile.packages['node_modules/@deepseek-ai/dsh-cpa-provider']?.version, '0.1.1')
})

test('static and generated desktop patches both mount CPA', () => {
  assert.match(patch, /id: cpa-provider[\s\S]*@deepseek-ai\/dsh-cpa-provider/)
  assert.match(service, /id: cpa-provider/)
  assert.match(service, /@deepseek-ai\/dsh-cpa-provider/)
})

test('built browser packages expose and consume the Models card slot', () => {
  assert.match(modelsBundle, /settings\.models\.card/)
  assert.match(cpaBundle, /name:\s*["']settings\.models\.card["']/)
  assert.match(cpaBundle, /id:\s*["']cpa["']/)
  assert.match(cpaBundle, /contextWindow/)
  assert.match(cpaBundle, /maxTokens/)
  assert.match(cpaBundle, /inputMode:\s*["']numeric["']/)
})

test('desktop composition contains no credential value', () => {
  assert.doesNotMatch(patch, /Authorization:\s*Bearer/i)
  assert.doesNotMatch(service, /Authorization:\s*Bearer/i)
})
