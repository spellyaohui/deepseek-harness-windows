import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { LOCAL_PLUGIN_ARTIFACTS, synchronizeLocalPluginArtifacts } from '../scripts/sync-local-plugin-artifacts.mjs'

const testRoot = mkdtempSync(join(tmpdir(), 'dsh-local-plugin-artifacts-'))

test('AgentTeams release identity remains tied to the synchronized local artifact', () => {
  assert.deepEqual(
    LOCAL_PLUGIN_ARTIFACTS.find(([sourceName]) => sourceName === 'agent-teams-plugin'),
    ['agent-teams-plugin', '@nanmicoder/dsh-agent-teams'],
  )
  const packageJson = JSON.parse(readFileSync(new URL('../agent-teams-plugin/package.json', import.meta.url), 'utf8'))
  assert.equal(packageJson.version, '0.1.14-desktop.8')
})

after(() => rmSync(testRoot, { recursive: true, force: true }))

test('synchronizes built lib and package metadata into the installed file dependency', () => {
  const sourceLib = join(testRoot, 'example-plugin', 'lib')
  const sourceManifest = join(testRoot, 'example-plugin', 'package.json')
  const installedLib = join(testRoot, 'node_modules', '@example', 'plugin', 'lib')
  const installedManifest = join(testRoot, 'node_modules', '@example', 'plugin', 'package.json')
  mkdirSync(sourceLib, { recursive: true })
  mkdirSync(installedLib, { recursive: true })
  writeFileSync(join(sourceLib, 'index.js'), 'export const current = true\n')
  writeFileSync(sourceManifest, '{"name":"@example/plugin","version":"2.0.0"}\n')
  writeFileSync(join(installedLib, 'stale.js'), 'export const stale = true\n')
  writeFileSync(installedManifest, '{"name":"@example/plugin","version":"1.0.0"}\n')

  const synchronized = synchronizeLocalPluginArtifacts({
    root: testRoot,
    artifacts: [['example-plugin', '@example/plugin']],
  })

  assert.deepEqual(synchronized, [{ sourceName: 'example-plugin', packageName: '@example/plugin' }])
  assert.equal(readFileSync(join(installedLib, 'index.js'), 'utf8'), 'export const current = true\n')
  assert.equal(existsSync(join(installedLib, 'stale.js')), false)
  assert.deepEqual(JSON.parse(readFileSync(installedManifest, 'utf8')), {
    name: '@example/plugin',
    version: '2.0.0',
  })
})
