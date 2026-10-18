import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const wrapperRoot = dirname(dirname(fileURLToPath(import.meta.url)))

export const LOCAL_PLUGIN_ARTIFACTS = Object.freeze([
  ['models-settings-plugin', '@deepseek-ai/dsh-client-ui-settings-models'],
  ['desktop-settings-plugin', '@deepseek-ai/dsh-desktop-settings'],
  ['tool-call-guidance-plugin', '@deepseek-ai/dsh-tool-call-guidance'],
  ['output-limit-finish-plugin', 'dsh-output-limit-finish'],
  ['superpowers-plugin', '@deepseek-ai/dsh-superpowers'],
  ['agent-teams-plugin', '@nanmicoder/dsh-agent-teams'],
])

function copyDirectory(source, destination, fs) {
  fs.mkdirSync(destination, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name)
    const destinationPath = join(destination, entry.name)
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath, fs)
      continue
    }
    if (!entry.isFile()) {
      throw new Error(`Local plugin lib contains an unsupported entry: ${sourcePath}`)
    }
    fs.copyFileSync(sourcePath, destinationPath)
  }
}

function copyableEntry(path, fs) {
  const entry = fs.lstatSync(path)
  if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
    throw new Error(`Local plugin published file is unsupported: ${path}`)
  }
  return entry
}

function copyPublishedPath(source, destination, fs) {
  const entry = copyableEntry(source, fs)
  fs.rmSync(destination, { recursive: true, force: true })
  if (entry.isDirectory()) {
    copyDirectory(source, destination, fs)
  } else {
    fs.mkdirSync(dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
}

export function declaredPublishedFilePaths(manifest) {
  if (manifest.files === undefined) return []
  if (!Array.isArray(manifest.files)) throw new Error('Local plugin published files must be an array')
  return manifest.files.flatMap((raw) => {
    if (typeof raw !== 'string') throw new Error('Local plugin published file must be a string')
    const path = raw.trim().replaceAll('\\', '/')
    const segments = path.split('/').filter(Boolean)
    if (
      path === '' || path.startsWith('/') || /^[A-Za-z]:/u.test(path)
      || segments.includes('..') || segments.includes('.')
      || ['src', 'test', 'tests', 'node_modules'].includes(segments[0])
    ) {
      throw new Error(`Local plugin published file is unsafe: ${raw}`)
    }
    return path === 'lib' || path === 'package.json' ? [] : [path]
  })
}

export function synchronizeLocalPluginArtifacts({
  root = wrapperRoot,
  artifacts = LOCAL_PLUGIN_ARTIFACTS,
  fs = { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync },
} = {}) {
  const synchronized = []

  for (const [sourceName, packageName] of artifacts) {
    const sourceLib = join(root, sourceName, 'lib')
    const sourceManifest = join(root, sourceName, 'package.json')
    const sourceRoot = join(root, sourceName)
    const installedRoot = join(root, 'node_modules', ...packageName.split('/'))
    const installedLib = join(installedRoot, 'lib')
    const installedManifest = join(installedRoot, 'package.json')

    if (!fs.existsSync(sourceLib)) {
      throw new Error(`Local plugin build output is missing: ${sourceLib}`)
    }
    if (!fs.existsSync(sourceManifest)) {
      throw new Error(`Local plugin package metadata is missing: ${sourceManifest}`)
    }
    if (!fs.existsSync(installedRoot)) {
      throw new Error(`Installed local plugin is missing: ${installedRoot}`)
    }

    const publishedPaths = declaredPublishedFilePaths(JSON.parse(fs.readFileSync(sourceManifest, 'utf8')))
    copyableEntry(sourceLib, fs)
    for (const path of publishedPaths) {
      const sourcePath = join(sourceRoot, ...path.split('/'))
      if (!fs.existsSync(sourcePath)) throw new Error(`Local plugin published file is missing: ${sourcePath}`)
      copyableEntry(sourcePath, fs)
    }

    fs.rmSync(installedLib, { recursive: true, force: true })
    copyDirectory(sourceLib, installedLib, fs)
    fs.copyFileSync(sourceManifest, installedManifest)
    for (const path of publishedPaths) {
      copyPublishedPath(join(sourceRoot, ...path.split('/')), join(installedRoot, ...path.split('/')), fs)
    }

    if (!fs.readdirSync(installedLib).length) {
      throw new Error(`Local plugin artifact synchronization produced an empty lib directory: ${installedLib}`)
    }

    synchronized.push({ sourceName, packageName })
  }

  return synchronized
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const synchronized = synchronizeLocalPluginArtifacts()
  console.log(`[local-plugin-artifacts] synchronized ${synchronized.length} local plugin bundles`)
}
