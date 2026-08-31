import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const wrapperRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(wrapperRoot, '..')
const alphaRoot = join(repositoryRoot, 'upstream', 'dsh-v0.1.2-alpha.2')
const sourceRoot = join(alphaRoot, 'source')
const manifestPath = join(alphaRoot, 'alpha2-source-manifest.json')

export const ALPHA2_TAG = 'dsh-v0.1.2-alpha.2'
export const ALPHA2_COMMIT = '0a53fb55bea101816fa226bb964ae2bed71c343b'
export const ALPHA2_VERSION = '0.1.2-alpha.2'
export const ALPHA2_PNPM = '11.7.0'
export const ALPHA2_PACKAGE_COUNT = 254

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`)
  return value
}

export function validateAlpha2Manifest(manifest, { expectedPackageCount = ALPHA2_PACKAGE_COUNT } = {}) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Alpha.2 manifest must be an object')
  }
  if (manifest.tag !== ALPHA2_TAG) throw new Error(`Alpha.2 tag mismatch: ${String(manifest.tag)}`)
  if (manifest.commit !== ALPHA2_COMMIT) throw new Error(`Alpha.2 commit mismatch: ${String(manifest.commit)}`)
  if (manifest.sourceVersion !== ALPHA2_VERSION) {
    throw new Error(`Alpha.2 source version mismatch: ${String(manifest.sourceVersion)}`)
  }
  if (manifest.pnpm !== ALPHA2_PNPM) throw new Error(`Alpha.2 pnpm mismatch: ${String(manifest.pnpm)}`)
  requireString(manifest.node, 'Alpha.2 Node version')
  if (manifest.vendorTarballPath !== 'upstream/dsh-v0.1.2-alpha.2/tarballs/vendor') {
    throw new Error(`Alpha.2 vendor tarball path mismatch: ${String(manifest.vendorTarballPath)}`)
  }
  if (manifest.dshTarballPath !== 'upstream/dsh-v0.1.2-alpha.2/tarballs/dsh') {
    throw new Error(`Alpha.2 dsh tarball path mismatch: ${String(manifest.dshTarballPath)}`)
  }
  if (Number.isNaN(Date.parse(manifest.createdAt))) throw new Error('Alpha.2 manifest createdAt is invalid')
  if (
    manifest.packedInstall?.vendor !== true
    || manifest.packedInstall?.dsh !== true
    || manifest.packedInstall?.cliVersion !== ALPHA2_VERSION
  ) {
    throw new Error('Alpha.2 packed-install evidence is incomplete')
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length !== expectedPackageCount) {
    throw new Error(`Alpha.2 package count mismatch: ${String(manifest.packages?.length)}`)
  }
  if (!Array.isArray(manifest.families?.vendor) || !Array.isArray(manifest.families?.dsh)) {
    throw new Error('Alpha.2 family package lists are missing')
  }

  const names = new Set()
  const files = new Set()
  for (const entry of manifest.packages) {
    if (entry?.family !== 'vendor' && entry?.family !== 'dsh') throw new Error('Alpha.2 package family is invalid')
    const name = requireString(entry.name, 'Alpha.2 package name')
    const file = requireString(entry.file, `Alpha.2 package ${name} path`)
    const version = requireString(entry.version, `Alpha.2 package ${name} version`)
    if (entry.family === 'dsh' && version !== ALPHA2_VERSION) {
      throw new Error(`Alpha.2 dsh package version mismatch for ${name}: ${version}`)
    }
    if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Alpha.2 package ${name} has no valid SHA-256`)
    }
    if (names.has(name)) throw new Error(`Alpha.2 package name is duplicated: ${name}`)
    if (files.has(file)) throw new Error(`Alpha.2 package file is duplicated: ${file}`)
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
      throw new Error(`Alpha.2 ${family} family membership mismatch`)
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

export function verifyAlpha2Source() {
  if (!existsSync(manifestPath)) throw new Error(`Alpha.2 manifest is missing: ${manifestPath}`)
  const manifest = validateAlpha2Manifest(JSON.parse(readFileSync(manifestPath, 'utf8')))
  const head = capture('git', ['rev-parse', 'HEAD'], sourceRoot, 'read Alpha.2 HEAD')
  const tag = capture('git', ['rev-parse', `refs/tags/${ALPHA2_TAG}`], sourceRoot, 'read Alpha.2 tag')
  if (head !== ALPHA2_COMMIT || tag !== ALPHA2_COMMIT) {
    throw new Error(`Alpha.2 checkout identity mismatch: HEAD=${head} tag=${tag}`)
  }

  const actualFiles = [
    ...tarballFiles(join(alphaRoot, 'tarballs', 'vendor')),
    ...tarballFiles(join(alphaRoot, 'tarballs', 'dsh')),
  ].map(path => path.slice(repositoryRoot.length + 1).replaceAll('\\', '/')).sort()
  const declaredFiles = manifest.packages.map(entry => entry.file).sort()
  if (JSON.stringify(actualFiles) !== JSON.stringify(declaredFiles)) {
    throw new Error('Alpha.2 tarball file set differs from the manifest')
  }

  for (const entry of manifest.packages) {
    const path = join(repositoryRoot, ...entry.file.split('/'))
    const identity = packageIdentity(path)
    if (identity.name !== entry.name || identity.version !== entry.version) {
      throw new Error(`Alpha.2 package identity mismatch for ${entry.file}`)
    }
    const actualHash = sha256File(path)
    if (actualHash !== entry.sha256) throw new Error(`Alpha.2 SHA-256 mismatch for ${entry.file}`)
  }
  return manifest
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const manifest = verifyAlpha2Source()
  console.log(`[alpha2] verified ${manifest.packages.length} tarballs at ${manifest.commit}`)
}
