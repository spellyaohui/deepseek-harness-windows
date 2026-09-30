import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  collectManifestHashes,
  compareManifestHashes,
  validateArchiveEntries,
} from '../scripts/verify-alpha2-zip-closure.mjs'

test('ZIP closure includes the installed dsh command launcher and worker', t => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-command-closure-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const directory of ['node_modules', 'src', 'assets/cli']) mkdirSync(join(root, directory), { recursive: true })
  for (const file of ['package.json', 'src/dsh-service.js', 'assets/cli/dsh.cmd', 'assets/cli/command-path.ps1']) {
    writeFileSync(join(root, file), file)
  }
  const hashes = collectManifestHashes(root)
  assert.equal(hashes.has('assets/cli/dsh.cmd'), true)
  assert.equal(hashes.has('assets/cli/command-path.ps1'), true)
})

test('ZIP closure rejects absolute and parent-traversal entries', () => {
  assert.throws(() => validateArchiveEntries(['../escape.txt']), /unsafe ZIP entry/u)
  assert.throws(() => validateArchiveEntries(['folder/../../escape.txt']), /unsafe ZIP entry/u)
  assert.throws(() => validateArchiveEntries(['/absolute.txt']), /unsafe ZIP entry/u)
  assert.throws(() => validateArchiveEntries(['C:/absolute.txt']), /unsafe ZIP entry/u)
  assert.doesNotThrow(() => validateArchiveEntries(['resources/app/package.json']))
})

test('ZIP closure requires the exact unpacked manifest set and bytes', () => {
  const expected = new Map([
    ['package.json', 'aaa'],
    ['node_modules/example/package.json', 'bbb'],
  ])

  assert.equal(compareManifestHashes(expected, new Map(expected)), 2)
  assert.throws(
    () => compareManifestHashes(expected, new Map([['package.json', 'aaa']])),
    /manifest count mismatch/u,
  )
  assert.throws(
    () => compareManifestHashes(expected, new Map([
      ['package.json', 'aaa'],
      ['node_modules/example/package.json', 'changed'],
    ])),
    /ZIP manifest differs/u,
  )
})
