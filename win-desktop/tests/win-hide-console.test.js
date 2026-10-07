import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HIDDEN_CONSOLE_STARTF,
  injectWindowsHideArgs,
  normalizeRedundantEscalationArgs,
  rewriteDesktopConsoleSource,
  rewriteQuotaErrorClassification,
  patchNodeChildProcess,
} from '../src/win-hide-console-rewrite.js'
import { buildDshArgs, resolveAgentTeamsPatch, resolveWinHideConsoleImport } from '../src/dsh-service.js'

const require = createRequire(import.meta.url)

function packageRoot(name) {
  return dirname(require.resolve(`${name}/package.json`))
}

function sandboxAclBundleSource() {
  return readFileSync(require.resolve('@deepseek-ai/dsh-win32-process'), 'utf8')
}

const subprocessSource = readFileSync(require.resolve('@deepseek-ai/dsh-subprocess-local'), 'utf8')
const subprocessRunnerName = readdirSync(dirname(require.resolve('@deepseek-ai/dsh-subprocess-local')))
  .filter(name => /^runner-launch-[A-Za-z0-9_-]+\.js$/.test(name))
assert.equal(subprocessRunnerName.length, 1, 'expected one hashed subprocess runner bundle')
const subprocessRunnerSource = readFileSync(
  join(dirname(require.resolve('@deepseek-ai/dsh-subprocess-local')), subprocessRunnerName[0]),
  'utf8',
)
const sandboxAclSource = sandboxAclBundleSource()
const sandboxLocalSource = readFileSync(require.resolve('@deepseek-ai/dsh-sandbox-local'), 'utf8')
const pwshSourcePath = require.resolve('@deepseek-ai/dsh-tool-pwsh')
const bashSourcePath = require.resolve('@deepseek-ai/dsh-tool-bash')
const fsToolSourcePath = require.resolve('@deepseek-ai/dsh-tool-fs')
const pwshSource = readFileSync(pwshSourcePath, 'utf8')
const bashSource = readFileSync(bashSourcePath, 'utf8')
const fsToolSource = readFileSync(fsToolSourcePath, 'utf8')
const llmSourcePath = require.resolve('@deepseek-ai/dsh-llm')
const llmSource = readFileSync(llmSourcePath, 'utf8')

test('normalizes only redundant shell escalation requests', () => {
  assert.deepEqual(normalizeRedundantEscalationArgs({
    sandbox_permissions: 'danger-full-access',
    justification: 'Already unrestricted.',
    command: 'Get-Location',
  }, 'danger-full-access'), {
    sandbox_permissions: undefined,
    justification: undefined,
    command: 'Get-Location',
  })
  assert.deepEqual(normalizeRedundantEscalationArgs({
    sandbox_permissions: 'workspace-write',
    justification: '',
    command: 'Get-Location',
  }, 'danger-full-access'), {
    sandbox_permissions: undefined,
    justification: undefined,
    command: 'Get-Location',
  })
  assert.deepEqual(normalizeRedundantEscalationArgs({
    sandbox_permissions: 'workspace-write',
    justification: 'Already writable.',
    command: 'pwd',
  }, 'workspace-write'), {
    sandbox_permissions: undefined,
    justification: undefined,
    command: 'pwd',
  })
  assert.deepEqual(normalizeRedundantEscalationArgs({
    sandbox_permissions: 'danger-full-access',
    justification: 'Need wider access.',
    command: 'pwd',
  }, 'workspace-write'), {
    sandbox_permissions: 'danger-full-access',
    justification: 'Need wider access.',
    command: 'pwd',
  })
  assert.deepEqual(normalizeRedundantEscalationArgs({
    sandbox_permissions: 'workspace-write',
    justification: 'Need write access.',
    command: 'pwd',
  }, 'read-only'), {
    sandbox_permissions: 'workspace-write',
    justification: 'Need write access.',
    command: 'pwd',
  })

  for (const requested of [null, 'bogus-mode', 'future-sandbox-mode']) {
    const args = {
      sandbox_permissions: requested,
      justification: 'Leave validation to the official shell tool.',
      command: 'pwd',
    }
    assert.equal(
      normalizeRedundantEscalationArgs(args, 'danger-full-access'),
      args,
      `expected unknown requested mode ${JSON.stringify(requested)} to remain untouched`,
    )
  }

  const unknownCurrentMode = {
    sandbox_permissions: 'workspace-write',
    justification: 'Leave future policy semantics to the official shell tool.',
    command: 'pwd',
  }
  assert.equal(
    normalizeRedundantEscalationArgs(unknownCurrentMode, 'future-sandbox-mode'),
    unknownCurrentMode,
  )
})

test('rewrite normalizes real Pwsh and Bash module escalation before validation', () => {
  for (const [source, sourcePath, validator, name] of [
    [pwshSource, pwshSourcePath, 'validatePwshArgs', 'Pwsh'],
    [bashSource, bashSourcePath, 'validateBashArgs', 'Bash'],
  ]) {
    const rewritten = rewriteDesktopConsoleSource(source, pathToFileURL(sourcePath).href)
    assert.notEqual(rewritten, source, `expected ${name} source to be rewritten`)
    const executeAt = rewritten.indexOf('async execute(args, exec) {')
    const normalizedAt = rewritten.indexOf('args = normalizeRedundantEscalationArgs(args, standingPolicy?.mode);', executeAt)
    const validatedAt = rewritten.indexOf(`${validator}(args`, executeAt)
    assert.ok(normalizedAt > executeAt && validatedAt > normalizedAt, `expected ${name} normalization before its real validator`)
    assert.equal(rewriteDesktopConsoleSource(rewritten, pathToFileURL(sourcePath).href), rewritten)
  }
})

test('rewritten Pwsh and Bash execute paths preserve validation and approval boundaries', () => {
  const fixture = fileURLToPath(new URL('./fixtures/shell-escalation-runtime.mjs', import.meta.url))
  for (const shell of ['pwsh', 'bash']) {
    const result = spawnSync(process.execPath, [fixture, shell], {
      encoding: 'utf8',
      windowsHide: true,
      cwd: fileURLToPath(new URL('..', import.meta.url)),
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), {
      shell,
      sameModeRunnerCalls: 1,
      narrowerModeRunnerCalls: 1,
      wideningBlankRunnerCalls: 0,
      justificationOnlyRunnerCalls: 0,
      validWideningApprovalCalls: 1,
      runnerCallsBeforeApproval: 0,
      validWideningRunnerCalls: 1,
    })
  }
})

test('rewrite normalizes real filesystem mutation escalation before validation', () => {
  const rewritten = rewriteDesktopConsoleSource(fsToolSource, pathToFileURL(fsToolSourcePath).href)
  const standingPolicy = 'const standingPolicy = this.policy?.resolve({ ...exec.agent ? { session: exec.agent.session } : {} });'
  const oldResolveBlock = `async resolvePolicy(toolName, args, exec) {
\t\tvalidateEscalationArgs(args.sandbox_permissions, args.justification);
\t\t${standingPolicy}`
  const expectedPatch = `async resolvePolicy(toolName, args, exec) {
\t\t${standingPolicy}
\t\t${normalizeRedundantEscalationArgs.toString()}
\t\targs = normalizeRedundantEscalationArgs(args, standingPolicy?.mode);
\t\tvalidateEscalationArgs(args.sandbox_permissions, args.justification);`
  assert.notEqual(rewritten, fsToolSource)
  assert.ok(!rewritten.includes(oldResolveBlock))
  assert.ok(rewritten.includes(expectedPatch))
  assert.equal(rewriteDesktopConsoleSource(rewritten, pathToFileURL(fsToolSourcePath).href), rewritten)
})

test('loader classifies explicit weekly usage exhaustion as terminal quota', () => {
  const rewritten = rewriteQuotaErrorClassification(llmSource)
  assert.notEqual(rewritten, llmSource)
  assert.match(rewritten, /weekly usage limit/)
  assert.equal(rewriteQuotaErrorClassification(rewritten), rewritten)

  const hook = new URL('../src/win-hide-console.mjs', import.meta.url).href
  const fixture = fileURLToPath(new URL('./fixtures/check-quota-classification-under-guard.mjs', import.meta.url))
  const result = spawnSync(process.execPath, ['--import', hook, fixture], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), {
    weeklyUsageLimit: true,
    transientRateLimit: false,
    resetNoticeAlone: false,
  })
})

test('rewritten write and edit paths preserve validation and approval boundaries', () => {
  const fixture = fileURLToPath(new URL('./fixtures/fs-escalation-runtime.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [fixture], {
    encoding: 'utf8',
    windowsHide: true,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
  })
  assert.equal(result.status, 0, result.stderr)
  const expected = {
    sameModeMutationCalls: 1,
    narrowerModeMutationCalls: 1,
    wideningBlankMutationCalls: 0,
    justificationOnlyMutationCalls: 0,
    validWideningApprovalCalls: 1,
    mutationsBeforeApproval: 0,
    validWideningMutationCalls: 1,
    validWideningMutationModes: ['danger-full-access'],
  }
  assert.deepEqual(JSON.parse(result.stdout), { write: expected, edit: expected })
})

test('dsh web args preload the Windows console-hide guard', () => {
  const hook = resolveWinHideConsoleImport()
  const args = buildDshArgs('entry.js', { platform: 'win32' })
  assert.equal(args[0], '--import')
  assert.equal(args[1], hook)
  assert.equal(args[2], '--expose-internals')
  assert.deepEqual(
    buildDshArgs('entry.js', { platform: 'linux' }).slice(0, 2),
    ['--expose-internals', 'entry.js'],
  )
  assert.ok(args.includes('--no-open'))
})

test('pinned upstream owns subprocess spawn and both taskkill console-hide paths', () => {
  assert.equal([...subprocessRunnerSource.matchAll(/detached: platform !== "win32",\s*windowsHide: platform === "win32"/g)].length, 1)
  assert.equal([...subprocessRunnerSource.matchAll(/stdio: "ignore",\s*windowsHide: true/g)].length, 2)

  assert.equal(
    rewriteDesktopConsoleSource(
      subprocessSource,
      'file:///x/node_modules/@deepseek-ai/dsh-subprocess-local/lib/index.js',
    ),
    subprocessSource,
  )
  const rewritten = rewriteDesktopConsoleSource(
    subprocessRunnerSource,
    `file:///x/node_modules/@deepseek-ai/dsh-subprocess-local/lib/${subprocessRunnerName[0]}`,
    resolveWinHideConsoleImport(),
  )
  assert.notEqual(rewritten, subprocessRunnerSource)
  assert.match(rewritten, /detached: platform !== "win32",\s*windowsHide: platform === "win32"/)
  assert.match(rewritten, /stdio: "ignore",\s*windowsHide: true/)
  assert.match(
    rewritten,
    /return \[process\.execPath, "--import", "file:[^"]+win-hide-console\.mjs", fileURLToPath\(import\.meta\.resolve\("@deepseek-ai\/dsh-subprocess-local\/runner"\)\)\];/,
  )
  assert.equal(
    rewriteDesktopConsoleSource(
      rewritten,
      `file:///x/node_modules/@deepseek-ai/dsh-subprocess-local/lib/${subprocessRunnerName[0]}`,
      resolveWinHideConsoleImport(),
    ),
    rewritten,
  )
})

test('rewrite hides sandbox CreateProcess windows without CREATE_NO_WINDOW', () => {
  const rewritten = rewriteDesktopConsoleSource(
    sandboxAclSource,
    'file:///x/node_modules/@deepseek-ai/dsh-win32-process/lib/index.js',
  )
  assert.equal(HIDDEN_CONSOLE_STARTF, 257)
  assert.equal([...rewritten.matchAll(/dwFlags: 257,/g)].length, 2)
  assert.equal([...rewritten.matchAll(/wShowWindow: 0,/g)].length, 2)
  assert.doesNotMatch(rewritten, /dwFlags: 256,/)
  assert.equal(rewritten, sandboxAclSource, 'upstream owns hidden CreateProcess startup flags')
})

test('rewrite injects the console-hide preload into the Windows ACL runner argv', () => {
  const hook = resolveWinHideConsoleImport()
  const rewritten = rewriteDesktopConsoleSource(
    sandboxLocalSource,
    'file:///x/node_modules/@deepseek-ai/dsh-sandbox-local/lib/index.js',
    hook,
  )
  assert.ok(
    rewritten.includes(`return [process.execPath, "--import", ${JSON.stringify(hook)}, builtEntry];`),
  )
  assert.ok(rewritten.includes('`data:text/javascript,${encodeURIComponent(registration)}`'))
  assert.equal(rewritten.split(JSON.stringify(hook)).length - 1, 2, 'both production and source runners inherit the preload')
  assert.equal(rewriteDesktopConsoleSource(rewritten, 'file:///x/node_modules/@deepseek-ai/dsh-sandbox-local/lib/index.js', hook), rewritten)
})

test('injectWindowsHideArgs preserves callbacks and existing options', () => {
  const callback = () => {}
  assert.deepEqual(injectWindowsHideArgs(['cmd']), ['cmd', { windowsHide: true }])
  assert.deepEqual(injectWindowsHideArgs(['cmd', ['/c', 'exit 0']]), [
    'cmd',
    ['/c', 'exit 0'],
    { windowsHide: true },
  ])
  assert.deepEqual(injectWindowsHideArgs(['cmd', { cwd: 'C:\\' }]), [
    'cmd',
    { cwd: 'C:\\', windowsHide: true },
  ])
  assert.deepEqual(injectWindowsHideArgs(['cmd', { windowsHide: false }]), [
    'cmd',
    { windowsHide: false },
  ])
  const withCallback = injectWindowsHideArgs(['cmd', callback])
  assert.equal(withCallback[0], 'cmd')
  assert.deepEqual(withCallback[1], { windowsHide: true })
  assert.equal(withCallback[2], callback)
})

test('patchNodeChildProcess forces windowsHide on spawn', () => {
  const calls = []
  const fake = {
    spawn(file, args, options) {
      calls.push({ file, args, options })
      return { pid: 1 }
    },
  }
  patchNodeChildProcess(fake)
  fake.spawn('cmd', ['/c', 'exit 0'])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].file, 'cmd')
  assert.deepEqual(calls[0].args, ['/c', 'exit 0'])
  assert.equal(calls[0].options.windowsHide, true)
  patchNodeChildProcess(fake)
  fake.spawn('cmd', ['/c', 'exit 0'])
  assert.equal(calls.length, 2)
})

test('console-hide --import still lets Node spawn cmd with piped output', () => {
  if (process.platform !== 'win32') return
  const hook = resolveWinHideConsoleImport()
  const script = new URL('./fixtures/echo-hide-console.mjs', import.meta.url)
  const result = spawnSync(process.execPath, ['--import', hook, fileURLToPath(script)], {
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /hide-console-ok/)
})

test('console-hide preload reaches execSync native spawn options', () => {
  if (process.platform !== 'win32') return
  const hook = resolveWinHideConsoleImport()
  const source = `
    import childProcess from 'node:child_process'
    const nativeSpawn = process.binding('spawn_sync')
    const original = nativeSpawn.spawn
    const calls = []
    nativeSpawn.spawn = function (...args) {
      calls.push({ windowsHide: args[0].windowsHide, shell: /cmd\\.exe$/i.test(args[0].file) })
      // Record the exact boundary, then hide the diagnostic OS process even
      // when testing an explicit opt-out. Tests must not flash user windows.
      args[0] = { ...args[0], windowsHide: true }
      return original.apply(this, args)
    }
    const scenarios = [
      { name: 'omitted', args: [] },
      { name: 'undefined', args: [undefined] },
      { name: 'null', args: [null] },
      { name: 'encoding', args: [{ encoding: 'utf8' }] },
      { name: 'explicit-visible', args: [{ encoding: 'utf8', windowsHide: false }] },
      { name: 'nonzero', args: [{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }] },
    ]
    const rows = scenarios.map(scenario => {
      const previous = JSON.stringify(scenario.args)
      let result
      try {
        const output = childProcess.execSync(scenario.name === 'nonzero'
          ? 'echo exec-sync-out & echo exec-sync-err 1>&2 & exit /b 7'
          : 'echo exec-sync-hide-ok', ...scenario.args)
        result = { output: output.toString().trim(), buffer: Buffer.isBuffer(output) }
      } catch (error) {
        result = { status: error.status, output: error.stdout?.toString().trim(), stderr: error.stderr?.toString().trim() }
      }
      return { name: scenario.name, ...result, native: calls.at(-1), unchanged: previous === JSON.stringify(scenario.args) }
    })
    console.log(JSON.stringify({ calls, rows }))
  `
  const result = spawnSync(process.execPath, ['--import', hook, '--input-type=module', '-e', source], {
    encoding: 'utf8', windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  const probe = JSON.parse(result.stdout.trim())
  assert.equal(probe.calls.length, 6)
  for (const row of probe.rows) {
    assert.equal(row.unchanged, true, `${row.name}: guard must not mutate caller options`)
    assert.equal(row.native.shell, true)
    if (row.name === 'nonzero') {
      assert.equal(row.status, 7, 'nonzero exit must still throw its original status')
      assert.equal(row.output, 'exec-sync-out')
      assert.equal(row.stderr, 'exec-sync-err')
    } else {
      assert.equal(row.output, 'exec-sync-hide-ok')
      assert.equal(row.buffer, ['omitted', 'undefined', 'null'].includes(row.name))
    }
  }
  assert.deepEqual(probe.rows.map(row => [row.name, row.native.windowsHide]), [
    ['omitted', true], ['undefined', true], ['null', true], ['encoding', true], ['explicit-visible', false], ['nonzero', true],
  ], 'execSync must hide all legal default overloads and retain an explicit opt-out')
})

test('console-hide preserves legal child-process options overloads at real native boundaries', () => {
  if (process.platform !== 'win32') return
  const hook = resolveWinHideConsoleImport()
  const fixture = fileURLToPath(new URL('./fixtures/echo-hide-console.mjs', import.meta.url))
  const source = `
    const childProcess = require('node:child_process')
    const asyncNative = process.binding('process_wrap').Process.prototype
    const originalAsync = asyncNative.spawn
    const syncNative = process.binding('spawn_sync')
    const originalSync = syncNative.spawn
    const calls = []
    asyncNative.spawn = function (...args) {
      // Node 24 accepts an options object; Node 26 lowered this boundary to flags.
      calls.push(typeof args[0] === 'object' ? { hidden: args[0].windowsHide } : { flags: args[5] })
      if (typeof args[0] === 'object') args[0] = { ...args[0], windowsHide: true }
      else args[5] |= process.binding('process_wrap').constants.kProcessFlagWindowsHide
      return originalAsync.apply(this, args)
    }
    syncNative.spawn = function (...args) {
      calls.push({ hidden: args[0].windowsHide })
      args[0] = { ...args[0], windowsHide: true }
      return originalSync.apply(this, args)
    }
    async function wait(child) {
      let output = ''
      child.stdout?.on('data', data => { output += data.toString() })
      const status = await new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('close', resolve)
      })
      return { status, output: output.trim() }
    }
    async function run() {
      const command = process.env.ComSpec ?? 'cmd.exe'
      const commandArgs = ['/d', '/s', '/c', 'echo overload-hide-ok']
      await wait(childProcess.spawn(command, commandArgs, { windowsHide: false }))
      const visibleFlags = calls.at(-1).flags
      await wait(childProcess.spawn(command, commandArgs, { windowsHide: true }))
      const hiddenFlags = calls.at(-1).flags
      const hiddenMask = visibleFlags === undefined ? undefined : hiddenFlags ^ visibleFlags
      const rows = []
      for (const method of ['spawn', 'spawnSync', 'exec', 'execFile', 'execFileSync', 'fork']) {
        for (const [shape, optionArgs] of [
          ['omitted', []], ['undefined', [undefined]], ['null', [null]], ['explicit-visible', [{ windowsHide: false }]],
        ]) {
          const before = calls.length
          const previous = JSON.stringify(optionArgs)
          const args = method === 'exec' ? ['echo overload-hide-ok', ...optionArgs]
            : [method === 'fork' ? ${JSON.stringify(fixture)} : command, method === 'fork' ? [] : commandArgs, ...optionArgs]
          let result
          try {
            if (method === 'exec' || method === 'execFile') {
              result = await new Promise((resolve, reject) => {
                childProcess[method](...args, (error, output) => error ? reject(error) : resolve({ status: 0, output: output.toString().trim() }))
              })
            } else if (method === 'spawn' || method === 'fork') {
              result = await wait(childProcess[method](...args))
            } else if (method === 'spawnSync') {
              const child = childProcess.spawnSync(...args)
              if (child.error) throw child.error
              result = { status: child.status, output: child.stdout.toString().trim() }
            } else {
              result = { status: 0, output: childProcess.execFileSync(...args).toString().trim() }
            }
          } catch (error) { result = { code: error.code } }
          const native = calls.length === before ? undefined : calls.at(-1)
          rows.push({ method, shape, ...result,
            windowsHide: native && ('hidden' in native ? native.hidden : !!(native.flags & hiddenMask)),
            nativeCalls: calls.length - before, unchanged: previous === JSON.stringify(optionArgs),
          })
        }
      }
      console.log('console-guard-probe:' + JSON.stringify({ hiddenMask, rows }))
    }
    run().catch(error => { console.error(error.code ?? error.message); process.exitCode = 1 })
  `
  const result = spawnSync(process.execPath, ['--import', hook, '-e', source], {
    encoding: 'utf8', windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  const probe = JSON.parse(result.stdout.split(/\r?\n/).find(line => line.startsWith('console-guard-probe:')).slice('console-guard-probe:'.length))
  if (probe.hiddenMask !== undefined) assert.notEqual(probe.hiddenMask, 0, 'native hide flag calibration must distinguish explicit true and false')
  const expected = []
  for (const method of ['spawn', 'spawnSync', 'exec', 'execFile', 'execFileSync', 'fork']) {
    for (const shape of ['omitted', 'undefined', 'null', 'explicit-visible']) {
      const row = probe.rows.find(row => row.method === method && row.shape === shape)
      assert.equal(row.unchanged, true, `${method}/${shape}: caller options must stay unchanged`)
      const invalidNull = ['spawn', 'spawnSync'].includes(method) && shape === 'null'
      if (invalidNull) {
        expected.push({ method, shape, code: 'ERR_INVALID_ARG_TYPE', nativeCalls: 0 })
      } else {
        expected.push({ method, shape, status: 0, windowsHide: shape !== 'explicit-visible', nativeCalls: 1 })
        if (method !== 'fork') assert.equal(row.output, 'overload-hide-ok', `${method}/${shape}: legal overload must retain output`)
      }
    }
  }
  assert.deepEqual(probe.rows.map(({ method, shape, status, code, windowsHide, nativeCalls }) => ({
    method, shape, ...(code === undefined ? { status, windowsHide } : { code }), nativeCalls,
  })), expected, 'legal overloads must reach the hidden native path; invalid null spawn options stay rejected')
})

test('console-hide retains native windowsHide validation without starting rejected children', () => {
  if (process.platform !== 'win32') return
  const hook = resolveWinHideConsoleImport()
  const fixture = fileURLToPath(new URL('./fixtures/echo-hide-console.mjs', import.meta.url))
  const source = `
    const childProcess = require('node:child_process')
    const asyncNative = process.binding('process_wrap').Process.prototype
    const originalAsync = asyncNative.spawn
    const syncNative = process.binding('spawn_sync')
    const originalSync = syncNative.spawn
    let nativeCalls = 0
    // Native validation happens before this boundary. Hide successful baseline
    // probes too, so parity checks never intentionally create visible consoles.
    asyncNative.spawn = function (...args) {
      nativeCalls++
      if (typeof args[0] === 'object') args[0] = { ...args[0], windowsHide: true }
      else args[5] |= process.binding('process_wrap').constants.kProcessFlagWindowsHide
      return originalAsync.apply(this, args)
    }
    syncNative.spawn = function (...args) {
      nativeCalls++
      args[0] = { ...args[0], windowsHide: true }
      return originalSync.apply(this, args)
    }
    async function wait(child) {
      let output = ''
      child.stdout?.on('data', data => { output += data.toString() })
      const status = await new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('close', resolve)
      })
      return { status, output: output.trim() }
    }
    async function run() {
      const command = process.env.ComSpec ?? 'cmd.exe'
      const commandArgs = ['/d', '/s', '/c', 'echo invalid-option-ok']
      const rows = []
      for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
        for (const [shape, windowsHide] of [['string', 'invalid'], ['number', 1], ['null', null]]) {
          const options = { windowsHide, encoding: 'utf8', silent: true }
          const before = nativeCalls
          const previous = JSON.stringify(options)
          const args = method === 'exec' || method === 'execSync' ? ['echo invalid-option-ok', options]
            : [method === 'fork' ? ${JSON.stringify(fixture)} : command, method === 'fork' ? [] : commandArgs, options]
          let result
          try {
            if (method === 'exec' || method === 'execFile') {
              result = await new Promise((resolve, reject) => {
                childProcess[method](...args, (error, output) => error ? reject(error) : resolve({ status: 0, output: output.toString().trim() }))
              })
            } else if (method === 'spawn' || method === 'fork') {
              result = await wait(childProcess[method](...args))
            } else if (method === 'spawnSync') {
              const child = childProcess.spawnSync(...args)
              if (child.error) throw child.error
              result = { status: child.status, output: child.stdout.toString().trim() }
            } else {
              result = { status: 0, output: childProcess[method](...args).toString().trim() }
            }
          } catch (error) { result = { code: error.code } }
          rows.push({ method, shape, ...result, nativeCalls: nativeCalls - before, unchanged: previous === JSON.stringify(options) })
        }
      }
      console.log('console-validation-probe:' + JSON.stringify(rows))
    }
    run().catch(error => { console.error(error.code ?? error.message); process.exitCode = 1 })
  `
  const probe = imports => {
    const result = spawnSync(process.execPath, [...imports, '-e', source], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, result.stderr)
    return JSON.parse(result.stdout.split(/\r?\n/).find(line => line.startsWith('console-validation-probe:')).slice('console-validation-probe:'.length))
  }
  const baseline = probe([])
  const expected = []
  for (const method of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    for (const shape of ['string', 'number', 'null']) {
      // Async exec/execFile coerce this option natively; null is legal everywhere.
      const rejects = !['exec', 'execFile'].includes(method) && shape !== 'null'
      expected.push({ method, shape, ...(rejects
        ? { code: 'ERR_INVALID_ARG_TYPE', nativeCalls: 0 }
        : { status: 0, output: method === 'fork' ? 'hide-console-ok' : 'invalid-option-ok', nativeCalls: 1 }) })
    }
  }
  // Electron's native fork shim mutates options. Its validation/output remain
  // the baseline; the guard independently promises to protect caller options.
  const semantics = rows => rows.map(({ unchanged, ...row }) => row)
  assert.deepEqual(semantics(baseline), expected, 'verify native legality before classifying options as invalid')
  const guarded = probe(['--import', hook])
  assert.deepEqual(semantics(guarded), semantics(baseline), 'guard must preserve native rejection before any child process starts')
  for (const row of guarded) assert.equal(row.unchanged, true, `${row.method}/${row.shape}: guard must protect caller options`)
})

test('desktop AgentTeams overlay leaves member selection to the local plugin', () => {
  const overlay = readFileSync(resolveAgentTeamsPatch(), 'utf8')
  assert.match(overlay, /@nanmicoder\/dsh-agent-teams/)
  assert.doesNotMatch(overlay, /memberModel|memberReasoningEffort/)
})

test('console rewrite leaves AgentTeams source untouched', () => {
  const rewriteSource = readFileSync(new URL('../src/win-hide-console-rewrite.js', import.meta.url), 'utf8')
  assert.doesNotMatch(rewriteSource, /rewriteAgentTeamsMemberDefaults/)
})

test('console-hide loader can evaluate official spawn modules', () => {
  const hook = resolveWinHideConsoleImport()
  const script = fileURLToPath(new URL('./fixtures/import-harness-under-guard.mjs', import.meta.url))
  const result = spawnSync(process.execPath, ['--import', hook, script], {
    encoding: 'utf8',
    windowsHide: true,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /loader-import-ok/)
})
