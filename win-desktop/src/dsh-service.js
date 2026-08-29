import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import * as electron from 'electron'
import { healProfilesModuleFallback } from '@deepseek-ai/dsh-app-boot'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { getDesktopSettings } from './desktop-settings.js'
import {
  getAgentTeamsProfileSnapshot,
  readAgentTeamsProfiles,
} from './agent-teams-profile-store.js'

const { app } = electron

/** 官方 Web 服务就绪后会打印这一行，同时给出实际监听地址。 */
const READY_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:\d+)\b/m

export function resolveDshEntry() {
  return fileURLToPath(import.meta.resolve('@deepseek-ai/dsh/lib/bin.js'))
}

export function resolveWindowsPickerPatch() {
  return fileURLToPath(new URL('../config/windows-directory-picker.patch.yml', import.meta.url))
}

/**
 * Dynamically generate the AgentTeams patch YAML from the current desktop
 * settings. Profiles are persisted by the desktop host so the live service
 * receives the same user-edited map on every launch.
 * @returns {string} absolute path to the generated patch file.
 */
export function generateAgentTeamsPatch({
  getSettings = getDesktopSettings,
  getProfiles,
  getUserDataPath = () => app.getPath('userData'),
  makeDir = mkdirSync,
  writeFile = writeFileSync,
} = {}) {
  const settings = getSettings()
  const profileSnapshot = typeof getProfiles === 'function'
    ? getProfiles()
    : getAgentTeamsProfileSnapshot({ settings })
  const profiles = readAgentTeamsProfiles({
    agentTeamsProfiles: profileSnapshot,
  })
  const lines = [
    '# Auto-generated from desktop settings — do not edit by hand.',
    '- insert:',
    '    - id: desktop-settings',
    "      name: '@deepseek-ai/dsh-desktop-settings'",
    '    - id: cpa-provider',
    "      name: '@deepseek-ai/dsh-cpa-provider'",
    '    - id: opencode-capabilities',
    "      name: '@deepseek-ai/dsh-opencode-capabilities'",
    '    - id: agent-teams',
    "      name: '@nanmicoder/dsh-agent-teams'",
    '      config:',
    '        stateDir: .agent-teams',
    '        memberProvider: spawn',
    `        profiles: ${JSON.stringify(profiles)}`,
  ]
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
 * `$DSH_HOME/profiles/node_modules`. Wrapper-owned desktop plugins live on
 * this package.json, so they need a second heal from that anchor.
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

export function buildDshArgs(entry, {
  platform = process.platform,
  windowsPickerPatch = resolveWindowsPickerPatch(),
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
