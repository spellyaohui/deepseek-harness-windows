import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { LOCAL_PLUGIN_ARTIFACTS, synchronizeLocalPluginArtifacts } from '../scripts/sync-local-plugin-artifacts.mjs'

const testRoot = mkdtempSync(join(tmpdir(), 'dsh-local-plugin-artifacts-'))

test('Superpowers file dependency and every runtime asset match the local owner', () => {
  assert.deepEqual(LOCAL_PLUGIN_ARTIFACTS.find(([name]) => name === 'superpowers-plugin'),
    ['superpowers-plugin', '@deepseek-ai/dsh-superpowers'])
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)))
  assert.equal(pkg.dependencies['@deepseek-ai/dsh-superpowers'], 'file:superpowers-plugin')
  const entry = lock.packages['node_modules/@deepseek-ai/dsh-superpowers']
  assert.equal(entry.version, '0.1.1')
  assert.notEqual(entry.link, true)
  function compare(source, installed) {
    assert.deepEqual(readdirSync(source).sort(), readdirSync(installed).sort())
    for (const item of readdirSync(source, { withFileTypes: true })) {
      const nextSource = new URL(item.name + (item.isDirectory() ? '/' : ''), source)
      const nextInstalled = new URL(item.name + (item.isDirectory() ? '/' : ''), installed)
      if (item.isDirectory()) compare(nextSource, nextInstalled)
      else assert.deepEqual(readFileSync(nextSource), readFileSync(nextInstalled))
    }
  }
  compare(new URL('../superpowers-plugin/lib/', import.meta.url),
    new URL('../node_modules/@deepseek-ai/dsh-superpowers/lib/', import.meta.url))
  for (const file of ['package.json', 'UPSTREAM.md']) {
    assert.deepEqual(readFileSync(new URL(`../superpowers-plugin/${file}`, import.meta.url)),
      readFileSync(new URL(`../node_modules/@deepseek-ai/dsh-superpowers/${file}`, import.meta.url)))
  }
})

test('AgentTeams release identity remains tied to the synchronized local artifact', () => {
  assert.deepEqual(
    LOCAL_PLUGIN_ARTIFACTS.find(([sourceName]) => sourceName === 'agent-teams-plugin'),
    ['agent-teams-plugin', '@nanmicoder/dsh-agent-teams'],
  )
  const packageJson = JSON.parse(readFileSync(new URL('../agent-teams-plugin/package.json', import.meta.url), 'utf8'))
  assert.equal(packageJson.version, '0.1.23-desktop.6')
})

test('AgentTeams declared repair utility and v0.1.23 notes match the local owner', () => {
  const source = new URL('../agent-teams-plugin/', import.meta.url)
  const installed = new URL('../node_modules/@nanmicoder/dsh-agent-teams/', import.meta.url)
  for (const file of [
    'scripts/legacy-session-source-repair.mjs',
    'release-notes/v0.1.23.md',
    'release-notes/v0.1.23-desktop.2.md',
    'release-notes/v0.1.23-desktop.3.md',
    'release-notes/v0.1.23-desktop.4.md',
    'release-notes/v0.1.23-desktop.5.md',
    'release-notes/v0.1.23-desktop.6.md',
  ]) {
    assert.deepEqual(readFileSync(new URL(file, source)), readFileSync(new URL(file, installed)), file)
  }
})

test('AgentTeams declares the Connection dependency used by its authenticated Web routes', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../agent-teams-plugin/package.json', import.meta.url), 'utf8'))
  assert.equal(
    packageJson.peerDependencies?.['@deepseek-ai/dsh-client-connection'],
    '0.2.0-rc.2 || 0.1.7-rc.2 || 0.1.5-rc.3 || 0.1.5-rc.2 || 0.1.5-rc.1 || 0.1.2-rc.1 || 0.1.2-alpha.5 || 0.1.2-alpha.2',
  )
  assert.ok(packageJson.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-connection'))
  assert.equal(
    packageJson.devDependencies?.['@deepseek-ai/dsh-client-connection'],
    'file:../../upstream/dsh-v0.2.0-rc.2/tarballs/dsh/deepseek-ai-dsh-client-connection-0.2.0-rc.2.tgz',
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
  assert.equal(sourcePackage.version, '0.1.1')
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
  assert.doesNotMatch(installedBundle, /modelImageAuto|capabilityProbe/)
  assert.match(installedBundle, /modelImageTextOnly/)

  for (const relativePath of [
    'lib/client.js',
    'lib/client/model-reasoning.js',
    'lib/client/model-input.js',
  ]) {
    assert.equal(
      readFileSync(new URL(`../models-settings-plugin/${relativePath}`, import.meta.url), 'utf8'),
      readFileSync(new URL(`../node_modules/@deepseek-ai/dsh-client-ui-settings-models/${relativePath}`, import.meta.url), 'utf8'),
      `installed Models artifact drifted from ${relativePath}`,
    )
  }
})

after(() => rmSync(testRoot, { recursive: true, force: true }))

test('synchronizes built lib and declared published files into the installed file dependency', () => {
  const sourceRoot = join(testRoot, 'example-plugin')
  const sourceLib = join(sourceRoot, 'lib')
  const sourceManifest = join(sourceRoot, 'package.json')
  const installedRoot = join(testRoot, 'node_modules', '@example', 'plugin')
  const installedLib = join(installedRoot, 'lib')
  const installedManifest = join(installedRoot, 'package.json')
  const unrelatedLib = join(testRoot, 'node_modules', '@example', 'other-plugin', 'lib')
  mkdirSync(sourceLib, { recursive: true })
  mkdirSync(installedLib, { recursive: true })
  mkdirSync(unrelatedLib, { recursive: true })
  writeFileSync(join(sourceLib, 'index.js'), 'export const current = true\n')
  mkdirSync(join(sourceLib, 'skills', 'example', 'scripts'), { recursive: true })
  writeFileSync(join(sourceLib, 'skills', 'example', 'SKILL.md'), 'Nested skill\n')
  writeFileSync(join(sourceLib, 'skills', 'example', 'scripts', 'helper.sh'), '#!/bin/bash\n')
  mkdirSync(join(sourceRoot, 'assets', 'readme'), { recursive: true })
  mkdirSync(join(sourceRoot, 'release-notes'), { recursive: true })
  mkdirSync(join(sourceRoot, 'scripts'), { recursive: true })
  mkdirSync(join(sourceRoot, 'src'), { recursive: true })
  mkdirSync(join(sourceRoot, 'node_modules', 'ignored'), { recursive: true })
  writeFileSync(join(sourceRoot, 'assets', 'readme', 'guide.md'), 'Current asset\n')
  writeFileSync(join(sourceRoot, 'release-notes', 'v2.md'), 'Current release note\n')
  writeFileSync(join(sourceRoot, 'scripts', 'doctor.mjs'), 'export const currentDoctor = true\n')
  writeFileSync(join(sourceRoot, 'README.md'), 'Current README\n')
  writeFileSync(join(sourceRoot, 'src', 'private.js'), 'Do not publish\n')
  writeFileSync(join(sourceRoot, 'node_modules', 'ignored', 'private.js'), 'Do not publish\n')
  writeFileSync(sourceManifest, JSON.stringify({
    name: '@example/plugin',
    version: '2.0.0',
    files: ['lib', 'assets', 'release-notes', 'scripts/doctor.mjs', 'README.md'],
  }))
  writeFileSync(join(installedLib, 'stale.js'), 'export const stale = true\n')
  mkdirSync(join(installedRoot, 'release-notes'), { recursive: true })
  mkdirSync(join(installedRoot, 'scripts'), { recursive: true })
  writeFileSync(join(installedRoot, 'release-notes', 'stale.md'), 'Stale release note\n')
  writeFileSync(join(installedRoot, 'scripts', 'doctor.mjs'), 'export const staleDoctor = true\n')
  writeFileSync(installedManifest, '{"name":"@example/plugin","version":"1.0.0"}\n')
  writeFileSync(join(unrelatedLib, 'owner.js'), 'export const otherOwner = true\n')

  const synchronized = synchronizeLocalPluginArtifacts({
    root: testRoot,
    artifacts: [['example-plugin', '@example/plugin']],
  })

  assert.deepEqual(synchronized, [{ sourceName: 'example-plugin', packageName: '@example/plugin' }])
  assert.equal(readFileSync(join(installedLib, 'index.js'), 'utf8'), 'export const current = true\n')
  assert.equal(existsSync(join(installedLib, 'stale.js')), false)
  assert.equal(readFileSync(join(installedLib, 'skills', 'example', 'SKILL.md'), 'utf8'), 'Nested skill\n')
  assert.equal(readFileSync(join(installedLib, 'skills', 'example', 'scripts', 'helper.sh'), 'utf8'), '#!/bin/bash\n')
  assert.equal(readFileSync(join(installedRoot, 'assets', 'readme', 'guide.md'), 'utf8'), 'Current asset\n')
  assert.equal(readFileSync(join(installedRoot, 'release-notes', 'v2.md'), 'utf8'), 'Current release note\n')
  assert.equal(existsSync(join(installedRoot, 'release-notes', 'stale.md')), false)
  assert.equal(readFileSync(join(installedRoot, 'scripts', 'doctor.mjs'), 'utf8'), 'export const currentDoctor = true\n')
  assert.equal(readFileSync(join(installedRoot, 'README.md'), 'utf8'), 'Current README\n')
  assert.equal(existsSync(join(installedRoot, 'src')), false)
  assert.equal(existsSync(join(installedRoot, 'node_modules')), false)
  assert.equal(readFileSync(join(unrelatedLib, 'owner.js'), 'utf8'), 'export const otherOwner = true\n')
  assert.deepEqual(JSON.parse(readFileSync(installedManifest, 'utf8')), {
    name: '@example/plugin',
    version: '2.0.0',
    files: ['lib', 'assets', 'release-notes', 'scripts/doctor.mjs', 'README.md'],
  })
})

test('rejects unsafe declared publication paths before modifying an installed plugin', () => {
  const sourceRoot = join(testRoot, 'unsafe-plugin')
  const sourceLib = join(sourceRoot, 'lib')
  const installedRoot = join(testRoot, 'node_modules', '@example', 'unsafe-plugin')
  mkdirSync(sourceLib, { recursive: true })
  mkdirSync(join(installedRoot, 'lib'), { recursive: true })
  writeFileSync(join(sourceLib, 'index.js'), 'export const current = true\n')
  writeFileSync(join(sourceRoot, 'package.json'), JSON.stringify({
    name: '@example/unsafe-plugin', version: '2.0.0', files: ['../outside'],
  }))
  writeFileSync(join(installedRoot, 'lib', 'owner.js'), 'export const installed = true\n')

  assert.throws(() => synchronizeLocalPluginArtifacts({
    root: testRoot,
    artifacts: [['unsafe-plugin', '@example/unsafe-plugin']],
  }), /published file.*unsafe/i)
  assert.equal(readFileSync(join(installedRoot, 'lib', 'owner.js'), 'utf8'), 'export const installed = true\n')
})
