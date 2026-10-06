import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))

test('installed official host belongs to the pinned 0.2.0 cohort', () => {
  const wrapper = read('../package.json')
  const installedDsh = read('../node_modules/@deepseek-ai/dsh/package.json')
  assert.equal(installedDsh.version, '0.2.0-rc.2')
  for (const [name, reference] of Object.entries(wrapper.dependencies)) {
    if (/^@deepseek-ai\/dsh(?:-|$)/u.test(name) && reference.startsWith('file:../upstream/')) {
      assert.match(reference, /upstream\/dsh-v0\.2\.0-rc\.2\/tarballs\/dsh\//u)
    }
  }
})

test('every official 0.2 release tarball is the wrapper dependency and installed identity', () => {
  const wrapper = read('../package.json')
  const manifest = readFileSync(new URL('../../docs/UPSTREAM_020_SOURCE_MANIFEST.md', import.meta.url), 'utf8')
  const rows = manifest.split(/\r?\n/u).filter((line) => /^\| (vendor|dsh) \|/u.test(line))
  assert.equal(rows.length, 327)
  for (const row of rows) {
    const [, family, name, version, sha256, file] = row.split('|').map((part) => part.trim())
    assert.equal(family === 'dsh' || family === 'vendor', true)
    assert.match(sha256, /^[a-f0-9]{64}$/u)
    if (name === '@deepseek-ai/dsh-client-ui-settings-models') {
      assert.equal(wrapper.dependencies[name], 'file:models-settings-plugin')
      assert.equal(read(`../node_modules/${name}/package.json`).version, '0.2.0-rc.2-desktop.4')
      continue
    }
    assert.equal(wrapper.dependencies[name], `file:../${file}`, name)
    assert.equal(read(`../node_modules/${name}/package.json`).version, version, name)
  }
})
