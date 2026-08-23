import { spawnSync } from 'node:child_process'

const result = spawnSync('cmd', ['/c', 'echo hide-console-ok'], { encoding: 'utf8' })
if (result.status !== 0) {
  process.stderr.write(result.stderr || `exit ${String(result.status)}`)
  process.exit(result.status ?? 1)
}
process.stdout.write(result.stdout)
