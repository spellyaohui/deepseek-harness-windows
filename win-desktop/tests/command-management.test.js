import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { manageDshCommand } from '../src/command-management.js'

const state = { fingerprint: 'a'.repeat(64), managed: false, available: true, occupied: false }

test('cancel makes no PATH mutation', async () => {
  const mutations = []
  const result = await manageDshCommand({
    inspect: async () => state,
    mutate: async operation => mutations.push(operation),
    confirm: async () => false,
    installed: true,
  })
  assert.equal(result, 'cancelled')
  assert.deepEqual(mutations, [])
})

test('stale confirmation makes no PATH mutation', async () => {
  const mutations = []
  let reads = 0
  await assert.rejects(manageDshCommand({
    inspect: async () => ({ ...state, fingerprint: (++reads === 1 ? 'a' : 'b').repeat(64) }),
    mutate: async operation => mutations.push(operation),
    confirm: async () => true,
    installed: true,
  }), /changed after confirmation|stale/iu)
  assert.deepEqual(mutations, [])
})

test('foreign command is explicit and cancellation is non-mutating', async () => {
  const mutations = []
  const decisions = []
  const result = await manageDshCommand({
    inspect: async () => ({ ...state, occupied: true }),
    mutate: async operation => mutations.push(operation),
    confirm: async decision => { decisions.push(decision); return false },
    installed: true,
  })
  assert.equal(result, 'cancelled')
  assert.equal(decisions[0].foreignCommand, true)
  assert.deepEqual(mutations, [])
})

test('a system PATH command cannot be shadowed by a user PATH install', async () => {
  const mutations = []
  await assert.rejects(manageDshCommand({
    inspect: async () => ({ ...state, occupied: true, machineCommand: 'C:\\tools\\dsh.exe' }),
    mutate: async operation => mutations.push(operation),
    confirm: async () => { throw new Error('must reject before confirmation') },
    installed: true,
  }), /system PATH|machine PATH/iu)
  assert.deepEqual(mutations, [])
})

test('official Windows worker identifies a machine-path command without registry writes', () => {
  const directory = fileURLToPath(new URL('../assets/cli/', import.meta.url))
  const worker = fileURLToPath(new URL('../assets/cli/command-path.ps1', import.meta.url))
  const quote = value => `'${value.replaceAll("'", "''")}'`
  const key = `Software\\DeepSeekHarness\\NonexistentSmoke${process.pid}`
  const command = `. ${quote(worker)}; Invoke-DshCommandPath -Request @{operation='inspect';directory=${quote(directory)}} -EnvironmentKey ${quote(key)} -OwnerKey ${quote(key)} -MachinePath ${quote(directory)} -MutexName ${quote(`Local\\DshSmoke${process.pid}`)} | ConvertTo-Json -Compress`
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  const observed = JSON.parse(result.stdout)
  assert.match(observed.machineCommand, /dsh\.cmd$/iu)
  assert.equal(observed.managed, false)
})

test('missing installed launcher fails before mutation', async () => {
  const mutations = []
  await assert.rejects(manageDshCommand({
    inspect: async () => ({ ...state, available: false }),
    mutate: async operation => mutations.push(operation),
    confirm: async () => true,
    installed: true,
  }), /launcher is unavailable/iu)
  assert.deepEqual(mutations, [])
})

test('remove only our managed entry after confirmation', async () => {
  const mutations = []
  const result = await manageDshCommand({
    inspect: async () => ({ ...state, managed: true }),
    mutate: async (...args) => mutations.push(args),
    confirm: async () => true,
    installed: true,
  })
  assert.equal(result, 'remove')
  assert.deepEqual(mutations, [['remove', state.fingerprint]])
})

test('development checkout cannot mutate command PATH', async () => {
  await assert.rejects(manageDshCommand({
    inspect: async () => { throw new Error('should not inspect') },
    mutate: async () => { throw new Error('should not mutate') },
    confirm: async () => true,
    installed: false,
  }), /installed application/iu)
})

test('cmd launcher quotes paths and forwards every argument', () => {
  const cmd = readFileSync(new URL('../assets/cli/dsh.cmd', import.meta.url), 'utf8')
  assert.match(cmd, /"%~dp0[^"\r\n]+DeepSeek Harness\.exe"/u)
  assert.match(cmd, /"%~dp0[^"\r\n]+@deepseek-ai\\dsh\\lib\\bin\.js" %\*/u)
  assert.match(cmd, /exit \/b %errorlevel%/iu)
})
