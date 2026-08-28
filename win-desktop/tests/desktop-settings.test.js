import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Test the desktop-settings logic without Electron. The module's only
 * Electron dependency is `app.getPath('userData')` for the settings file
 * path. We replicate the merge/persist logic here to verify the contract.
 */
const TMP = join(tmpdir(), `dsh-desktop-settings-test-${Date.now()}`)
mkdirSync(TMP, { recursive: true })
const settingsPath = join(TMP, 'desktop-settings.json')

const DEFAULT_SETTINGS = {
  closeBehavior: 'quit',
}

function load() {
  try {
    const raw = readFileSync(settingsPath, 'utf8')
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function flush(settings) {
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8')
}

function get() { return { ...load() } }
function set(patch) { const next = { ...load(), ...patch }; flush(next); return { ...next } }
describe('desktop-settings logic', () => {
  it('contains no AgentTeams legacy-key deletion path', () => {
    const source = readFileSync(new URL('../src/desktop-settings.js', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /LEGACY_AGENT_TEAMS_KEYS|removeLegacyAgentTeamsSettings|agentTeamsMemberProvider|agentTeamsMemberModel|agentTeamsMemberReasoningEffort/)
  })

  it('returns defaults when no file exists', () => {
    const s = get()
    assert.equal(s.closeBehavior, 'quit')
    assert.equal(s.agentTeamsMemberModel, undefined)
    assert.equal(s.agentTeamsMemberReasoningEffort, undefined)
  })

  it('persists and reads back updates', () => {
    set({ closeBehavior: 'tray', futureDesktopSetting: 'preserve-me' })
    const s = get()
    assert.equal(s.closeBehavior, 'tray')
    assert.equal(s.futureDesktopSetting, 'preserve-me')
  })

  it('merges partial updates without losing other fields', () => {
    set({
      agentTeamsProfiles: {
        schemaVersion: 2,
        profiles: { custom: { members: [{ name: 'custom', reasoning_mode: 'target-default' }] } },
      },
    })
    set({ futureDesktopSetting: 'still-preserved' })
    const s = get()
    assert.equal(s.futureDesktopSetting, 'still-preserved')
    assert.equal(s.closeBehavior, 'tray')
    assert.equal(s.agentTeamsProfiles.schemaVersion, 2)
    assert.equal(s.agentTeamsProfiles.profiles.custom.members[0].reasoning_mode, 'target-default')
  })

  it('falls back to defaults on malformed JSON', () => {
    writeFileSync(settingsPath, '{ broken json', 'utf8')
    const s = load()
    assert.equal(s.closeBehavior, 'quit')
    assert.equal(s.agentTeamsMemberModel, undefined)
  })

})

process.on('exit', () => {
  try { rmSync(TMP, { recursive: true, force: true }) } catch { /* best effort */ }
})
