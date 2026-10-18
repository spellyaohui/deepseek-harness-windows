import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'

const root = fileURLToPath(new URL('..', import.meta.url))
const require = createRequire(import.meta.url)

test('tray settings opens the live native shell and disposes its listener', () => {
  const window = new EventTarget()
  let plugin
  window.__ModuleLoader__ = { load: ({ factory }) => { plugin = factory(() => ({})) } }
  vm.runInNewContext(readFileSync(join(root, 'desktop-settings-plugin/lib/client.js'), 'utf8'), { window })
  let shell, first = 0, replacement = 0, dispose
  plugin.apply({
    effect: setup => { dispose = setup() },
    slots: { inject() {}, entries: () => shell ? [{ store: { create: () => shell } }] : [] },
  })
  const open = () => window.dispatchEvent(new Event('dsh-desktop:open-settings'))
  open()
  shell = { actions: { open: () => { first++ } } }
  open()
  assert.equal(first, 1)
  shell = { actions: { open: () => { replacement++ } } }
  open()
  assert.equal(replacement, 1)
  dispose()
  open()
  assert.equal(replacement, 1)
})

test('actual tray action opens settings with the upstream account launcher', { timeout: 60000 }, () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-tray-settings-'))
  try {
    const env = { ...process.env, DSH_TRAY_TEST_HOME: home }
    delete env.ELECTRON_RUN_AS_NODE
    const result = spawnSync(require('electron'), [join(root, 'tests/fixtures/tray-settings-runtime.cjs')], {
      cwd: root, env, windowsHide: true, encoding: 'utf8', timeout: 50000,
    })
    assert.equal(result.error, undefined)
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /tray settings native shell PASS/)
  } finally {
    assert.equal(dirname(resolve(home)), resolve(tmpdir()))
    assert.ok(home.startsWith(join(tmpdir(), 'dsh-tray-settings-')))
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
