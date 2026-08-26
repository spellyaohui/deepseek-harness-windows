import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { synchronizeLocalPluginArtifacts } from '../scripts/sync-local-plugin-artifacts.mjs'

const testRoot = mkdtempSync(join(tmpdir(), 'dsh-local-plugin-artifacts-'))

after(() => rmSync(testRoot, { recursive: true, force: true }))

test('synchronizes a built local plugin lib directory into its installed file dependency', () => {
  const sourceLib = join(testRoot, 'example-plugin', 'lib')
  const installedLib = join(testRoot, 'node_modules', '@example', 'plugin', 'lib')
  mkdirSync(sourceLib, { recursive: true })
  mkdirSync(installedLib, { recursive: true })
  writeFileSync(join(sourceLib, 'index.js'), 'export const current = true\n')
  writeFileSync(join(installedLib, 'stale.js'), 'export const stale = true\n')

  const synchronized = synchronizeLocalPluginArtifacts({
    root: testRoot,
    artifacts: [['example-plugin', '@example/plugin']],
  })

  assert.deepEqual(synchronized, [{ sourceName: 'example-plugin', packageName: '@example/plugin' }])
  assert.equal(readFileSync(join(installedLib, 'index.js'), 'utf8'), 'export const current = true\n')
  assert.equal(existsSync(join(installedLib, 'stale.js')), false)
})
