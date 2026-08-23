import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HIDDEN_CONSOLE_STARTF,
  injectWindowsHideArgs,
  rewriteDesktopConsoleSource,
  patchNodeChildProcess,
} from '../src/win-hide-console-rewrite.js'
import { buildDshArgs, resolveAgentTeamsPatch, resolveWinHideConsoleImport } from '../src/dsh-service.js'

const require = createRequire(import.meta.url)

function packageRoot(name) {
  return dirname(require.resolve(`${name}/package.json`))
}

function sandboxAclBundleSource() {
  const dir = join(packageRoot('@deepseek-ai/dsh-sandbox-windows-acl'), 'lib')
  const file = readdirSync(dir).find((name) => name.startsWith('types-') && name.endsWith('.js'))
  assert.ok(file, 'expected dsh-sandbox-windows-acl bundled types-*.js')
  return readFileSync(join(dir, file), 'utf8')
}

const subprocessSource = readFileSync(require.resolve('@deepseek-ai/dsh-subprocess-local'), 'utf8')
const sandboxAclSource = sandboxAclBundleSource()
const sandboxLocalSource = readFileSync(require.resolve('@deepseek-ai/dsh-sandbox-local'), 'utf8')
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

test('rewrite adds windowsHide to official subprocess-local spawn', () => {
  const rewritten = rewriteDesktopConsoleSource(
    subprocessSource,
    'file:///x/node_modules/@deepseek-ai/dsh-subprocess-local/lib/index.js',
  )
  assert.match(rewritten, /detached: platform !== "win32", windowsHide: true/)
  assert.match(rewritten, /stdio: "ignore", windowsHide: true/)
  assert.equal(
    rewriteDesktopConsoleSource(rewritten, 'file:///x/node_modules/@deepseek-ai/dsh-subprocess-local/lib/index.js'),
    rewritten,
  )
})

test('rewrite hides sandbox CreateProcess windows without CREATE_NO_WINDOW', () => {
  const rewritten = rewriteDesktopConsoleSource(
    sandboxAclSource,
    'file:///x/node_modules/@deepseek-ai/dsh-sandbox-windows-acl/lib/types-CNjZgO4h.js',
  )
  assert.equal(HIDDEN_CONSOLE_STARTF, 257)
  assert.equal([...rewritten.matchAll(/dwFlags: 257,/g)].length, 2)
  assert.equal([...rewritten.matchAll(/wShowWindow: 0,/g)].length, 2)
  assert.doesNotMatch(rewritten, /dwFlags: 256,/)
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
  assert.ok(rewritten.includes('"--import",\n\t\t\t"tsx/esm"'))
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
