import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import {
  applyConfirmedAgentTeamsMigration,
  buildDshArgs,
  confirmAgentTeamsMigration,
  generateAgentTeamsPatch,
  healDesktopPluginFallback,
  resolveAgentTeamsPatch,
  resolveAutoModePatch,
  resolveDesktopInstallAnchor,
  resolveWinHideConsoleImport,
} from '../src/dsh-service.js'

const PLUGINS = ['@nanmicoder/dsh-auto-mode', '@nanmicoder/dsh-agent-teams']

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-heal-'))
  const profileDir = join(home, 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'dsh-profile-web', private: true }))
  return { home, profileDir }
}

test('profile directory cannot resolve desktop plugins before healing', () => {
  const { home, profileDir } = makeHome()
  try {
    const require = createRequire(join(profileDir, 'package.json'))
    for (const plugin of PLUGINS) {
      assert.throws(() => require.resolve(plugin), { code: 'MODULE_NOT_FOUND' })
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('healing the desktop install anchor makes desktop plugins resolvable from the profile', () => {
  const { home, profileDir } = makeHome()
  try {
    healDesktopPluginFallback({
      installAnchor: resolveDesktopInstallAnchor(),
      home,
    })
    const require = createRequire(join(profileDir, 'package.json'))
    for (const plugin of PLUGINS) {
      const resolved = require.resolve(`${plugin}/package.json`)
      const expected = fileURLToPath(import.meta.resolve(`${plugin}/package.json`))
      assert.equal(resolved, expected)
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('dsh web args include auto-mode and agent-teams patches', () => {
  const args = buildDshArgs('entry.js', { platform: 'win32' })
  assert.equal(args[0], '--import')
  assert.equal(args[1], resolveWinHideConsoleImport())
  assert.equal(args[args.indexOf(resolveAutoModePatch()) - 1], '--patch')
  assert.equal(args[args.indexOf(resolveAgentTeamsPatch()) - 1], '--patch')
  assert.match(resolveAgentTeamsPatch(), /config[\\/]agent-teams\.patch\.yml$/)
  assert.ok(args.includes('--no-open'))
})

test('AgentTeams migration confirmation retries incomplete status and accepts a confirmed migration', async () => {
  const responses = [
    { ok: true, json: async () => ({ migrationVersion: 0, complete: false }) },
    { ok: true, json: async () => ({ migrationVersion: 1, complete: true }) },
  ]
  let now = 0
  const complete = await confirmAgentTeamsMigration('http://127.0.0.1:11000', {
    fetcher: async (url) => {
      assert.equal(url, 'http://127.0.0.1:11000/plugins/dsh-agent-teams/migration-status')
      return responses.shift()
    },
    now: () => now,
    sleep: async () => { now += 250 },
  })
  assert.equal(complete, true)
})

test('AgentTeams migration confirmation preserves legacy settings after a failed handshake', async () => {
  const complete = await confirmAgentTeamsMigration('http://127.0.0.1:11000', {
    fetcher: async () => { throw new Error('unreachable') },
  })
  assert.equal(complete, false)
})

test('AgentTeams migration confirmation times out a stalled fetch within the remaining deadline', async () => {
  let signal
  const confirmation = confirmAgentTeamsMigration('http://127.0.0.1:11000', {
    timeoutMs: 10,
    fetcher: (_url, options) => {
      signal = options?.signal
      return new Promise(() => {})
    },
    setTimeoutFn: (callback, milliseconds) => {
      assert.equal(milliseconds, 10)
      callback()
      return 1
    },
    clearTimeoutFn: () => {},
  })
  const result = await Promise.race([
    confirmation,
    new Promise((resolve) => setTimeout(() => resolve('timed out in test'), 50)),
  ])
  assert.equal(result, false)
  assert.equal(signal?.aborted, true)
})

test('AgentTeams migration confirmation times out a stalled response body within the remaining deadline', async () => {
  let timeout
  let jsonStarted = false
  const confirmation = confirmAgentTeamsMigration('http://127.0.0.1:11000', {
    timeoutMs: 10,
    fetcher: async () => ({
      ok: true,
      json: async () => {
        jsonStarted = true
        return new Promise(() => {})
      },
    }),
    setTimeoutFn: (callback) => {
      timeout = callback
      return 1
    },
    clearTimeoutFn: () => {},
  })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(jsonStarted, true)
  timeout()
  const result = await Promise.race([
    confirmation,
    new Promise((resolve) => setTimeout(() => resolve('timed out in test'), 50)),
  ])
  assert.equal(result, false)
})

test('only a confirmed AgentTeams migration removes legacy desktop settings', async () => {
  let removals = 0
  await applyConfirmedAgentTeamsMigration('http://127.0.0.1:11000', {
    confirm: async () => true,
    remove: () => { removals += 1 },
  })
  await applyConfirmedAgentTeamsMigration('http://127.0.0.1:11000', {
    confirm: async () => false,
    remove: () => { removals += 1 },
  })
  await applyConfirmedAgentTeamsMigration('http://127.0.0.1:11000', {
    confirm: async () => 'true',
    remove: () => { removals += 1 },
  })
  await applyConfirmedAgentTeamsMigration('http://127.0.0.1:11000', {
    confirm: async () => { throw new Error('status unavailable') },
    remove: () => { removals += 1 },
  })
  assert.equal(removals, 1)
})

test('generated AgentTeams patch quotes legacy values as YAML-safe scalars', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/dsh-service.js', import.meta.url)), 'utf8')
  assert.match(source, /legacyDesktopSettings:/)
  assert.doesNotMatch(source, /lines\.push\(`\s*memberModel:/)
  assert.doesNotMatch(source, /lines\.push\(`\s*memberReasoningEffort:/)
  const home = mkdtempSync(join(tmpdir(), 'dsh-agent-teams-yaml-'))
  const legacy = {
    agentTeamsMemberProvider: 'provider #1: "quoted"',
    agentTeamsMemberModel: 'model\\path\nnext: value',
    agentTeamsMemberReasoningEffort: 'effort: #"quoted"',
  }
  try {
    const patchPath = generateAgentTeamsPatch({
      getSettings: () => legacy,
      getUserDataPath: () => home,
    })
    const patch = readFileSync(patchPath, 'utf8')
    assert.ok(patch.includes(`provider: ${JSON.stringify(legacy.agentTeamsMemberProvider)}`))
    assert.ok(patch.includes(`model: ${JSON.stringify(legacy.agentTeamsMemberModel)}`))
    assert.ok(patch.includes(`reasoningEffort: ${JSON.stringify(legacy.agentTeamsMemberReasoningEffort)}`))
    assert.doesNotMatch(patch, /provider: provider #1/)
    assert.doesNotMatch(patch, /model\\path\nnext: value/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
