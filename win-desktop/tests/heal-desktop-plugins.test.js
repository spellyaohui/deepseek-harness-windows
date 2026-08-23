import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import {
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

test('generated AgentTeams patch uses legacy desktop values only as a migration envelope', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/dsh-service.js', import.meta.url)), 'utf8')
  assert.match(source, /legacyDesktopSettings:/)
  assert.doesNotMatch(source, /lines\.push\(`\s*memberModel:/)
  assert.doesNotMatch(source, /lines\.push\(`\s*memberReasoningEffort:/)
  assert.equal(typeof generateAgentTeamsPatch, 'function')
})
