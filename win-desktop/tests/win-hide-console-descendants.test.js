import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildDshEnvironment } from '../src/dsh-service.js'

const sourceDirectory = fileURLToPath(new URL('../src', import.meta.url))
const originalNodeOptions = process.env.NODE_OPTIONS

function fixtures(run) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-descendants-'))
  // Every generated/copied file belongs to this test's newly-created directory.
  assert.equal(dirname(root), resolve(tmpdir()))
  assert.ok(basename(root).startsWith('dsh-descendants-'))
  try {
    const home = join(root, '中文 空白目录')
    mkdirSync(home)
    cpSync(sourceDirectory, join(home, 'src'), { recursive: true })
    writeFileSync(join(home, 'package.json'), '{"type":"module"}\n')
    const existingPreload = join(home, 'existing preload.cjs')
    writeFileSync(existingPreload, 'globalThis.existingPreloadCount = (globalThis.existingPreloadCount ?? 0) + 1\n')
    const existingOptions = `--no-warnings --require ${JSON.stringify(existingPreload)}`
    // The full Harness loader uses installed wrapper dependencies. Only the
    // dependency-free descendant preload needs relocation for the path check.
    const hook = pathToFileURL(join(sourceDirectory, 'win-hide-console.mjs')).href
    const lean = join(home, 'src', 'win-hide-console-preload.cjs')
    const leaf = join(home, 'leaf.mjs')
    const middle = join(home, 'middle.cjs')
    const parent = join(home, 'parent.cjs')
    const missingExecutable = join(home, 'never-created-opt-out.exe')
    writeFileSync(leaf, `
      import childProcess, { spawnSync } from 'node:child_process'
      const native = process.binding('spawn_sync')
      const original = native.spawn
      const calls = []
      native.spawn = function (...args) {
        calls.push({ windowsHide: args[0].windowsHide })
        // Observe the real boundary, then keep this test's process hidden even
        // when a future regression makes the incoming default false.
        return original.call(this, { ...args[0], windowsHide: true }, ...args.slice(1))
      }
      const result = spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'echo descendant-ok'], { encoding: 'utf8' })
      // A real native ENOENT validates the explicit opt-out without creating a window.
      const missing = spawnSync(${JSON.stringify(missingExecutable)}, [], { windowsHide: false })
      console.log(JSON.stringify({
        status: result.status, output: result.stdout.trim(), calls,
        missingCode: missing.error?.code,
        namedExportMatches: spawnSync === childProcess.spawnSync,
        existingPreloadCount: globalThis.existingPreloadCount ?? 0,
        nodeOptions: process.env.NODE_OPTIONS ?? '',
        marker: process.env.DSH_DESCENDANT_ONLY_MARKER ?? null,
      }))
    `)
    writeFileSync(middle, `
      const childProcess = require('node:child_process')
      const native = process.binding('spawn_sync')
      const original = native.spawn
      let grandchildHidden
      native.spawn = function (...args) {
        grandchildHidden = args[0].windowsHide
        return original.call(this, { ...args[0], windowsHide: true }, ...args.slice(1))
      }
      const result = childProcess.spawnSync(process.execPath, [${JSON.stringify(leaf)}], { encoding: 'utf8' })
      if (result.status !== 0) throw new Error(result.stderr || 'grandchild failed')
      console.log(JSON.stringify({ grandchildHidden, leaf: JSON.parse(result.stdout.trim()) }))
    `)
    writeFileSync(parent, `
      const childProcess = require('node:child_process')
      const mode = process.argv[2]
      const filtered = process.argv[3] !== 'inherited'
      const originalEnvironment = {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
        ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE,
        NODE_OPTIONS: '--no-deprecation', DSH_DESCENDANT_ONLY_MARKER: 'dsh-fixture',
      }
      if (process.argv[3] === 'filtered-lower') {
        originalEnvironment.node_options = originalEnvironment.NODE_OPTIONS
        delete originalEnvironment.NODE_OPTIONS
      }
      const before = JSON.stringify(originalEnvironment)
      const options = filtered ? { env: originalEnvironment } : {}
      const target = mode === 'grandchild' ? ${JSON.stringify(middle)} : ${JSON.stringify(leaf)}
      async function run() {
        let text
        if (mode === 'spawn' || mode === 'fork') {
          const child = mode === 'fork'
            ? childProcess.fork(target, [], { ...options, silent: true, execArgv: [] })
            : childProcess.spawn(process.execPath, [target], { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
          let output = '', errors = ''
          child.stdout.on('data', data => { output += data.toString() })
          child.stderr.on('data', data => { errors += data.toString() })
          const status = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve) })
          if (status !== 0) throw new Error(errors || 'child failed')
          text = output
        } else {
          const result = mode === 'shell'
            ? childProcess.spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', '""' + process.execPath + '" "' + target + '""'], { ...options, encoding: 'utf8', windowsVerbatimArguments: true })
            : childProcess.spawnSync(process.execPath, [target], { ...options, encoding: 'utf8' })
          if (result.status !== 0) throw new Error(result.stderr || 'child failed')
          text = result.stdout
        }
        console.log(JSON.stringify({
          child: JSON.parse(text.trim()), originalEnvironmentUnchanged: before === JSON.stringify(originalEnvironment),
          parentExistingCount: globalThis.existingPreloadCount,
        }))
      }
      run().catch(error => { console.error(error.message); process.exitCode = 1 })
    `)
    return run({ root, home, hook, lean, leaf, parent, existingOptions, existingPreload })
  } finally {
    rmSync(root, { recursive: true, force: true })
    assert.equal(process.env.NODE_OPTIONS, originalNodeOptions, 'test must leave its host environment unchanged')
  }
}

function probe(args, nodeOptions = '') {
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8', windowsHide: true, timeout: 15_000,
    env: { ...process.env, NODE_OPTIONS: nodeOptions },
  })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  return JSON.parse(result.stdout.trim())
}

function assertLeaf(leaf, { existingOptions, existingPreload }, filtered) {
  assert.equal(leaf.status, 0)
  assert.equal(leaf.output, 'descendant-ok')
  assert.deepEqual(leaf.calls, [{ windowsHide: true }, { windowsHide: false }], 'descendant defaults must hide, while explicit visibility survives')
  assert.equal(leaf.missingCode, 'ENOENT', 'opt-out must never start an actual visible process')
  assert.equal(leaf.namedExportMatches, true)
  assert.equal(leaf.existingPreloadCount, filtered ? 0 : 1)
  assert.ok(leaf.nodeOptions.includes('win-hide-console-preload.cjs'), 'descendants need the lean preload')
  assert.ok(!leaf.nodeOptions.includes('win-hide-console.mjs'), 'descendants must not recursively register the full Harness loader')
  if (filtered) {
    assert.equal(leaf.marker, 'dsh-fixture', 'other filtered environment fields must survive')
    assert.ok(leaf.nodeOptions.includes('--no-deprecation'))
    assert.ok(!leaf.nodeOptions.includes(existingPreload), 'a filtered child environment must not acquire parent user preloads')
  } else {
    assert.ok(leaf.nodeOptions.startsWith(existingOptions), 'existing NODE_OPTIONS must survive unchanged')
  }
}

test('MCP filtered environments preserve case-insensitive NODE_OPTIONS without parent flag leakage', { skip: process.platform !== 'win32' }, () => {
  fixtures(fixture => {
    const result = probe(['--import', fixture.hook, fixture.parent, 'grandchild', 'filtered-lower'], fixture.existingOptions)
    assert.equal(result.originalEnvironmentUnchanged, true)
    assert.equal(result.child.grandchildHidden, true)
    assertLeaf(result.child.leaf, fixture, true)
  })
})

test('Windows service environment adds one quoted lean preload without mutating caller environment', () => {
  fixtures(fixture => {
    const environment = { node_options: '--no-warnings', PATH: 'fixture-path', KEEP: 'fixture-value' }
    const before = { ...environment }
    const result = buildDshEnvironment(environment, 'fixture.patch.yml', {}, {
      platform: 'win32', winHideConsolePreload: fixture.lean,
    })
    assert.deepEqual(environment, before)
    assert.equal(result.KEEP, environment.KEEP)
    assert.equal(result.PATH, environment.PATH)
    assert.equal(result.ELECTRON_RUN_AS_NODE, '1')
    assert.equal(result.DSH_DESKTOP_STARTUP_PATCH, 'fixture.patch.yml')
    assert.equal(result.DSH_DESKTOP_BUILTIN_WEB_TOOLS, '1')
    assert.deepEqual(Object.keys(result).filter(key => key.toUpperCase() === 'NODE_OPTIONS'), ['node_options'])
    assert.equal(result.node_options, `--no-warnings --require="${fixture.lean.replaceAll('\\', '/')}"`)
    const again = buildDshEnvironment(result, 'fixture.patch.yml', {}, { platform: 'win32', winHideConsolePreload: fixture.lean })
    assert.equal(again.node_options, result.node_options, 'repeated service environment composition must not append twice')
    const leaf = probe([fixture.leaf], result.node_options)
    assert.equal(leaf.calls[0].windowsHide, true, 'the quoted Chinese/space path must actually load in Node')
    assert.equal(leaf.namedExportMatches, true)
  })
})

test('non-Windows service environment preserves NODE_OPTIONS and input object', () => {
  const environment = { NODE_OPTIONS: '--no-warnings', KEEP: 'fixture-value' }
  const result = buildDshEnvironment(environment, 'fixture.patch.yml', { builtinWebToolsEnabled: false }, {
    platform: 'linux', winHideConsolePreload: '/fixture/win-hide-console-preload.cjs',
  })
  assert.deepEqual(environment, { NODE_OPTIONS: '--no-warnings', KEEP: 'fixture-value' })
  assert.equal(result.NODE_OPTIONS, environment.NODE_OPTIONS)
  assert.equal(result.KEEP, environment.KEEP)
  assert.equal(result.DSH_DESKTOP_BUILTIN_WEB_TOOLS, '0')
})

for (const mode of ['spawn', 'spawnSync', 'fork', 'grandchild', 'shell']) {
  for (const filtered of [false, true]) {
    test(`console guard reaches ${mode} descendants with ${filtered ? 'MCP filtered' : 'inherited'} environment`, { skip: process.platform !== 'win32' }, () => {
      fixtures(fixture => {
        const result = probe(['--import', fixture.hook, fixture.parent, mode, filtered ? 'filtered' : 'inherited'], fixture.existingOptions)
        assert.equal(result.parentExistingCount, 1)
        assert.equal(result.originalEnvironmentUnchanged, true)
        if (mode === 'grandchild') {
          assert.equal(result.child.grandchildHidden, true)
          assertLeaf(result.child.leaf, fixture, filtered)
        } else assertLeaf(result.child, fixture, filtered)
      })
    })
  }
}

test('lean preload installs once and updates already-created ESM builtin exports', { skip: process.platform !== 'win32' }, () => {
  fixtures(fixture => {
    const source = `
      import childProcess, { spawnSync } from 'node:child_process'
      import { createRequire } from 'node:module'
      const require = createRequire(import.meta.url)
      const before = childProcess.spawnSync
      require(${JSON.stringify(fixture.lean)})
      const installed = childProcess.spawnSync
      delete require.cache[require.resolve(${JSON.stringify(fixture.lean)})]
      require(${JSON.stringify(fixture.lean)})
      console.log(JSON.stringify({ changed: installed !== before, namedMatches: spawnSync === installed,
        same: installed === childProcess.spawnSync,
        copies: (process.env.NODE_OPTIONS ?? '').split('win-hide-console-preload.cjs').length - 1,
      }))
    `
    assert.deepEqual(probe(['--input-type=module', '-e', source]), { changed: true, namedMatches: true, same: true, copies: 1 })
  })
})

test('lean Worker startup stays bounded and retains descendant protection', { skip: process.platform !== 'win32' }, () => {
  fixtures(fixture => {
    const workerSource = `
      const { parentPort } = require('node:worker_threads')
      const childProcess = require('node:child_process')
      const native = process.binding('spawn_sync'), original = native.spawn
      let hidden
      native.spawn = function (...args) { hidden = args[0].windowsHide; return original.call(this, { ...args[0], windowsHide: true }, ...args.slice(1)) }
      const result = childProcess.spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'echo worker-ok'], { encoding: 'utf8' })
      parentPort.postMessage({ hidden, status: result.status, output: result.stdout.trim() })
    `
    const source = `
      const { Worker } = require('node:worker_threads')
      const worker = new Worker(${JSON.stringify(workerSource)}, { eval: true })
      worker.once('message', value => console.log(JSON.stringify(value)))
      worker.once('error', error => { console.error(error.message); process.exitCode = 1 })
    `
    assert.deepEqual(probe(['-e', source], `--require ${JSON.stringify(fixture.lean)}`), { hidden: true, status: 0, output: 'worker-ok' })
  })
})
