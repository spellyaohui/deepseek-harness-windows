import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const lib = fileURLToPath(new URL('../lib/', import.meta.url))
const skills = [
  'brainstorming', 'diagnosing-superpowers', 'dispatching-parallel-agents',
  'executing-plans', 'finishing-a-development-branch', 'receiving-code-review',
  'requesting-code-review', 'subagent-driven-development', 'systematic-debugging',
  'test-driven-development', 'using-git-worktrees', 'using-superpowers',
  'verification-before-completion', 'writing-plans', 'writing-skills',
]
function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    assert.ok(entry.isFile() || entry.isDirectory(), 'bundled assets must not be links')
    const path = prefix + entry.name
    return entry.isDirectory() ? files(join(directory, entry.name), path + '/') : [path]
  })
}

test('fixed upstream assets are complete and unchanged', () => {
  assert.ok(existsSync(join(lib, 'upstream-manifest.json')), 'fixed skill assets have not been imported')
  const manifest = JSON.parse(readFileSync(join(lib, 'upstream-manifest.json'), 'utf8'))
  assert.equal(manifest.schemaVersion, 1)
  assert.deepEqual(manifest.upstream, {
    repository: 'https://github.com/obra/superpowers', version: '7.0.0', tag: 'v7.0.0',
    commit: 'bb92a77741419a4ab5f06e711a283343f1ada0c3',
  })
  assert.deepEqual([...manifest.skills].sort(), skills)
  // Independently derived from the pinned Git blobs, not from this checkout.
  assert.equal(createHash('sha256').update(manifest.files.map(entry =>
    `${entry.path}\t${entry.sha256}`).sort().join('\n')).digest('hex'),
  '4b646fcbb694f25c32d5840657cc20becb1b0e9791a9de5d4081898cf09116c7')
  assert.equal(new Set(manifest.files.map(entry => entry.path)).size, manifest.files.length)
  assert.deepEqual(manifest.files.map(entry => entry.path).sort(),
    ['LICENSE', ...files(join(lib, 'skills'), 'skills/')].sort())
  for (const entry of manifest.files) {
    assert.match(entry.path, /^(?:LICENSE|skills\/[a-z0-9-]+\/[^\\]+)$/u)
    assert.ok(!entry.path.split('/').includes('..'))
    assert.equal(createHash('sha256').update(readFileSync(join(lib, entry.path))).digest('hex'), entry.sha256)
  }
  for (const name of skills) assert.ok(existsSync(join(lib, 'skills', name, 'SKILL.md')))
  assert.match(readFileSync(join(lib, 'LICENSE'), 'utf8'), /MIT License/u)
})

test('Git checkout cannot normalize the byte-pinned upstream resources', () => {
  const manifest = JSON.parse(readFileSync(join(lib, 'upstream-manifest.json'), 'utf8'))
  const paths = manifest.files.map(entry => `win-desktop/superpowers-plugin/lib/${entry.path}`)
  const attributes = execFileSync('git', ['check-attr', 'text', '--', ...paths], {
    cwd: fileURLToPath(new URL('../../../', import.meta.url)), encoding: 'utf8', windowsHide: true,
  }).trim().split(/\r?\n/u)
  assert.equal(attributes.length, paths.length)
  assert.ok(attributes.every(line => line.endsWith(': text: unset')))
})
