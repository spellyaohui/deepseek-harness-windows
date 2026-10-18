import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const INPUT_NAME = 'Build-Inputs-0.2.0-rc.10.tar.gz'
export const INPUT_SHA256 = 'c898e21a73f118ceb77fd45a84130c6a8a6cc38d0f9688e0ea3206ec750abccf'
const inputUrl = `https://github.com/spellyaohui/deepseek-harness-windows/releases/download/v0.2.0-rc.10/${INPUT_NAME}`
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex')

export function readInputManifest(repository = root) {
  const entries = []
  for (const name of ['UPSTREAM_017_SOURCE_MANIFEST.md', 'UPSTREAM_020_SOURCE_MANIFEST.md']) {
    const source = readFileSync(join(repository, 'docs', name), 'utf8')
    for (const match of source.matchAll(/^\| (vendor|dsh) \| ([^|]+) \| ([^|]+) \| ([a-f0-9]{64}) \| (upstream\/[^|]+) \|$/gm)) {
      const path = match[5]
      if (!/^upstream\/dsh-v0\.(?:1\.7|2\.0)-rc\.2\/tarballs\/(?:vendor|dsh)\/[A-Za-z0-9.-]+\.tgz$/.test(path)) throw new Error(`Unsafe input path: ${path}`)
      entries.push({ path, sha256: match[4] })
    }
  }
  if (entries.length !== 650 || new Set(entries.map(row => row.path)).size !== 650) throw new Error('Expected exactly 650 unique pinned upstream archives')
  return entries
}

/** Published 0.2.1 inputs are fetched by fixed hash, separately from the offline gate. */
export function readRegistryInputs(repository = root) {
  const source = readFileSync(join(repository, 'docs/UPSTREAM_021_SOURCE_MANIFEST.md'), 'utf8')
  if (!source.includes('687f282e8625c6b8d11ff58211a90524be2e4317')) throw new Error('Registry source revision mismatch')
  const entries = [...source.matchAll(/^\| (vendor|dsh) \| (@deepseek-ai\/[^| ]+) \| ([^| ]+) \| ([a-f0-9]{64}) \| ([^| ]+) \|$/gm)].map(match => {
    const [, family, name, version, hash, path] = match
    if (!/^@deepseek-ai\/[a-z0-9-]+$/.test(name) || !/^[a-z0-9.-]+$/.test(version)
      || family === 'dsh' && version !== '0.2.1-rc.2'
      || path !== `upstream/dsh-v0.2.1-rc.2/tarballs/${family}/${name.slice(1).replace('/', '-')}-${version}.tgz`) {
      throw new Error(`Unsafe registry archive path: ${path}`)
    }
    return { name, version, path, sha256: hash }
  })
  if (entries.length !== 352 || new Set(entries.map(row => row.name)).size !== 352) throw new Error('Expected 352 unique registry archives')
  return entries
}

export async function prepareRegistryInputs() {
  for (const row of readRegistryInputs()) {
    const path = join(root, row.path)
    if (existsSync(path)) {
      if (sha256(path) !== row.sha256) throw new Error(`Existing user file differs; refusing to overwrite: ${row.path}`)
      continue
    }
    safeParent(path)
    const response = await fetch(`https://registry.npmjs.org/${row.name}/-/${row.name.split('/')[1]}-${row.version}.tgz`, { signal: AbortSignal.timeout(120000) })
    if (!response.ok) throw new Error(`Registry archive download failed: ${row.name} HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) throw new Error(`Registry archive SHA-256 mismatch: ${row.name}`)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes, { flag: 'wx' })
  }
  console.log('[build-inputs] verified 352 immutable official 0.2.1 registry archives')
}

function safeParent(path) {
  for (let parent = path; parent.startsWith(root + sep); parent = dirname(parent)) {
    if (existsSync(parent) && lstatSync(parent).isSymbolicLink()) throw new Error(`Build inputs must use real directories: ${parent}`)
  }
}

function tar(args) {
  const result = spawnSync('tar', args, { encoding: 'utf8', windowsHide: true })
  if (result.error || result.status !== 0) throw new Error(`tar failed: ${result.error?.message ?? result.stderr}`)
  return result.stdout
}

export async function prepareBuildInputs(archivePath) {
  const entries = readInputManifest()
  const cache = join(root, 'upstream/release-cache')
  safeParent(cache)
  mkdirSync(cache, { recursive: true })
  const archive = archivePath ? resolve(archivePath) : join(cache, INPUT_NAME)
  if (!existsSync(archive)) {
    if (archivePath) throw new Error(`Missing input archive: ${archive}`)
    const response = await fetch(inputUrl, { signal: AbortSignal.timeout(120000) })
    if (!response.ok) throw new Error(`Build input download failed: HTTP ${response.status}`)
    writeFileSync(archive, Buffer.from(await response.arrayBuffer()), { flag: 'wx' })
  }
  if (sha256(archive) !== INPUT_SHA256) throw new Error('Build input bundle SHA-256 mismatch')
  const listing = tar(['-tzf', archive]).trim().split(/\r?\n/).sort()
  if (JSON.stringify(listing) !== JSON.stringify(entries.map(row => row.path).sort())) throw new Error('Build input archive contains unexpected or missing paths')
  for (const row of entries) {
    const path = join(root, row.path)
    if (existsSync(path)) {
      if (sha256(path) !== row.sha256) throw new Error(`Existing user file differs; refusing to overwrite: ${row.path}`)
    } else safeParent(path)
  }
  const staging = mkdtempSync(join(cache, 'verified-inputs-'))
  try {
    tar(['-xzf', archive, '-C', staging])
    for (const row of entries) if (sha256(join(staging, row.path)) !== row.sha256) throw new Error(`Pinned upstream hash mismatch: ${row.path}`)
    for (const row of entries) {
      const path = join(root, row.path)
      if (existsSync(path)) continue
      safeParent(path)
      mkdirSync(dirname(path), { recursive: true })
      copyFileSync(join(staging, row.path), path, 1)
    }
  } finally {
    if (!resolve(staging).startsWith(resolve(cache) + sep)) throw new Error('Unsafe staging cleanup')
    rmSync(staging, { recursive: true, force: true })
  }
  console.log(`[build-inputs] verified ${entries.length} pinned archives; existing matching files retained`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareBuildInputs(process.argv[2])
  await prepareRegistryInputs()
}
