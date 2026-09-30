import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const FINGERPRINT = /^[a-f0-9]{64}$/u

/** Confirm a fresh, read-only inspection before the official worker changes HKCU PATH. */
export async function manageDshCommand({ inspect, mutate, confirm, installed }) {
  if (!installed) throw new Error('dsh command management requires an installed application')
  const before = await inspect()
  if (!before.available) throw new Error('installed dsh launcher is unavailable')
  if (!FINGERPRINT.test(before.fingerprint)) throw new Error('invalid command inspection fingerprint')
  const operation = before.managed ? 'remove' : 'install'
  if (operation === 'install' && before.machineCommand) {
    throw new Error(`system PATH already provides dsh and takes precedence over user PATH: ${before.machineCommand}`)
  }
  if (!(await confirm({ operation, state: before, foreignCommand: before.occupied && !before.managed }))) {
    return 'cancelled'
  }
  const fresh = await inspect()
  if (fresh.fingerprint !== before.fingerprint) throw new Error('PATH changed after confirmation')
  if (operation === 'install' && fresh.machineCommand) throw new Error('system PATH command appeared after confirmation')
  await mutate(operation, before.fingerprint)
  return operation
}

/** Run the upstream Windows ownership worker with the local machine-PATH guard. */
export async function runCommandPath({ operation, expected = '', directory, script }) {
  if (!['inspect', 'install', 'remove'].includes(operation)) throw new Error('invalid dsh command operation')
  if (operation !== 'inspect' && !FINGERPRINT.test(expected)) throw new Error('invalid command confirmation')
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR
  if (!systemRoot) throw new Error('Windows system directory is unavailable')
  const executable = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script]
  const result = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.once('error', reject)
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.once('close', code => resolve({ code, stdout, stderr }))
    child.stdin.end(JSON.stringify({ operation, expected, directory }))
  })
  if (result.stdout.length > 65_536 || result.stderr.length > 65_536) throw new Error('dsh command worker output is too large')
  let response
  try { response = JSON.parse(result.stdout.trim()) } catch {
    throw new Error(`dsh command worker failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`)
  }
  if (result.code !== 0 || response?.ok !== true) {
    throw new Error(response?.message ?? 'dsh command worker failed')
  }
  return response.state
}

/** Fixed resources from this installed wrapper, never model- or user-supplied paths. */
export function installedCommandActions(appPath) {
  const directory = join(appPath, 'assets', 'cli')
  const script = join(directory, 'command-path.ps1')
  const launcher = join(directory, 'dsh.cmd')
  const cli = join(appPath, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  return {
    inspect: async () => {
      const state = await runCommandPath({ operation: 'inspect', directory, script })
      return {
        ...state,
        available: existsSync(launcher) && existsSync(cli) && existsSync(script),
        occupied: Boolean(state.activeCommand) && !state.managed,
      }
    },
    mutate: (operation, expected) => runCommandPath({ operation, expected, directory, script }),
  }
}
