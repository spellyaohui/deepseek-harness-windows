import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { LOCAL_PLUGIN_ARTIFACTS, synchronizeLocalPluginArtifacts } from '../scripts/sync-local-plugin-artifacts.mjs'
import { applyCapabilityPatch as applyInstalledCapabilityPatch } from '../node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client/model-capabilities.js'
import { probeModelCapabilities as probeInstalledModelCapabilities } from '../node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/capability-probe-service.js'

const testRoot = mkdtempSync(join(tmpdir(), 'dsh-local-plugin-artifacts-'))

test('AgentTeams release identity remains tied to the synchronized local artifact', () => {
  assert.deepEqual(
    LOCAL_PLUGIN_ARTIFACTS.find(([sourceName]) => sourceName === 'agent-teams-plugin'),
    ['agent-teams-plugin', '@nanmicoder/dsh-agent-teams'],
  )
  const packageJson = JSON.parse(readFileSync(new URL('../agent-teams-plugin/package.json', import.meta.url), 'utf8'))
  assert.equal(packageJson.version, '0.1.15-desktop.7')
})

test('AgentTeams declares the Connection dependency used by its authenticated Web routes', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../agent-teams-plugin/package.json', import.meta.url), 'utf8'))
  assert.equal(packageJson.peerDependencies?.['@deepseek-ai/dsh-client-connection'], '^0.1.2-rc.1')
  assert.equal(
    packageJson.devDependencies?.['@deepseek-ai/dsh-client-connection'],
    'file:../../upstream/dsh-v0.1.2-rc.1/tarballs/dsh/deepseek-ai-dsh-client-connection-0.1.2-rc.1.tgz',
  )
})

test('tool guidance is synchronized as a wrapper-owned local artifact', () => {
  assert.deepEqual(
    LOCAL_PLUGIN_ARTIFACTS.find(([sourceName]) => sourceName === 'tool-call-guidance-plugin'),
    ['tool-call-guidance-plugin', '@deepseek-ai/dsh-tool-call-guidance'],
  )
  const sourcePackage = JSON.parse(readFileSync(
    new URL('../tool-call-guidance-plugin/package.json', import.meta.url),
    'utf8',
  ))
  assert.equal(sourcePackage.version, '0.1.0')
})

test('Models release identity and image editor artifact stay synchronized', () => {
  assert.deepEqual(
    LOCAL_PLUGIN_ARTIFACTS.find(([sourceName]) => sourceName === 'models-settings-plugin'),
    ['models-settings-plugin', '@deepseek-ai/dsh-client-ui-settings-models'],
  )
  const sourcePackage = JSON.parse(readFileSync(new URL('../models-settings-plugin/package.json', import.meta.url), 'utf8'))
  const installedPackage = JSON.parse(readFileSync(
    new URL('../node_modules/@deepseek-ai/dsh-client-ui-settings-models/package.json', import.meta.url),
    'utf8',
  ))
  const lockfile = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
  const installedBundle = readFileSync(
    new URL('../node_modules/@deepseek-ai/dsh-client-ui-settings-models/lib/client.js', import.meta.url),
    'utf8',
  )

  assert.equal(installedPackage.version, sourcePackage.version)
  assert.equal(
    lockfile.packages['node_modules/@deepseek-ai/dsh-client-ui-settings-models']?.version,
    sourcePackage.version,
  )
  assert.match(installedBundle, /modelImageAuto/)
  assert.match(installedBundle, /modelImageTextOnly/)

  for (const relativePath of [
    'lib/client.js',
    'lib/client/model-capabilities.js',
    'lib/capability-probe-service.js',
  ]) {
    assert.equal(
      readFileSync(new URL(`../models-settings-plugin/${relativePath}`, import.meta.url), 'utf8'),
      readFileSync(new URL(`../node_modules/@deepseek-ai/dsh-client-ui-settings-models/${relativePath}`, import.meta.url), 'utf8'),
      `installed Models artifact drifted from ${relativePath}`,
    )
  }
})

function probeResponse(status, body = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    async json() { return body },
    async text() { return JSON.stringify(body) },
    body: null,
  }
}

function probeRequestBody(init) {
  return JSON.parse(init.body)
}

test('the installed Models artifact keeps manual image mode authoritative and uses a gateway-safe probe image', async () => {
  assert.deepEqual(
    applyInstalledCapabilityPatch(
      { id: 'automatic', input: [] },
      { input: ['text', 'image'] },
      { overwriteExisting: false, source: 'probe' },
    ),
    { id: 'automatic', input: ['text', 'image'] },
  )
  assert.deepEqual(
    applyInstalledCapabilityPatch(
      { id: 'manual-image', input: ['text', 'image'] },
      { input: ['text'] },
      { overwriteExisting: false, source: 'probe' },
    ),
    { id: 'manual-image', input: ['text', 'image'] },
  )

  const result = await probeInstalledModelCapabilities({
    modelId: 'installed-artifact-image-probe',
    protocol: 'openai-completions',
    baseURL: 'https://provider.example/v1',
  }, {
    fetch: async (_url, init) => {
      const body = probeRequestBody(init)
      const imageURL = body.messages?.[0]?.content
        ?.find(block => block.type === 'image_url')?.image_url?.url
      if (typeof imageURL === 'string') {
        const bytes = Buffer.from(imageURL.split(',', 2)[1], 'base64')
        const width = bytes.readUInt32BE(16)
        const height = bytes.readUInt32BE(20)
        return width > 10 && height > 10
          ? probeResponse(200)
          : probeResponse(400, { message: 'image dimensions must be greater than 10' })
      }
      return probeResponse(200)
    },
  })

  assert.equal(result.checks.image.status, 'supported')
  assert.deepEqual(result.patch.input, ['text', 'image'])
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
