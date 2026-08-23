import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const serviceFile = fileURLToPath(new URL('../src/dsh-service.js', import.meta.url))

test('dsh service is valid JavaScript before Electron starts', () => {
  const result = spawnSync(process.execPath, ['--check', serviceFile], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
})
