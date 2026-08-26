import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const wrapperRoot = dirname(dirname(fileURLToPath(import.meta.url)))

export const LOCAL_PLUGIN_ARTIFACTS = Object.freeze([
  ['models-settings-plugin', '@deepseek-ai/dsh-client-ui-settings-models'],
  ['cpa-provider-plugin', '@deepseek-ai/dsh-cpa-provider'],
  ['desktop-settings-plugin', '@deepseek-ai/dsh-desktop-settings'],
  ['agent-teams-plugin', '@nanmicoder/dsh-agent-teams'],
  ['session-markdown-export-plugin', '@deepseek-ai/dsh-session-markdown-export'],
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

export function synchronizeLocalPluginArtifacts({
  root = wrapperRoot,
  artifacts = LOCAL_PLUGIN_ARTIFACTS,
  fs = { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync },
} = {}) {
  const synchronized = []

  for (const [sourceName, packageName] of artifacts) {
    const sourceLib = join(root, sourceName, 'lib')
    const installedRoot = join(root, 'node_modules', ...packageName.split('/'))
    const installedLib = join(installedRoot, 'lib')

    if (!fs.existsSync(sourceLib)) {
      throw new Error(`Local plugin build output is missing: ${sourceLib}`)
    }
    if (!fs.existsSync(installedRoot)) {
      throw new Error(`Installed local plugin is missing: ${installedRoot}`)
    }

    fs.rmSync(installedLib, { recursive: true, force: true })
    copyDirectory(sourceLib, installedLib, fs)

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
