import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const wrapperRoot = resolve(dirname(scriptPath), '..')
const EXPECTED_DSH_HOST_VERSION = '0.2.1-rc.2'

export const REQUIRED_RUNTIME_PACKAGES = Object.freeze([
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/cordis',
  '@deepseek-ai/cordis-plugin-loader',
  '@deepseek-ai/cordis-plugin-include',
  'js-yaml',
  'argparse',
  '@deepseek-ai/dsh-superpowers',
])

const SUPERPOWERS_COMMIT = 'bb92a77741419a4ab5f06e711a283343f1ada0c3'
const SUPERPOWERS_SKILLS = [
  'brainstorming', 'diagnosing-superpowers', 'dispatching-parallel-agents',
  'executing-plans', 'finishing-a-development-branch', 'receiving-code-review',
  'requesting-code-review', 'subagent-driven-development', 'systematic-debugging',
  'test-driven-development', 'using-git-worktrees', 'using-superpowers',
  'verification-before-completion', 'writing-plans', 'writing-skills',
]

export function verifySuperpowersAssets(packageRoot) {
  try {
    const lib = join(packageRoot, 'lib')
    const files = (directory, prefix = '') => {
      if (lstatSync(directory).isSymbolicLink()) throw new Error(`link: ${directory}`)
      return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = prefix + entry.name
        if (entry.isDirectory()) return files(join(directory, entry.name), path + '/')
        if (!entry.isFile()) throw new Error(`link or unsupported asset: ${path}`)
        return [path]
      })
    }
    if (lstatSync(packageRoot).isSymbolicLink()) throw new Error('package root is a link')
    const allFiles = files(lib)
    for (const path of ['index.js', 'dsh-tools.md', 'upstream-manifest.json', 'LICENSE']) {
      if (!allFiles.includes(path) || readFileSync(join(lib, path)).length === 0) throw new Error(`missing runtime asset: ${path}`)
    }
    const manifest = readJson(join(lib, 'upstream-manifest.json'))
    const expected = { repository: 'https://github.com/obra/superpowers', version: '7.0.0', tag: 'v7.0.0', commit: SUPERPOWERS_COMMIT }
    if (manifest.schemaVersion !== 1 || Object.entries(expected).some(([key, value]) => manifest.upstream?.[key] !== value)
      || !Array.isArray(manifest.skills) || JSON.stringify([...manifest.skills].sort()) !== JSON.stringify(SUPERPOWERS_SKILLS)
      || !Array.isArray(manifest.files) || manifest.files.length !== 75) throw new Error('fixed source manifest mismatch')
    const paths = []
    for (const entry of manifest.files) {
      if (typeof entry?.path !== 'string' || !/^(?:LICENSE|skills\/[a-z0-9-]+\/[^\\:]+)$/u.test(entry.path)
        || entry.path.split('/').some(segment => ['', '.', '..'].includes(segment))
        || !/^[0-9a-f]{64}$/u.test(entry.sha256)) throw new Error('unsafe asset path or hash')
      paths.push(entry.path)
      if (createHash('sha256').update(readFileSync(join(lib, entry.path))).digest('hex') !== entry.sha256) {
        throw new Error(`asset hash mismatch: ${entry.path}`)
      }
    }
    const originals = allFiles.filter(path => path === 'LICENSE' || path.startsWith('skills/')).sort()
    if (new Set(paths).size !== paths.length || JSON.stringify(paths.sort()) !== JSON.stringify(originals)
      || SUPERPOWERS_SKILLS.some(name => !paths.includes(`skills/${name}/SKILL.md`))) throw new Error('original asset file set mismatch')
    // Anchor the original Git blobs independently of a regenerated local manifest.
    const digest = createHash('sha256').update(manifest.files.map(entry =>
      `${entry.path}\t${entry.sha256}`).sort().join('\n')).digest('hex')
    if (digest !== '4b646fcbb694f25c32d5840657cc20becb1b0e9791a9de5d4081898cf09116c7') {
      throw new Error('fixed source asset digest mismatch')
    }
    return { skillCount: 15, assetCount: paths.length, commit: SUPERPOWERS_COMMIT }
  } catch (error) {
    throw new Error(`Superpowers asset verification failed: ${error.message}`, { cause: error })
  }
}

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
  for (const [name, spec] of Object.entries(manifest.dependencies ?? {})) {
    required.add(name)
    edges.push({ name, spec, optional: false })
  }
  for (const [name, spec] of Object.entries(manifest.optionalDependencies ?? {})) {
    if (!required.has(name)) edges.push({ name, spec, optional: true })
  }
  for (const [name, spec] of Object.entries(manifest.peerDependencies ?? {})) {
    if (required.has(name)) continue
    const optional = manifest.peerDependenciesMeta?.[name]?.optional === true
    edges.push({ name, spec, optional })
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
  const localOwners = new Set(Object.entries(rootManifest.dependencies ?? {})
    .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:') && !spec.endsWith('.tgz'))
    .map(([name]) => name))
  const pending = Object.entries(rootManifest.dependencies ?? {}).map(([name, spec]) => ({
    name,
    spec,
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
    const alias = typeof edge.spec === 'string' && edge.spec.startsWith('npm:')
      ? edge.spec.slice(4) : ''
    const aliasSeparator = alias.lastIndexOf('@')
    const declaredAlias = aliasSeparator > 0 && alias.slice(0, aliasSeparator) === manifest.name
      && alias.slice(aliasSeparator + 1) === manifest.version
    if (manifest.name !== edge.name && !declaredAlias) {
      throw new Error(`runtime dependency identity mismatch: requested ${edge.name}, found ${String(manifest.name)}`)
    }
    const isDsh = manifest.name === '@deepseek-ai/dsh' || manifest.name.startsWith('@deepseek-ai/dsh-')
    const directLocalPath = join(absoluteAppRoot, 'node_modules', ...manifest.name.split('/'), 'package.json')
    const localOwner = localOwners.has(manifest.name) && existsSync(directLocalPath)
      && realpathSync(directLocalPath) === realManifestPath
    if (isDsh && !localOwner && manifest.version !== EXPECTED_DSH_HOST_VERSION) {
      throw new Error(`${manifest.name}@${manifest.version} differs from pinned host ${EXPECTED_DSH_HOST_VERSION}`)
    }
    if (manifest.name === '@deepseek-ai/dsh-superpowers') verifySuperpowersAssets(dirname(realManifestPath))
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
  const rc1Packages = packages.filter(entry => entry.version === '0.1.2-rc.1')

  return {
    appRoot: absoluteAppRoot,
    anchorPath,
    packagePath,
    packages,
    required,
    rc1Packages,
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
  console.log(`[runtime-closure] resolved ${result.packages.length} production packages (${result.rc1Packages.length} RC.1 packages)`)
  for (const entry of result.required) {
    console.log(`[runtime-closure] ${entry.name}@${entry.version} -> ${entry.manifestPath}`)
  }
  const superpowers = result.packages.find(entry => entry.name === '@deepseek-ai/dsh-superpowers')
  if (superpowers) console.log('[runtime-closure] Superpowers assets', verifySuperpowersAssets(dirname(join(result.appRoot, superpowers.manifestPath))))
  if (result.omittedOptional.length > 0) {
    console.log(`[runtime-closure] omitted ${result.omittedOptional.length} unavailable optional dependencies`)
  }
}
