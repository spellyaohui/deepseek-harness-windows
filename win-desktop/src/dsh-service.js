import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import * as electron from 'electron'
import { healProfilesModuleFallback } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { getDesktopSettings } from './desktop-settings.js'
import { syncOpencodeCatalog } from './model-fetcher.js'

const { app } = electron

/** 官方 Web 服务就绪后会打印这一行，同时给出实际监听地址。 */
const READY_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:\d+)\b/m

export function resolveDshEntry() {
  return fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'))
}

export function resolveWindowsPickerPatch() {
  return fileURLToPath(new URL('../config/windows-directory-picker.patch.yml', import.meta.url))
}

export function resolveAutoModePatch() {
  return fileURLToPath(import.meta.resolve('@nanmicoder/dsh-auto-mode/cordis.patch.yml'))
}

/**
 * Dynamically generate the AgentTeams patch YAML from the current desktop
 * settings. These values are a first-launch migration envelope only; live
 * AgentTeams preferences are owned by the Harness settings scope.
 * @returns {string} absolute path to the generated patch file.
 */
function yamlScalar(value) {
  return JSON.stringify(String(value))
}

export function generateAgentTeamsPatch({
  getSettings = getDesktopSettings,
  getUserDataPath = () => app.getPath('userData'),
  makeDir = mkdirSync,
  writeFile = writeFileSync,
} = {}) {
  const settings = getSettings()
  const memberModel = typeof settings.agentTeamsMemberModel === 'string'
    ? settings.agentTeamsMemberModel.trim()
    : ''
  const memberProvider = typeof settings.agentTeamsMemberProvider === 'string'
    ? settings.agentTeamsMemberProvider.trim()
    : ''
  const memberReasoningEffort = typeof settings.agentTeamsMemberReasoningEffort === 'string'
    ? settings.agentTeamsMemberReasoningEffort.trim()
    : ''

  const lines = [
    '# Auto-generated from desktop settings — do not edit by hand.',
    '- insert:',
    '    - id: desktop-settings',
    "      name: '@deepseek-ai/dsh-desktop-settings'",
    '    - id: cpa-provider',
    "      name: '@deepseek-ai/dsh-cpa-provider'",
    '    - id: agent-teams',
    "      name: '@nanmicoder/dsh-agent-teams'",
    '      config:',
    '        stateDir: .agent-teams',
    '        memberProvider: spawn',
  ]
  if (memberProvider !== '' || memberModel !== '' || memberReasoningEffort !== '') {
    lines.push('        legacyDesktopSettings:')
    if (memberProvider !== '') lines.push(`          provider: ${yamlScalar(memberProvider)}`)
    if (memberModel !== '') lines.push(`          model: ${yamlScalar(memberModel)}`)
    if (memberReasoningEffort !== '') lines.push(`          reasoningEffort: ${yamlScalar(memberReasoningEffort)}`)
  }
  lines.push(
    '    - id: session-markdown-export',
    "      name: '@deepseek-ai/dsh-session-markdown-export'",
  )

  const content = lines.join('\n') + '\n'
  const outPath = join(getUserDataPath(), 'agent-teams.patch.yml')
  try {
    makeDir(dirname(outPath), { recursive: true })
  } catch {
    // userData always exists.
  }
  writeFile(outPath, content, 'utf8')
  return outPath
}

// Static overlay path retained for callers that build arguments without
// desktop settings. The live service uses generateAgentTeamsPatch() below.
export function resolveAgentTeamsPatch() {
  return fileURLToPath(new URL('../config/agent-teams.patch.yml', import.meta.url))
}

/** ESM preload that hides Windows console windows for tool/sandbox spawns. */
export function resolveWinHideConsoleImport() {
  return new URL('./win-hide-console.mjs', import.meta.url).href
}

export function resolveDesktopInstallAnchor() {
  return fileURLToPath(new URL('../package.json', import.meta.url))
}

/**
 * Out-of-tree plugins are imported from `$DSH_HOME/profiles/<name>`. Official
 * dsh only heals packages in `@deepseek-ai/dsh`'s dependency closure into
 * `$DSH_HOME/profiles/node_modules`. Desktop extras such as dsh-auto-mode and
 * dsh-agent-teams live on this wrapper's package.json, so they need a second
 * heal from that anchor.
 */
export function healDesktopPluginFallback({
  installAnchor = resolveDesktopInstallAnchor(),
  home = resolveDshHome(),
} = {}) {
  healProfilesModuleFallback(installAnchor, home)
}

export function extractReadyUrl(output) {
  return READY_PATTERN.exec(output)?.[1]
}

function fetchMigrationStatusWithin(fetcher, statusUrl, timeoutMs, {
  setTimeoutFn,
  clearTimeoutFn,
}) {
  const controller = new AbortController()
  return new Promise((resolve) => {
    let settled = false
    let timeoutId
    const finish = (value) => {
      if (settled) return
      settled = true
      if (timeoutId !== undefined) clearTimeoutFn(timeoutId)
      resolve(value)
    }
    timeoutId = setTimeoutFn(() => {
      controller.abort()
      finish(undefined)
    }, timeoutMs)
    try {
      Promise.resolve(fetcher(statusUrl, { signal: controller.signal })).then(
        async (response) => {
          if (!response?.ok) {
            finish(undefined)
            return
          }
          try {
            finish(await response.json())
          } catch {
            finish(undefined)
          }
        },
        () => finish(undefined),
      )
    } catch {
      finish(undefined)
    }
  })
}

/**
 * Wait for the host to confirm that it durably recorded the one-time desktop
 * migration. Any unavailable or incomplete response leaves the legacy values
 * intact for a later launch.
 */
export async function confirmAgentTeamsMigration(serviceUrl, {
  fetcher = globalThis.fetch,
  timeoutMs = 5_000,
  pollMs = 250,
  now = () => Date.now(),
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  const statusUrl = new URL('/plugins/dsh-agent-teams/migration-status', serviceUrl).toString()
  const deadline = now() + timeoutMs
  while (now() <= deadline) {
    const remaining = deadline - now()
    if (remaining <= 0) return false
    const status = await fetchMigrationStatusWithin(fetcher, statusUrl, remaining, {
      setTimeoutFn,
      clearTimeoutFn,
    })
    if (status === undefined) return false
    if (status?.complete === true) return true
    const remainingAfterResponse = deadline - now()
    if (remainingAfterResponse <= 0) return false
    await sleep(Math.min(pollMs, remainingAfterResponse))
  }
  return false
}

/** Keep startup running unless the migration handshake explicitly confirms. */
export async function applyConfirmedAgentTeamsMigration(serviceUrl, {
  confirm = confirmAgentTeamsMigration,
  remove,
} = {}) {
  let complete
  try {
    complete = await confirm(serviceUrl)
  } catch {
    // The next launch retries migration; boot must not be blocked.
    return
  }
  if (complete === true) remove?.()
}

export function buildDshArgs(entry, {
  platform = process.platform,
  windowsPickerPatch = resolveWindowsPickerPatch(),
  autoModePatch = resolveAutoModePatch(),
  agentTeamsPatch = resolveAgentTeamsPatch(),
  winHideConsoleImport = resolveWinHideConsoleImport(),
} = {}) {
  return [
    ...(platform === 'win32' ? ['--import', winHideConsoleImport] : []),
    '--expose-internals',
    entry,
    'web',
    ...(platform === 'win32' ? ['--patch', windowsPickerPatch] : []),
    '--patch',
    autoModePatch,
    '--patch',
    agentTeamsPatch,
    '--host',
    '127.0.0.1',
    '--port',
    '0',
    // Official `dsh web` opens the default browser; the Electron window already
    // loads the same loopback URL.
    '--no-open',
  ]
}

/**
 * 用 Electron 自带的 Node（ELECTRON_RUN_AS_NODE）拉起官方 dsh Web。
 * 这样原生模块与打包进应用的运行时 ABI 一致，无需再附带一份 node.exe。
 */
export function startDshService({
  electronExecutable,
  entry = resolveDshEntry(),
  environment = process.env,
  platform = process.platform,
  timeoutMs = 90_000,
} = {}) {
  if (!electronExecutable) {
    throw new Error('缺少 Electron 可执行文件路径')
  }

  healDesktopPluginFallback({
    home: resolveDshHome(undefined, environment),
  })

  // Start syncing the pi-ai model catalog in the background. This function
  // must remain synchronous because callers need the service handle
  // immediately; the catalog module already falls back safely on errors.
  void syncOpencodeCatalog()
    .then((result) => {
      if (result.error !== undefined) {
        console.warn(`[dsh-service] OpenCode model sync skipped: ${result.error}`)
      } else if (result.added > 0) {
        console.log(`[dsh-service] OpenCode catalog synced: +${result.added} new model(s)`)
      }
    })
    .catch((error) => {
      console.warn(`[dsh-service] OpenCode model sync failed: ${String(error)}`)
    })

  // Generate the AgentTeams patch from desktop settings before launching.
  const agentTeamsPatch = generateAgentTeamsPatch()

  const child = spawn(electronExecutable, buildDshArgs(entry, { platform, agentTeamsPatch }), {
    env: {
      ...environment,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let output = ''
  let settled = false

  const ready = new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      callback(value)
    }

    const inspect = (chunk) => {
      output += chunk.toString()
      const url = extractReadyUrl(output)
      if (url) finish(resolve, url)
    }

    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('error', (error) => finish(reject, error))
    child.once('exit', (code, signal) => {
      finish(
        reject,
        new Error(
          `DeepSeek Harness 在就绪前退出（code=${String(code)}, signal=${String(signal)}）。\n${output}`,
        ),
      )
    })

    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      finish(reject, new Error(`DeepSeek Harness 在 ${timeoutMs}ms 内未能就绪。\n${output}`))
    }, timeoutMs)
  })

  const stop = () => {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGTERM')
    }
  }

  return { child, ready, stop }
}
