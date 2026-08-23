import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
const patch = readFileSync(new URL('../config/agent-teams.patch.yml', import.meta.url), 'utf8')
const service = readFileSync(new URL('../src/dsh-service.js', import.meta.url), 'utf8')
const modelsBundle = readFileSync(new URL('../models-settings-plugin/lib/client.js', import.meta.url), 'utf8')
const cpaBundle = readFileSync(new URL('../cpa-provider-plugin/lib/client.js', import.meta.url), 'utf8')

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
})

test('desktop composition contains no credential value', () => {
  assert.doesNotMatch(patch, /Authorization:\s*Bearer/i)
  assert.doesNotMatch(service, /Authorization:\s*Bearer/i)
})
