import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { resolvePwshPath } from '@deepseek-ai/dsh-pwsh-local'

const require = createRequire(import.meta.url)

// These development fixtures run outside the Harness preload. Observe the
// actual call arguments without launching their lock holders or doctor.
for (const [label, sourceFile, invocation] of [
  ['team lock holder', '../agent-teams-plugin/scripts/verify.mjs', /const holder = (spawn\([\s\S]*?\n\s*\))/],
  ['team transient lock holder', '../agent-teams-plugin/scripts/verify.mjs', /const flasher = (spawn\([\s\S]*?\n\s*\))/],
  ['compatibility doctor', '../agent-teams-plugin/scripts/compatibility.test.mjs', /const run = \(\) => (spawnSync\([^\n]+\))/],
  ['plugin integration import', './agent-teams-integration.test.js', /const imported = (spawnSync\([\s\S]*?\n\s*\}\))/],
  ['service syntax check', './dsh-service-syntax.test.js', /const result = (spawnSync\([\s\S]*?\n\s*\}\))/],
]) {
  test(`offline development ${label} explicitly hides its native child`, () => {
    const source = readFileSync(new URL(sourceFile, import.meta.url), 'utf8')
    const match = invocation.exec(source)
    assert.ok(match, `${label}: fixture invocation changed; review the actual launch boundary`)
    const calls = []
    const observe = (...args) => { calls.push(args); return {} }
    runInNewContext(match[1], {
      spawn: observe, spawnSync: observe,
      lockedJson: 'fixture-team.json', transientJson: 'fixture-transient.json',
      executable: 'fixture-node.exe', args: ['fixture-doctor.mjs'],
      process: { execPath: 'fixture-node.exe' },
      consoleHideImport: 'fixture-preload.mjs', wrapperRoot: 'fixture-workspace', serviceFile: 'fixture-service.js',
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0][2]?.windowsHide, true, `${label} runs before any descendant guard can protect it`)
  })
}

test('GUI-runtime PowerShell and npm CMD chains retain filtered-env protection and hidden consoles', {
  skip: process.platform !== 'win32',
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-console-chain-'))
  assert.equal(dirname(root), resolve(tmpdir()))
  assert.ok(basename(root).startsWith('dsh-console-chain-'))
  try {
    const fixtures = join(root, '中文 空白目录')
    mkdirSync(fixtures)
    const leaf = join(fixtures, 'leaf.cjs')
    const shim = join(fixtures, 'fixture.cmd')
    const parent = join(fixtures, 'parent.cjs')
    const preload = fileURLToPath(new URL('../src/win-hide-console-preload.cjs', import.meta.url))
    const powershell = join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    writeFileSync(leaf, `
      const assert = require('node:assert/strict')
      const cp = require('node:child_process')
      const koffi = require(${JSON.stringify(require.resolve('koffi'))})
      const kernel = koffi.load('kernel32.dll')
      const user = koffi.load('user32.dll')
      const getConsole = kernel.func('void * __stdcall GetConsoleWindow()')
      const visible = user.func('bool __stdcall IsWindowVisible(void *)')
      const consoleWindow = getConsole()
      assert.equal(consoleWindow === null ? false : visible(consoleWindow), false)
      const native = process.binding('spawn_sync')
      const original = native.spawn
      let observedHidden
      native.spawn = function (options) {
        observedHidden = options.windowsHide
        // Fail before a regression can create a visible test process.
        assert.equal(observedHidden, true)
        return original.call(this, options)
      }
      const result = cp.spawnSync(process.env.ComSpec, ['/d', '/s', '/c', 'echo chain-ok'], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
      console.log(JSON.stringify({ output: result.stdout.trim(), observedHidden,
        consoleVisible: consoleWindow === null ? false : visible(consoleWindow),
        nodeOptions: process.env.NODE_OPTIONS, marker: process.env.DSH_CHAIN_MARKER }))
    `)
    writeFileSync(shim, `@echo off\r\nchcp 65001 >nul\r\n"${process.execPath}" "${leaf}"\r\n`)
    writeFileSync(parent, `
      const assert = require('node:assert/strict')
      const cp = require('node:child_process')
      const native = process.binding('spawn_sync')
      const original = native.spawn
      native.spawn = function (options) {
        assert.equal(options.windowsHide, true, 'guard must hide the first shell hop')
        return original.call(this, options)
      }
      const filtered = { SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
        PATH: process.env.PATH, PATHEXT: process.env.PATHEXT,
        NODE_OPTIONS: '--no-deprecation', DSH_CHAIN_MARKER: 'filtered' }
      const before = JSON.stringify(filtered)
      const shell = process.argv[2]
      const command = '& ' + ${JSON.stringify("'" + process.execPath.replaceAll("'", "''") + "' '" + leaf.replaceAll("'", "''") + "'")}
      const result = shell !== 'cmd'
        ? cp.spawnSync(process.argv[3], ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { env: filtered, encoding: 'utf8' })
        : cp.spawnSync(process.env.ComSpec, ['/d', '/s', '/c', '""' + ${JSON.stringify(shim)} + '""'], { env: filtered, encoding: 'utf8', windowsVerbatimArguments: true })
      assert.equal(result.status, 0, result.stderr || result.error?.message)
      assert.equal(JSON.stringify(filtered), before)
      console.log(JSON.stringify({ stdout: result.stdout, stderr: result.stderr, status: result.status }))
    `)
    const shells = [['windows-powershell', powershell], ['cmd', '']]
    const currentPowerShell = resolvePwshPath()
    if (currentPowerShell.toLowerCase() !== powershell.toLowerCase()) shells.push(['pwsh', currentPowerShell])
    for (const [shell, executable] of shells) {
      // Electron is the actual GUI-subsystem runtime used by the desktop wrapper;
      // only the isolated fixture runs, never a user Harness instance.
      const result = spawnSync(require('electron'), ['--require', preload, parent, shell, executable], {
        windowsHide: true, encoding: 'utf8', timeout: 20_000,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
      })
      assert.equal(result.status, 0, `${shell}: ${result.stderr || result.error?.message}`)
      const shellResult = JSON.parse(result.stdout.trim())
      assert.ok(shellResult.stdout.trim(), `${shell}: ${JSON.stringify(shellResult)}`)
      const observed = JSON.parse(shellResult.stdout.trim())
      assert.equal(observed.output, 'chain-ok')
      assert.equal(observed.observedHidden, true)
      assert.equal(observed.consoleVisible, false)
      assert.equal(observed.marker, 'filtered')
      assert.match(observed.nodeOptions, /win-hide-console-preload\.cjs/)
      assert.match(observed.nodeOptions, /--no-deprecation/)
      assert.doesNotMatch(observed.nodeOptions, /win-hide-console\.mjs/)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
