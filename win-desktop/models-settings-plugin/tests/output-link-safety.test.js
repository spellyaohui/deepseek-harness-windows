import assert from 'node:assert/strict'
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { detachGeneratedOutputs } from '../scripts/detach-output-links.mjs'

test('detaches hardlinked generated outputs without changing their bytes', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-model-output-'))
  try {
    const original = join(root, 'original.bin')
    const output = join(root, 'lib', 'client.js.map')
    writeFileSync(original, 'stable generated output')
    mkdirSync(join(root, 'lib'))
    linkSync(original, output)
    const before = readFileSync(output)

    assert.equal(detachGeneratedOutputs(join(root, 'lib')), 1)
    assert.deepEqual(readFileSync(output), before)
    assert.equal(statSync(output).nlink, 1)
    assert.equal(existsSync(original), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
