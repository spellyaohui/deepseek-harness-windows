import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { verifyAlpha2Source } from './verify-alpha2-source.mjs'

const wrapperRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(wrapperRoot, '..')
const packagePath = join(wrapperRoot, 'package.json')

/**
 * Alpha.2's native landlock launcher is published by the upstream repository's
 * separate `native` release sequence, not by the `vendor` or `dsh` families
 * intentionally packed for this migration. The wrapper already carries the
 * exact 0.1.1 registry package and integrity in package-lock.json; preserve
 * that existing external dependency instead of inventing an unverified
 * tarball or silently allowing arbitrary missing @deepseek-ai packages.
 */
const APPROVED_EXTERNAL_RUNTIME_DEPENDENCIES = new Set([
  '@deepseek-ai/node-addon-landlock-run',
])

function dependencyNames(manifest) {
  return [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]
}

export function collectAlpha2RuntimeClosure(roots, packages, { localPackages = new Set() } = {}) {
  const pending = [...new Set(roots)]
  const visited = new Set()
  while (pending.length > 0) {
    const name = pending.pop()
    if (typeof name !== 'string' || !name.startsWith('@deepseek-ai/')) continue
    if (name.includes('/dsh-experimental-')) throw new Error(`experimental package is forbidden in runtime closure: ${name}`)
    if (APPROVED_EXTERNAL_RUNTIME_DEPENDENCIES.has(name)) continue
    if (localPackages.has(name) || visited.has(name)) continue
    const descriptor = packages.get(name)
    if (descriptor === undefined) {
      throw new Error(`Alpha.2 dependency is missing from the validated release families: ${name}`)
    }
    visited.add(name)
    for (const dependency of dependencyNames(descriptor.manifest)) {
      if (dependency.startsWith('@deepseek-ai/')) pending.push(dependency)
    }
  }
  return [...visited].sort()
}

export function runtimeTarballSpec(entry) {
  return `file:../${entry.file}`
}

function tarballManifest(entry) {
  const path = join(repositoryRoot, ...entry.file.split('/'))
  const result = spawnSync('tar', ['-xOf', path, 'package/package.json'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  })
  if (result.error) throw new Error(`cannot read ${entry.file}: ${result.error.message}`)
  if (result.status !== 0) throw new Error(`cannot read ${entry.file}: ${result.stderr.trim()}`)
  return JSON.parse(result.stdout)
}

function localPackageDescriptors(rootPackage) {
  const descriptors = []
  for (const [name, spec] of Object.entries(rootPackage.dependencies ?? {})) {
    if (typeof spec !== 'string' || !spec.startsWith('file:') || spec.includes('.tgz')) continue
    const directory = resolve(wrapperRoot, spec.slice('file:'.length))
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
    if (manifest.name !== name) throw new Error(`local dependency identity mismatch: ${name}`)
    descriptors.push({ name, manifest })
  }
  return descriptors
}

function updateAllowScripts(allowScripts, packages) {
  const updated = {}
  for (const [key, value] of Object.entries(allowScripts ?? {})) {
    const separator = key.lastIndexOf('@')
    const name = separator > 0 ? key.slice(0, separator) : key
    const descriptor = packages.get(name)
    updated[descriptor === undefined ? key : `${name}@${descriptor.entry.version}`] = value
  }
  return updated
}

export function buildAlpha2RootPackage(rootPackage, sourceManifest) {
  const packages = new Map(sourceManifest.packages.map(entry => [entry.name, {
    entry,
    manifest: tarballManifest(entry),
  }]))
  const locals = localPackageDescriptors(rootPackage)
  const localNames = new Set(locals.map(local => local.name))
  const roots = ['@deepseek-ai/dsh']
  for (const name of Object.keys(rootPackage.dependencies ?? {})) {
    if (packages.has(name) && !localNames.has(name)) roots.push(name)
  }
  for (const local of locals) {
    for (const name of dependencyNames(local.manifest)) {
      if (name.startsWith('@deepseek-ai/') && !localNames.has(name)) roots.push(name)
    }
  }

  const closure = collectAlpha2RuntimeClosure(roots, packages, { localPackages: localNames })
  const dependencies = {}
  for (const [name, spec] of Object.entries(rootPackage.dependencies ?? {})) {
    if (!packages.has(name) || localNames.has(name)) dependencies[name] = spec
  }
  for (const name of closure) dependencies[name] = runtimeTarballSpec(packages.get(name).entry)

  return {
    packageJson: {
      ...rootPackage,
      dependencies: Object.fromEntries(Object.entries(dependencies).sort(([left], [right]) => left.localeCompare(right))),
      allowScripts: updateAllowScripts(rootPackage.allowScripts, packages),
    },
    closure,
  }
}

export function writeAlpha2RuntimeDependencies() {
  const sourceManifest = verifyAlpha2Source()
  const rootPackage = JSON.parse(readFileSync(packagePath, 'utf8'))
  const { packageJson, closure } = buildAlpha2RootPackage(rootPackage, sourceManifest)
  writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8')
  return closure
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  if (!process.argv.includes('--write')) throw new Error('pass --write to update the wrapper runtime dependencies')
  const closure = writeAlpha2RuntimeDependencies()
  console.log(`[alpha2] wrote ${closure.length} fixed runtime tarball dependencies`)
}
