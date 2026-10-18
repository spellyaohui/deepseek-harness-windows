import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as inputs from '../scripts/prepare-build-inputs.mjs'

test('new registry inputs retain all exact archives and refuse an escaped destination', t => {
  assert.equal(typeof inputs.readRegistryInputs, 'function')
  const entries = inputs.readRegistryInputs()
  assert.equal(entries.length, 352)
  assert.equal(entries.find(row => row.name === '@deepseek-ai/dsh').version, '0.2.1-rc.2')
  const fixture = mkdtempSync(join(tmpdir(), 'dsh-021-inputs-'))
  t.after(() => rmSync(fixture, { recursive: true, force: true }))
  mkdirSync(join(fixture, 'docs'))
  const source = readFileSync(new URL('../../docs/UPSTREAM_021_SOURCE_MANIFEST.md', import.meta.url), 'utf8')
  writeFileSync(join(fixture, 'docs/UPSTREAM_021_SOURCE_MANIFEST.md'), source.replace(entries[0].path, '../outside.tgz'))
  assert.throws(() => inputs.readRegistryInputs(fixture), /unsafe|path|archive/i)
})
