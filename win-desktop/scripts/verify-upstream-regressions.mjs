import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const wrapperRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const gates = [
  ['models-settings-plugin', 'pnpm', ['test']],
  ['cpa-provider-plugin', 'pnpm', ['test']],
  ['agent-teams-plugin', 'pnpm', ['test']],
  ['session-markdown-export-plugin', 'pnpm', ['test']],
  ['.', 'npm', ['run', 'sync:local-plugin-artifacts']],
  ['.', 'node', ['scripts/verify-alpha2-runtime-closure.mjs', '--from', 'node_modules']],
  ['.', 'npm', ['test']],
]

function platformCommand(command) {
  return command === 'node' ? process.execPath : process.platform === 'win32' ? `${command}.cmd` : command
}

function runGate(command, args, options) {
  const executable = platformCommand(command)
  if (process.platform === 'win32' && command !== 'node') {
    return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', executable, ...args], options)
  }
  return spawnSync(executable, args, options)
}

const pnpmGateEnv = {
  ...process.env,
  // pnpm 11 otherwise repairs stale dependency state before a script runs.
  // This gate is forbidden from mutating node_modules or resolving anything,
  // so stale local dependencies must fail closed and be repaired beforehand.
  pnpm_config_verify_deps_before_run: 'false',
}

for (const [directory, command, args] of gates) {
  const label = `${directory} ${command} ${args.join(' ')}`
  console.log(`[upstream-regression] START ${label}`)

  const result = runGate(command, args, {
    cwd: join(wrapperRoot, directory),
    env: command === 'pnpm' ? pnpmGateEnv : process.env,
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(`[upstream-regression] FAIL ${label} spawn=${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`[upstream-regression] FAIL ${label} exit=${result.status ?? 1}`)
    process.exit(result.status ?? 1)
  }

  console.log(`[upstream-regression] PASS ${label}`)
}
