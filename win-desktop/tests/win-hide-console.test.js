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
const pwshSourcePath = require.resolve('@deepseek-ai/dsh-tool-pwsh')
const bashSourcePath = require.resolve('@deepseek-ai/dsh-tool-bash')
const fsToolSourcePath = require.resolve('@deepseek-ai/dsh-tool-fs')
const pwshSource = readFileSync(pwshSourcePath, 'utf8')
const bashSource = readFileSync(bashSourcePath, 'utf8')
const fsToolSource = readFileSync(fsToolSourcePath, 'utf8')

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
    const oldExecuteBlock = `async execute(args, exec) {
\t\t\t${validator}(args);
\t\t\tconst standingPolicy = resolveSandboxPolicy(exec);`
    const expectedPatch = `async execute(args, exec) {
\t\t\tconst standingPolicy = resolveSandboxPolicy(exec);
\t\t\t${normalizeRedundantEscalationArgs.toString()}
\t\t\targs = normalizeRedundantEscalationArgs(args, standingPolicy?.mode);
\t\t\t${validator}(args);`
    assert.notEqual(rewritten, source, `expected ${name} source to be rewritten`)
    assert.ok(rewritten.includes(`${validator}(args);`), `expected real ${name} module validator`)
    assert.ok(!rewritten.includes(oldExecuteBlock), `expected old ${name} validation order to be removed`)
    assert.ok(rewritten.includes(expectedPatch), `expected complete ${name} normalization patch before validation`)
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
