import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, test } from 'node:test'

import {
  REQUIRED_RUNTIME_PACKAGES,
  resolveVerificationTarget,
  verifyRuntimeClosure,
} from '../scripts/verify-alpha2-runtime-closure.mjs'
import * as runtime from '../scripts/verify-alpha2-runtime-closure.mjs'

const temporaryRoots = []

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-runtime-closure-'))
  temporaryRoots.push(root)
  return root
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writePackage(appRoot, name, manifest) {
  const packageRoot = join(appRoot, 'node_modules', ...name.split('/'))
  mkdirSync(packageRoot, { recursive: true })
  writeJson(join(packageRoot, 'package.json'), { name, version: '1.0.0', main: 'index.js', ...manifest })
  writeFileSync(join(packageRoot, 'index.js'), 'module.exports = {}\n', 'utf8')
}

function writeApp(appRoot, dependencies, version = '1.0.0') {
  mkdirSync(join(appRoot, 'src'), { recursive: true })
  writeJson(join(appRoot, 'package.json'), { name: 'fixture-app', version, dependencies })
  writeFileSync(join(appRoot, 'src', 'dsh-service.js'), 'export {}\n', 'utf8')
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop(), { recursive: true, force: true })
})

test('runtime closure target maps source node_modules to the wrapper dsh-service anchor', () => {
  const wrapperRoot = temporaryRoot()
  writeApp(wrapperRoot, {})
  mkdirSync(join(wrapperRoot, 'node_modules'))

  const target = resolveVerificationTarget('node_modules', { wrapperRoot })

  assert.equal(target.appRoot, wrapperRoot)
  assert.equal(target.anchorPath, join(wrapperRoot, 'src', 'dsh-service.js'))
})

test('runtime closure target maps win-unpacked to resources/app', () => {
  const wrapperRoot = temporaryRoot()
  const unpackedRoot = join(wrapperRoot, 'dist', 'win-unpacked')
  const appRoot = join(unpackedRoot, 'resources', 'app')
  writeApp(appRoot, {})

  const target = resolveVerificationTarget('dist/win-unpacked', { wrapperRoot })

  assert.equal(target.appRoot, appRoot)
  assert.equal(target.anchorPath, join(appRoot, 'src', 'dsh-service.js'))
})

test('runtime closure resolves every production dependency from the dsh-service anchor', () => {
  const appRoot = temporaryRoot()
  writeApp(appRoot, { alpha: '1.0.0' })
  writePackage(appRoot, 'alpha', { dependencies: { beta: '1.0.0' } })
  writePackage(appRoot, 'beta', {})

  const result = verifyRuntimeClosure({ appRoot, requiredPackages: ['alpha', 'beta'] })

  assert.equal(result.anchorPath, resolve(appRoot, 'src', 'dsh-service.js'))
  assert.deepEqual(result.required.map(entry => entry.name), ['alpha', 'beta'])
  assert.equal(result.packages.some(entry => entry.name === 'alpha'), true)
  assert.equal(result.packages.some(entry => entry.name === 'beta'), true)
})

test('runtime closure ignores an exports-mapped nested package.json and finds the named package root', () => {
  const appRoot = temporaryRoot()
  writeApp(appRoot, { alpha: '1.0.0' })
  const packageRoot = join(appRoot, 'node_modules', 'alpha')
  mkdirSync(join(packageRoot, 'dist', 'cjs'), { recursive: true })
  writeJson(join(packageRoot, 'package.json'), {
    name: 'alpha',
    version: '1.0.0',
    exports: { './package.json': './dist/cjs/package.json' },
  })
  writeJson(join(packageRoot, 'dist', 'cjs', 'package.json'), { type: 'commonjs' })

  const result = verifyRuntimeClosure({ appRoot, requiredPackages: ['alpha'] })

  assert.deepEqual(result.required.map(entry => entry.name), ['alpha'])
  assert.equal(result.required[0].manifestPath, 'node_modules/alpha/package.json')
})

test('runtime closure rejects a missing non-optional transitive dependency', () => {
  const appRoot = temporaryRoot()
  writeApp(appRoot, { alpha: '1.0.0' })
  writePackage(appRoot, 'alpha', { dependencies: { missing: '1.0.0' } })

  assert.throws(
    () => verifyRuntimeClosure({ appRoot, requiredPackages: ['alpha'] }),
    /cannot resolve runtime dependency missing required by alpha/u,
  )
})

test('runtime closure rejects a mixed official DSH cohort', () => {
  const appRoot = temporaryRoot()
  writeApp(appRoot, { '@deepseek-ai/dsh-agent': '0.2.1-rc.2' }, '0.2.1-rc.2')
  writePackage(appRoot, '@deepseek-ai/dsh-agent', { version: '0.1.7-rc.2' })
  assert.throws(() => verifyRuntimeClosure({ appRoot, requiredPackages: [] }), /dsh-agent.*0\.1\.7-rc\.2.*0\.2\.1-rc\.2/u)
})

test('runtime closure accepts only an explicitly declared npm alias identity', () => {
  const appRoot = temporaryRoot()
  writeApp(appRoot, { '@fixture/alias': 'npm:@fixture/real@1.0.0' })
  writePackage(appRoot, '@fixture/alias', { name: '@fixture/real', version: '1.0.0' })
  assert.doesNotThrow(() => verifyRuntimeClosure({ appRoot, requiredPackages: [] }))
  writeApp(appRoot, { '@fixture/alias': '1.0.0' })
  assert.throws(() => verifyRuntimeClosure({ appRoot, requiredPackages: [] }), /identity mismatch/u)
})

test('release-critical runtime package list includes the Alpha.2 and Cordis boot closure', () => {
  assert.deepEqual(REQUIRED_RUNTIME_PACKAGES, [
    '@deepseek-ai/dsh-app-boot',
    '@deepseek-ai/cordis',
    '@deepseek-ai/cordis-plugin-loader',
    '@deepseek-ai/cordis-plugin-include',
    'js-yaml',
    'argparse',
    '@deepseek-ai/dsh-superpowers',
  ])
})

test('Superpowers closure checks the fixed source, complete file set and local runtime resources', () => {
  assert.equal(typeof runtime.verifySuperpowersAssets, 'function')
  const root = join(temporaryRoot(), 'plugin')
  cpSync(new URL('../superpowers-plugin/', import.meta.url), root, { recursive: true })
  assert.deepEqual(runtime.verifySuperpowersAssets(root), {
    skillCount: 15, assetCount: 75, commit: 'bb92a77741419a4ab5f06e711a283343f1ada0c3' })
  const manifestPath = join(root, 'lib', 'upstream-manifest.json')
  const manifestBytes = readFileSync(manifestPath)
  const manifest = JSON.parse(manifestBytes)
  for (const path of ['skills/brainstorming/SKILL.md', 'skills/executing-plans/scripts/task-start',
    'LICENSE', 'dsh-tools.md', 'index.js', 'upstream-manifest.json']) {
    const target = join(root, 'lib', path)
    const bytes = readFileSync(target)
    rmSync(target)
    assert.throws(() => runtime.verifySuperpowersAssets(root), /Superpowers|superpowers/u)
    writeFileSync(target, bytes)
  }
  const asset = join(root, 'lib', manifest.files[0].path)
  const bytes = readFileSync(asset)
  writeFileSync(asset, 'tampered')
  assert.throws(() => runtime.verifySuperpowersAssets(root), /hash/u)
  writeFileSync(asset, bytes)
  const bad = structuredClone(manifest)
  bad.files[0].path = '../outside.txt'
  writeJson(manifestPath, bad)
  assert.throws(() => runtime.verifySuperpowersAssets(root), /path/u)
  writeFileSync(manifestPath, manifestBytes)
  const extra = join(root, 'lib', 'skills', 'unexpected.md')
  writeFileSync(extra, 'unexpected')
  assert.throws(() => runtime.verifySuperpowersAssets(root), /file set/u)
  rmSync(extra)
  symlinkSync(join(root, 'lib', 'skills', 'brainstorming'), extra,
    process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => runtime.verifySuperpowersAssets(root), /link/u)
})

test('Superpowers closure rejects coordinated asset and manifest tampering', () => {
  const root = join(temporaryRoot(), 'plugin')
  cpSync(new URL('../superpowers-plugin/', import.meta.url), root, { recursive: true })
  const path = join(root, 'lib', 'LICENSE')
  writeFileSync(path, 'Different bytes with a matching self-reported hash')
  const manifestPath = join(root, 'lib', 'upstream-manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath))
  manifest.files.find(entry => entry.path === 'LICENSE').sha256 =
    createHash('sha256').update(readFileSync(path)).digest('hex')
  writeJson(manifestPath, manifest)
  assert.throws(() => runtime.verifySuperpowersAssets(root), /fixed source/u)
})
