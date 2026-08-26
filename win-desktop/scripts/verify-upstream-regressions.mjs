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
  ['.', 'npm', ['test']],
]

function platformCommand(command) {
  return process.platform === 'win32' ? `${command}.cmd` : command
}

function runGate(command, args, options) {
  const executable = platformCommand(command)
  if (process.platform === 'win32') {
    return spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', executable, ...args], options)
  }
  return spawnSync(executable, args, options)
}

for (const [directory, command, args] of gates) {
  const label = `${directory} ${command} ${args.join(' ')}`
  console.log(`[upstream-regression] START ${label}`)

  const result = runGate(command, args, {
    cwd: join(wrapperRoot, directory),
    env: process.env,
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
