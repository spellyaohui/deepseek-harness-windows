import { readFileSync } from 'node:fs'
import { basename, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const DESKTOP_ENTRIES = new Map([
  ['desktop-settings', '@deepseek-ai/dsh-desktop-settings'],
  ['cpa-provider', '@deepseek-ai/dsh-cpa-provider'],
  ['tool-call-guidance', '@deepseek-ai/dsh-tool-call-guidance'],
  ['output-limit-finish', 'dsh-output-limit-finish'],
  ['agent-teams', '@nanmicoder/dsh-agent-teams'],
])
const LAYER_IMPORT = new URL('./desktop-profile-layer.js', import.meta.url).href
const LAYER_MARKER = '__dshDesktopProfileLayer'
const LAYER_NEEDLE = '\tconst patchPath = join(dir, PROFILE_PATCH_FILENAME);\n\tconst patches = options.userLayer !== false'

/** Desktop-owned defaults precede profile/home/CLI edits, without changing user files. */
export function readDesktopProfileLayer(dir, patchPath = process.env.DSH_DESKTOP_STARTUP_PATCH) {
  // The console preload also reaches child processes; only the desktop's Web
  // profile receives these defaults, never an unrelated headless/custom profile.
  if (basename(dir) !== 'web' || patchPath === undefined) return []
  if (!isAbsolute(patchPath)) throw new Error('Desktop startup patch must use an absolute path')
  const patches = yaml.load(readFileSync(patchPath, 'utf8'))
  const entries = patches?.[0]?.insert
  if (!Array.isArray(patches) || patches.length !== 1
    || Object.keys(patches[0] ?? {}).some(key => key !== 'insert')
    || !Array.isArray(entries) || entries.length !== DESKTOP_ENTRIES.size
    || new Set(entries.map(entry => entry?.id)).size !== DESKTOP_ENTRIES.size
    || entries.some(entry => !DESKTOP_ENTRIES.has(entry?.id)
      || DESKTOP_ENTRIES.get(entry.id) !== entry.name
      || Object.keys(entry).some(key => !['id', 'name', 'config'].includes(key)))) {
    throw new Error('Desktop startup patch must contain only the owned desktop plugin insertions')
  }
  return [{
    packageName: 'deepseek-harness-windows',
    packageDir: fileURLToPath(new URL('..', import.meta.url)),
    patchPaths: [patchPath],
    patches,
  }]
}

/** Reapply one guarded composition seam to the pinned official app-boot output. */
export function rewriteDesktopProfileLayer(source, moduleUrl) {
  const url = decodeURIComponent(String(moduleUrl)).replaceAll('\\', '/')
  if (!url.endsWith('/@deepseek-ai/dsh-app-boot/lib/index.js') || source.includes(LAYER_MARKER)) return source
  const first = source.indexOf(LAYER_NEEDLE)
  if (first === -1 || source.indexOf(LAYER_NEEDLE, first + LAYER_NEEDLE.length) !== -1) {
    throw new Error('Desktop default profile layer composition drift')
  }
  return `import { readDesktopProfileLayer as ${LAYER_MARKER} } from ${JSON.stringify(LAYER_IMPORT)};\n`
    + source.replace(LAYER_NEEDLE, `\tlayers.push(...${LAYER_MARKER}(dir));\n${LAYER_NEEDLE}`)
}
