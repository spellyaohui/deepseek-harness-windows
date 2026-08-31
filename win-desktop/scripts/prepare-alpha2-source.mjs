import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const wrapperRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(wrapperRoot, '..')
const alphaRoot = join(repositoryRoot, 'upstream', 'dsh-v0.1.2-alpha.2')
const sourceRoot = join(alphaRoot, 'source')
const tarballRoot = join(alphaRoot, 'tarballs')
const manifestPath = join(alphaRoot, 'alpha2-source-manifest.json')

export const ALPHA2_TAG = 'dsh-v0.1.2-alpha.2'
export const ALPHA2_COMMIT = '0a53fb55bea101816fa226bb964ae2bed71c343b'
export const ALPHA2_REPOSITORY = 'https://github.com/deepseek-ai/deepseek-harness.git'
export const ALPHA2_PNPM = '11.7.0'

function commandName(command) {
  return process.platform === 'win32' && ['npm', 'npx', 'pnpm'].includes(command)
    ? `${command}.cmd`
    : command
}

function invocation(command, args) {
  const executable = commandName(command)
  return process.platform === 'win32' && executable.endsWith('.cmd')
    ? { executable: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', executable, ...args] }
    : { executable, args }
}

function run(command, args, cwd, label) {
  const call = invocation(command, args)
  const result = spawnSync(call.executable, call.args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  })
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${String(result.status ?? 1)}`)
}

function capture(command, args, cwd, label) {
  const call = invocation(command, args)
  const result = spawnSync(call.executable, call.args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  })
  if (result.error) throw new Error(`${label} failed to start: ${result.error.message}`)
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${String(result.status ?? 1)}: ${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

function jsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function tarballsIn(directory) {
  return readdirSync(directory)
    .filter(name => name.endsWith('.tgz'))
    .sort()
    .map(name => join(directory, name))
}

function tarballIdentity(path) {
  const listing = capture('tar', ['-xOf', path, 'package/package.json'], repositoryRoot, `read ${path}`)
  const manifest = JSON.parse(listing)
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
    throw new Error(`${path} has no package name/version`)
  }
  return { name: manifest.name, version: manifest.version }
}

function assertExistingDirectoryIsSafe(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
    return
  }
  if (!statSync(path).isDirectory()) throw new Error(`expected directory, found non-directory: ${path}`)
}

function assertTag() {
  const output = capture('git', ['ls-remote', ALPHA2_REPOSITORY, `refs/tags/${ALPHA2_TAG}`], repositoryRoot, 'verify Alpha.2 tag')
  const commit = output.split(/\s+/)[0]
  if (commit !== ALPHA2_COMMIT) {
    throw new Error(`Alpha.2 tag ${ALPHA2_TAG} resolves to ${commit}, expected ${ALPHA2_COMMIT}`)
  }
}

function prepareSource() {
  assertExistingDirectoryIsSafe(alphaRoot)
  if (!existsSync(sourceRoot)) {
    run('git', ['clone', '--filter=blob:none', '--no-checkout', ALPHA2_REPOSITORY, sourceRoot], repositoryRoot, 'clone Alpha.2 source')
  } else if (!existsSync(join(sourceRoot, '.git'))) {
    throw new Error(`existing Alpha.2 source has no Git metadata and will not be overwritten: ${sourceRoot}`)
  }
  const current = capture('git', ['rev-parse', 'HEAD'], sourceRoot, 'read Alpha.2 source commit')
  if (current !== ALPHA2_COMMIT || !existsSync(join(sourceRoot, 'package.json'))) {
    run('git', ['fetch', '--tags', '--force', 'origin', ALPHA2_COMMIT], sourceRoot, 'fetch Alpha.2 commit')
    run('git', ['checkout', '--detach', ALPHA2_COMMIT], sourceRoot, 'checkout Alpha.2 commit')
  }
  const resolved = capture('git', ['rev-parse', 'HEAD'], sourceRoot, 'verify checked-out Alpha.2 commit')
  if (resolved !== ALPHA2_COMMIT) throw new Error(`checked-out Alpha.2 commit mismatch: ${resolved}`)
}

function officialPnpm(args, label) {
  run('npx', ['--yes', `pnpm@${ALPHA2_PNPM}`, ...args], sourceRoot, label)
}

function packFamily(family) {
  const sourceOutput = join(sourceRoot, 'dist', 'release', family)
  const destination = join(tarballRoot, family)
  assertExistingDirectoryIsSafe(tarballRoot)
  if (existsSync(destination) && readdirSync(destination).some(name => name.endsWith('.tgz'))) {
    throw new Error(`refusing to overwrite existing Alpha.2 tarballs: ${destination}`)
  }
  mkdirSync(destination, { recursive: true })
  officialPnpm(['exec', 'tsx', 'scripts/release/pack.ts', '--family', family, '--out', `dist/release/${family}`, '--concurrency', '1'], `pack ${family} release family`)
  for (const tarball of tarballsIn(sourceOutput)) {
    cpSync(tarball, join(destination, tarball.split(/[\\/]/).at(-1)), { errorOnExist: true })
  }
  if (tarballsIn(destination).length === 0) throw new Error(`Alpha.2 ${family} family produced no tarballs`)
}

function buildManifest() {
  const families = {}
  const packages = []
  for (const family of ['vendor', 'dsh']) {
    const entries = tarballsIn(join(tarballRoot, family)).map(path => {
      const identity = tarballIdentity(path)
      const entry = {
        family,
        file: path.slice(repositoryRoot.length + 1).replaceAll('\\', '/'),
        name: identity.name,
        version: identity.version,
      }
      packages.push(entry)
      return entry
    })
    families[family] = entries.map(entry => entry.name)
  }
  const packageJson = jsonFile(join(sourceRoot, 'package.json'))
  const manifest = {
    tag: ALPHA2_TAG,
    commit: ALPHA2_COMMIT,
    repository: ALPHA2_REPOSITORY,
    sourcePath: sourceRoot.slice(repositoryRoot.length + 1).replaceAll('\\', '/'),
    sourceVersion: packageJson.version,
    node: process.version,
    pnpm: ALPHA2_PNPM,
    families,
    packages,
  }
  if (existsSync(manifestPath)) {
    const existing = jsonFile(manifestPath)
    if (existing.tag !== manifest.tag || existing.commit !== manifest.commit) {
      throw new Error(`existing Alpha.2 manifest identity differs: ${manifestPath}`)
    }
    return existing
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  return manifest
}

export function prepareAlpha2Source() {
  assertTag()
  prepareSource()
  const packageJson = jsonFile(join(sourceRoot, 'package.json'))
  if (packageJson.version !== '0.1.2-alpha.2') throw new Error(`Alpha.2 source package version is ${packageJson.version}`)
  officialPnpm(['install', '--frozen-lockfile'], 'install official Alpha.2 dependencies')
  officialPnpm(['run', 'build:official'], 'build official Alpha.2 source')
  packFamily('vendor')
  packFamily('dsh')
  officialPnpm(['exec', 'tsx', 'scripts/release/verify-packed-install.ts', '--family', 'vendor', '--from', 'dist/release/vendor'], 'verify official vendor packed install')
  officialPnpm(['exec', 'tsx', 'scripts/release/verify-packed-install.ts', '--family', 'dsh', '--from', 'dist/release/vendor', '--from', 'dist/release/dsh'], 'verify official dsh packed install')
  return buildManifest()
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const manifest = prepareAlpha2Source()
  console.log(`[alpha2] prepared ${manifest.packages.length} package tarball(s) at ${manifest.sourcePath}`)
}
