import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
} from 'node:path'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import {
  resolveVerificationTarget,
  verifyRuntimeClosure,
} from './verify-alpha2-runtime-closure.mjs'

const scriptPath = fileURLToPath(import.meta.url)
const wrapperRoot = resolve(dirname(scriptPath), '..')
const temporaryPrefixName = 'dsh-alpha2-zip-'

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function toPosix(path) {
  return path.replaceAll('\\', '/')
}

export function validateArchiveEntries(entries) {
  for (const rawEntry of entries) {
    const entry = String(rawEntry).replaceAll('\\', '/')
    const segments = entry.split('/').filter(Boolean)
    if (entry.startsWith('/') || /^[A-Za-z]:/u.test(entry) || segments.includes('..')) {
      throw new Error(`unsafe ZIP entry: ${rawEntry}`)
    }
  }
}

export function collectManifestHashes(appRoot) {
  const absoluteRoot = resolve(appRoot)
  const pending = [join(absoluteRoot, 'node_modules')]
  const hashes = new Map()
  while (pending.length > 0) {
    const directory = pending.pop()
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
      } else if (entry.isFile() && entry.name === 'package.json') {
        hashes.set(toPosix(relative(absoluteRoot, path)), sha256(path))
      } else if (entry.isSymbolicLink()) {
        throw new Error(`ZIP manifest comparison does not accept symlinks: ${path}`)
      }
    }
  }
  for (const path of ['package.json', 'src/dsh-service.js']) {
    hashes.set(path, sha256(join(absoluteRoot, ...path.split('/'))))
  }
  return hashes
}

export function compareManifestHashes(expected, actual) {
  if (expected.size !== actual.size) {
    throw new Error(`manifest count mismatch: unpacked=${expected.size} zip=${actual.size}`)
  }
  for (const [path, hash] of expected) {
    if (actual.get(path) !== hash) throw new Error(`ZIP manifest differs: ${path}`)
  }
  return expected.size
}

function runTar(args, label) {
  const result = spawnSync('tar', args, {
    cwd: wrapperRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${label} failed: ${result.stderr.trim()}`)
  return result.stdout
}

function removeOwnedTemporaryDirectory(path) {
  const absolute = resolve(path)
  const temporaryRoot = resolve(tmpdir())
  if (dirname(absolute) !== temporaryRoot || !basename(absolute).startsWith(temporaryPrefixName)) {
    throw new Error(`refusing to remove an unowned temporary directory: ${absolute}`)
  }
  rmSync(absolute, { recursive: true, force: true })
}

export function verifyAlpha2ZipClosure({ zipPath, againstRoot = 'dist/win-unpacked' } = {}) {
  if (typeof zipPath !== 'string' || zipPath.trim() === '') throw new Error('zipPath is required')
  const absoluteZipPath = resolve(wrapperRoot, zipPath)
  const entries = runTar(['-tf', absoluteZipPath], `list ${absoluteZipPath}`)
    .split(/\r?\n/u)
    .filter(Boolean)
  validateArchiveEntries(entries)

  const temporaryRoot = mkdtempSync(join(tmpdir(), temporaryPrefixName))
  try {
    runTar(['-xf', absoluteZipPath, '-C', temporaryRoot], `extract ${absoluteZipPath}`)
    const zippedTarget = resolveVerificationTarget(temporaryRoot, { wrapperRoot })
    const unpackedTarget = resolveVerificationTarget(againstRoot, { wrapperRoot })
    const runtime = verifyRuntimeClosure({ appRoot: zippedTarget.appRoot })
    const manifestCount = compareManifestHashes(
      collectManifestHashes(unpackedTarget.appRoot),
      collectManifestHashes(zippedTarget.appRoot),
    )
    return {
      zipPath: absoluteZipPath,
      entryCount: entries.length,
      manifestCount,
      runtime,
    }
  } finally {
    removeOwnedTemporaryDirectory(temporaryRoot)
  }
}

function argumentValue(argv, name, fallback) {
  const index = argv.indexOf(name)
  if (index < 0) return fallback
  if (index + 1 >= argv.length) throw new Error(`${name} requires a value`)
  return argv[index + 1]
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  const argv = process.argv.slice(2)
  const result = verifyAlpha2ZipClosure({
    zipPath: argumentValue(argv, '--zip'),
    againstRoot: argumentValue(argv, '--against', 'dist/win-unpacked'),
  })
  console.log(`[zip-closure] ${result.entryCount} archive entries`)
  console.log(`[zip-closure] resolved ${result.runtime.packages.length} production packages (${result.runtime.rc1Packages.length} RC.1 packages)`)
  for (const entry of result.runtime.required) {
    console.log(`[zip-closure] ${entry.name}@${entry.version} -> ${entry.manifestPath}`)
  }
  console.log(`[zip-closure] matched ${result.manifestCount} package/app manifests with win-unpacked`)
}
