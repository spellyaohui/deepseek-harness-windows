import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const wrapperRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(wrapperRoot, '..')
const alphaRoot = join(repositoryRoot, 'upstream', 'dsh-v0.1.2-rc.1')
const sourceRoot = alphaRoot
const manifestPath = join(alphaRoot, 'rc1-source-manifest.json')

export const RC1_TAG = 'dsh-v0.1.2-rc.1'
export const RC1_COMMIT = 'a66e4702047846cdaa10c66c9d3df3951f5ea70d'
export const RC1_VERSION = '0.1.2-rc.1'
export const RC1_PNPM = '11.7.0'
export const RC1_PACKAGE_COUNT = 251

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`)
  return value
}

export function validateRC1Manifest(manifest, { expectedPackageCount = RC1_PACKAGE_COUNT } = {}) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('RC.1 manifest must be an object')
  }
  if (manifest.tag !== RC1_TAG) throw new Error(`RC.1 tag mismatch: ${String(manifest.tag)}`)
  if (manifest.commit !== RC1_COMMIT) throw new Error(`RC.1 commit mismatch: ${String(manifest.commit)}`)
  if (manifest.sourceVersion !== RC1_VERSION) {
    throw new Error(`RC.1 source version mismatch: ${String(manifest.sourceVersion)}`)
  }
  if (manifest.pnpm !== RC1_PNPM) throw new Error(`RC.1 pnpm mismatch: ${String(manifest.pnpm)}`)
  requireString(manifest.node, 'RC.1 Node version')
  if (manifest.vendorTarballPath !== 'upstream/dsh-v0.1.2-rc.1/tarballs/vendor') {
    throw new Error(`RC.1 vendor tarball path mismatch: ${String(manifest.vendorTarballPath)}`)
  }
  if (manifest.dshTarballPath !== 'upstream/dsh-v0.1.2-rc.1/tarballs/dsh') {
    throw new Error(`RC.1 dsh tarball path mismatch: ${String(manifest.dshTarballPath)}`)
  }
  if (Number.isNaN(Date.parse(manifest.createdAt))) throw new Error('RC.1 manifest createdAt is invalid')
  if (
    manifest.packedInstall?.vendor !== true
    || manifest.packedInstall?.dsh !== true
    || manifest.packedInstall?.cliVersion !== RC1_VERSION
  ) {
    throw new Error('RC.1 packed-install evidence is incomplete')
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length !== expectedPackageCount) {
    throw new Error(`RC.1 package count mismatch: ${String(manifest.packages?.length)}`)
  }
  if (!Array.isArray(manifest.families?.vendor) || !Array.isArray(manifest.families?.dsh)) {
    throw new Error('RC.1 family package lists are missing')
  }

  const names = new Set()
  const files = new Set()
  for (const entry of manifest.packages) {
    if (entry?.family !== 'vendor' && entry?.family !== 'dsh') throw new Error('RC.1 package family is invalid')
    const name = requireString(entry.name, 'RC.1 package name')
    const file = requireString(entry.file, `RC.1 package ${name} path`)
    const version = requireString(entry.version, `RC.1 package ${name} version`)
    if (entry.family === 'dsh' && version !== RC1_VERSION) {
      throw new Error(`RC.1 dsh package version mismatch for ${name}: ${version}`)
    }
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`RC.1 package ${name} has no valid SHA-256`)
    }
    if (names.has(name)) throw new Error(`RC.1 package name is duplicated: ${name}`)
    if (files.has(file)) throw new Error(`RC.1 package file is duplicated: ${file}`)
    names.add(name)
    files.add(file)
  }

  for (const family of ['vendor', 'dsh']) {
    const declared = [...manifest.families[family]].sort()
    const observed = manifest.packages
      .filter(entry => entry.family === family)
      .map(entry => entry.name)
      .sort()
    if (JSON.stringify(declared) !== JSON.stringify(observed)) {
      throw new Error(`RC.1 ${family} family membership mismatch`)
    }
  }
  return manifest
}

function capture(command, args, cwd, label) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  })
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr.trim()}`)
  return result.stdout.trim()
}

function packageIdentity(path) {
  return JSON.parse(capture('tar', ['-xOf', path, 'package/package.json'], repositoryRoot, `read ${path}`))
}

function tarballFiles(directory) {
  return readdirSync(directory)
    .filter(name => name.endsWith('.tgz'))
    .sort()
    .map(name => join(directory, name))
}

export function verifyRC1Source() {
  if (!existsSync(manifestPath)) throw new Error(`RC.1 manifest is missing: ${manifestPath}`)
  const manifest = validateRC1Manifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
  const head = capture('git', ['rev-parse', 'HEAD'], sourceRoot, 'read RC.1 HEAD')
  const tag = capture('git', ['rev-parse', `refs/tags/${RC1_TAG}`], sourceRoot, 'read RC.1 tag')
  if (head !== RC1_COMMIT || tag !== RC1_COMMIT) {
    throw new Error(`RC.1 checkout identity mismatch: HEAD=${head} tag=${tag}`)
  }

  const actualFiles = [
    ...tarballFiles(join(alphaRoot, 'tarballs', 'vendor')),
    ...tarballFiles(join(alphaRoot, 'tarballs', 'dsh')),
  ].map(path => path.slice(repositoryRoot.length + 1).replaceAll('\\', '/')).sort()
  const declaredFiles = manifest.packages.map(entry => entry.file).sort()
  if (JSON.stringify(actualFiles) !== JSON.stringify(declaredFiles)) {
    throw new Error('RC.1 tarball file set differs from the manifest')
  }

  for (const entry of manifest.packages) {
    const path = join(repositoryRoot, ...entry.file.split('/'))
    const identity = packageIdentity(path)
    if (identity.name !== entry.name || identity.version !== entry.version) {
      throw new Error(`RC.1 package identity mismatch for ${entry.file}`)
    }
    const actualHash = sha256File(path)
    if (actualHash !== entry.sha256) throw new Error(`RC.1 SHA-256 mismatch for ${entry.file}`)
  }
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const manifest = verifyRC1Source()
  console.log(`[rc1] verified ${manifest.packages.length} tarballs at ${manifest.commit}`)
}
