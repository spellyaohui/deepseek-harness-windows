import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { compatibilityAnchors, assertCompatibilityAnchors, HARNESS_REVISION } from '../src/compatibility-anchors.js'
import { load } from '../src/win-hide-console-loader.mjs'
const hook = new URL('../src/win-hide-console.mjs', import.meta.url).href
const targets = new Map()
for (const rule of compatibilityAnchors) {
  const dir = fileURLToPath(new URL(`../node_modules/@deepseek-ai/${rule.packageName}/lib`, import.meta.url))
  const files = readdirSync(dir).filter(name => rule.file.test(name))
  assert.equal(files.length, 1, `${rule.id}: one pinned target module`)
  const file = join(dir, files[0])
  targets.set(file, pathToFileURL(file).href)
  const metadata = JSON.parse(readFileSync(join(dir, '..', 'package.json'), 'utf8'))
  assert.equal(metadata.version, rule.version)
  assert.equal(rule.revision, HARNESS_REVISION)
  assert.ok(existsSync(fileURLToPath(new URL(`./${rule.regression}`, import.meta.url))), rule.regression)
}

test('every fixed loader target satisfies its registered count, is idempotent and rejects drift before evaluation', async () => {
  for (const [file, url] of targets) {
    const source = readFileSync(file, 'utf8')
    const result = await load(url, {}, async () => ({ format: 'module', source }))
    assertCompatibilityAnchors(result.source, url, hook)
    const repeated = await load(url, {}, async () => result)
    assert.equal(repeated.source, result.source)
    await assert.rejects(load(url, {}, async () => ({ format: 'module', source: 'export const drift = true' })), /drift/i, file)
  }
})

test('unrelated modules stay unmodified and duplicate critical anchors fail', () => {
  assert.doesNotThrow(() => assertCompatibilityAnchors('export const unrelated = true', 'file:///user/plugin.js', hook))
  assert.throws(() => assertCompatibilityAnchors('return isExplicitPeriodUsageLimitExceeded(detail) || 0;\nreturn isExplicitPeriodUsageLimitExceeded(detail) || 0;',
    'file:///x/node_modules/@deepseek-ai/dsh-llm/lib/index.js', hook), /expected 1, found 2/)
})
