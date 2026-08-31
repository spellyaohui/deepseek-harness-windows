import childProcess from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { syncBuiltinESMExports } from 'node:module'

const originalSpawn = childProcess.spawn
const originalSpawnSync = childProcess.spawnSync

function commandPath(command) {
  if (process.platform !== 'win32' || !['npm', 'npx', 'pnpm'].includes(command)) return undefined
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (directory.length === 0) continue
    const candidate = join(directory, `${command}.cmd`)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

function invocation(command, args) {
  const script = commandPath(command)
  return script === undefined
    ? { command, args }
    : {
        command: process.env.ComSpec ?? 'cmd.exe',
        args: ['/d', '/s', '/c', `${command}.cmd`, ...args],
      }
}

childProcess.spawn = function patchedSpawn(command, args = [], options = {}) {
  const call = invocation(command, args)
  const quiet = process.env.DSH_RELEASE_QUIET === '1' && command === 'pnpm' && options.stdio === 'inherit'
  return originalSpawn.call(childProcess, call.command, call.args, quiet
    ? { ...options, stdio: ['inherit', 'ignore', 'inherit'] }
    : options)
}

childProcess.spawnSync = function patchedSpawnSync(command, args = [], options = {}) {
  const call = invocation(command, args)
  return originalSpawnSync.call(childProcess, call.command, call.args, options)
}

syncBuiltinESMExports()
