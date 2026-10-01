import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readInputManifest } from '../scripts/prepare-build-inputs.mjs'

test('clean build inputs cover both complete pinned archive families and reject unsafe paths', t => {
  const entries = readInputManifest()
  assert.equal(entries.filter(row => row.path.includes('dsh-v0.2.0-rc.2')).length, 327)
  assert.equal(entries.filter(row => row.path.includes('dsh-v0.1.7-rc.2')).length, 323)
  const root = mkdtempSync(join(tmpdir(), 'dsh-input-manifest-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'docs'))
  for (const name of ['UPSTREAM_017_SOURCE_MANIFEST.md', 'UPSTREAM_020_SOURCE_MANIFEST.md']) writeFileSync(join(root, 'docs', name), readFileSync(new URL(`../../docs/${name}`, import.meta.url)))
  const path = join(root, 'docs/UPSTREAM_020_SOURCE_MANIFEST.md')
  writeFileSync(path, readFileSync(path, 'utf8').replace('upstream/dsh-v0.2.0-rc.2/tarballs/vendor/', 'upstream/../../private/'))
  assert.throws(() => readInputManifest(root), /Unsafe input path/)
})
