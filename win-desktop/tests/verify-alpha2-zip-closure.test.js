import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compareManifestHashes,
  validateArchiveEntries,
} from '../scripts/verify-alpha2-zip-closure.mjs'

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
