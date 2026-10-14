import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
  const plugin = join(root, 'node_modules', '@deepseek-ai', 'dsh-superpowers')
  cpSync(new URL('../superpowers-plugin/', import.meta.url), plugin, { recursive: true })
  const agentTeams = join(root, 'node_modules', '@nanmicoder', 'dsh-agent-teams')
  mkdirSync(join(agentTeams, 'assets', 'readme'), { recursive: true })
  mkdirSync(join(agentTeams, 'release-notes'), { recursive: true })
  mkdirSync(join(agentTeams, 'scripts'), { recursive: true })
  writeFileSync(join(agentTeams, 'package.json'), JSON.stringify({
    name: '@nanmicoder/dsh-agent-teams',
    files: ['lib', 'assets/readme', 'release-notes', 'scripts/legacy-session-source-repair.mjs', 'README.md'],
  }))
  writeFileSync(join(agentTeams, 'assets', 'readme', 'guide.md'), 'agent teams asset')
  writeFileSync(join(agentTeams, 'release-notes', 'v0.1.23.md'), 'agent teams release note')
  writeFileSync(join(agentTeams, 'scripts', 'legacy-session-source-repair.mjs'), 'agent teams repair utility')
  const hashes = collectManifestHashes(root)
  assert.equal(hashes.has('assets/cli/dsh.cmd'), true)
  assert.equal(hashes.has('assets/cli/command-path.ps1'), true)
  for (const file of ['lib/index.js', 'lib/dsh-tools.md', 'lib/skills/brainstorming/SKILL.md',
    'lib/skills/executing-plans/scripts/task-start', 'UPSTREAM.md']) {
    const key = 'node_modules/@deepseek-ai/dsh-superpowers/' + file
    assert.ok(hashes.has(key), `${key} must be compared byte-for-byte`)
    const missing = new Map(hashes); missing.delete(key)
    assert.throws(() => compareManifestHashes(hashes, missing), /count mismatch/u)
    const tampered = new Map(hashes); tampered.set(key, 'changed')
    assert.throws(() => compareManifestHashes(hashes, tampered), /differs/u)
  }
  for (const file of ['assets/readme/guide.md', 'release-notes/v0.1.23.md', 'scripts/legacy-session-source-repair.mjs']) {
    const key = 'node_modules/@nanmicoder/dsh-agent-teams/' + file
    assert.ok(hashes.has(key), `${key} must be compared byte-for-byte`)
    const tampered = new Map(hashes); tampered.set(key, 'changed')
    assert.throws(() => compareManifestHashes(hashes, tampered), /differs/u)
  }
  rmSync(join(agentTeams, 'scripts', 'legacy-session-source-repair.mjs'))
  assert.throws(() => collectManifestHashes(root), /legacy-session-source-repair/u)
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
