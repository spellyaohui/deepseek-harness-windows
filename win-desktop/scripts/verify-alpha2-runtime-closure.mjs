import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const wrapperRoot = resolve(dirname(scriptPath), '..')

export const REQUIRED_RUNTIME_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/cordis',
  '@deepseek-ai/cordis-plugin-loader',
  '@deepseek-ai/cordis-plugin-include',
  'js-yaml',
  'argparse',
])

function readJson(path, label = path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`cannot read ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function toPosix(path) {
  return path.replaceAll('\\', '/')
}

function findManifestAbove(entryPath, expectedName) {
  let directory = dirname(entryPath)
  while (true) {
    const candidate = join(directory, 'package.json')
    if (existsSync(candidate)) {
      const manifest = readJson(candidate)
      if (manifest.name === expectedName) return candidate
    }
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

function findNodeModulesManifest(requiringPath, name) {
  let directory = dirname(requiringPath)
  const segments = name.split('/')
  while (true) {
    const candidate = join(directory, 'node_modules', ...segments, 'package.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(directory)
    if (parent === directory) return undefined
    directory = parent
  }
}

function resolvePackageManifest(name, requiringPath) {
  const require = createRequire(pathToFileURL(requiringPath))
  try {
    const exportedManifestPath = require.resolve(`${name}/package.json`)
    const manifestPath = findManifestAbove(exportedManifestPath, name)
    if (manifestPath !== undefined) return manifestPath
  } catch {
    // Packages with an exports map often hide package.json. Resolve their
    // runtime entry and walk back to the owning manifest instead.
  }

  try {
    const entryPath = require.resolve(name)
    const manifestPath = findManifestAbove(entryPath, name)
    if (manifestPath !== undefined) return manifestPath
  } catch {
    // A package can intentionally expose no default entry. Node's remaining
    // lookup rule is still an ancestor node_modules directory.
  }

  return findNodeModulesManifest(requiringPath, name)
}

function dependencyEdges(manifest) {
  const edges = []
  const required = new Set()
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    required.add(name)
    edges.push({ name, optional: false })
  }
  for (const name of Object.keys(manifest.optionalDependencies ?? {})) {
    if (!required.has(name)) edges.push({ name, optional: true })
  }
  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (required.has(name)) continue
    const optional = manifest.peerDependenciesMeta?.[name]?.optional === true
    edges.push({ name, optional })
  }
  return edges
}

export function resolveVerificationTarget(from, { wrapperRoot: root = wrapperRoot } = {}) {
  if (typeof from !== 'string' || from.trim() === '') throw new Error('--from must name node_modules or an unpacked app root')
  const absolute = resolve(root, from)
  const sourceNodeModules = resolve(root, 'node_modules')
  const appCandidates = absolute === sourceNodeModules
    ? [root]
    : [absolute, join(absolute, 'resources', 'app')]
  const appRoot = appCandidates.find(candidate => existsSync(join(candidate, 'src', 'dsh-service.js')))
  if (appRoot === undefined) {
    throw new Error(`cannot find src/dsh-service.js under verification target: ${absolute}`)
  }
  const packagePath = join(appRoot, 'package.json')
  if (!existsSync(packagePath)) throw new Error(`runtime package manifest is missing: ${packagePath}`)
  return {
    appRoot: resolve(appRoot),
    anchorPath: resolve(appRoot, 'src', 'dsh-service.js'),
    packagePath: resolve(packagePath),
  }
}

export function verifyRuntimeClosure({
  appRoot,
  requiredPackages = REQUIRED_RUNTIME_PACKAGES,
} = {}) {
  if (typeof appRoot !== 'string' || appRoot.trim() === '') throw new Error('appRoot is required')
  const absoluteAppRoot = resolve(appRoot)
  const anchorPath = resolve(absoluteAppRoot, 'src', 'dsh-service.js')
  const packagePath = resolve(absoluteAppRoot, 'package.json')
  if (!existsSync(anchorPath)) throw new Error(`runtime anchor is missing: ${anchorPath}`)
  const rootManifest = readJson(packagePath, 'runtime package.json')
  const pending = Object.keys(rootManifest.dependencies ?? {}).map(name => ({
    name,
    requiringPath: anchorPath,
    requiredBy: rootManifest.name ?? '<app>',
    optional: false,
  }))
  const visited = new Set()
  const packages = []
  const omittedOptional = []

  while (pending.length > 0) {
    const edge = pending.pop()
    const manifestPath = resolvePackageManifest(edge.name, edge.requiringPath)
    if (manifestPath === undefined) {
      if (edge.optional) {
        omittedOptional.push({ name: edge.name, requiredBy: edge.requiredBy })
        continue
      }
      throw new Error(`cannot resolve runtime dependency ${edge.name} required by ${edge.requiredBy}`)
    }

    const realManifestPath = realpathSync(manifestPath)
    if (visited.has(realManifestPath)) continue
    const manifest = readJson(realManifestPath, `${edge.name} package.json`)
    if (manifest.name !== edge.name) {
      throw new Error(`runtime dependency identity mismatch: requested ${edge.name}, found ${String(manifest.name)}`)
    }
    visited.add(realManifestPath)
    packages.push({
      name: manifest.name,
      version: manifest.version,
      manifestPath: toPosix(relative(absoluteAppRoot, realManifestPath)),
    })
    for (const dependency of dependencyEdges(manifest)) {
      pending.push({
        ...dependency,
        requiringPath: realManifestPath,
        requiredBy: manifest.name,
      })
    }
  }

  packages.sort((left, right) => left.name.localeCompare(right.name) || left.manifestPath.localeCompare(right.manifestPath))
  const required = requiredPackages.map(name => {
    const descriptor = packages.find(entry => entry.name === name)
    if (descriptor === undefined) throw new Error(`release-critical runtime dependency is missing: ${name}`)
    return descriptor
  })
  const alpha2Packages = packages.filter(entry => entry.version === '0.1.2-alpha.2')

  return {
    appRoot: absoluteAppRoot,
    anchorPath,
    packagePath,
    packages,
    required,
    alpha2Packages,
    omittedOptional,
  }
}

function parseFromArgument(argv) {
  const index = argv.indexOf('--from')
  if (index < 0 || index + 1 >= argv.length) throw new Error('usage: node scripts/verify-alpha2-runtime-closure.mjs --from <node_modules|unpacked-root>')
  return argv[index + 1]
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  const target = resolveVerificationTarget(parseFromArgument(process.argv.slice(2)))
  const result = verifyRuntimeClosure({ appRoot: target.appRoot })
  console.log(`[runtime-closure] anchor ${result.anchorPath}`)
  console.log(`[runtime-closure] resolved ${result.packages.length} production packages (${result.alpha2Packages.length} Alpha.2 packages)`)
  for (const entry of result.required) {
    console.log(`[runtime-closure] ${entry.name}@${entry.version} -> ${entry.manifestPath}`)
  }
  if (result.omittedOptional.length > 0) {
    console.log(`[runtime-closure] omitted ${result.omittedOptional.length} unavailable optional dependencies`)
  }
}
