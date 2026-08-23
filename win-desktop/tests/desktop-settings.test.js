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

const LEGACY_AGENT_TEAMS_KEYS = [
  'agentTeamsMemberProvider',
  'agentTeamsMemberModel',
  'agentTeamsMemberReasoningEffort',
]

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
function removeLegacyAgentTeamsSettings() {
  const next = { ...load() }
  for (const key of LEGACY_AGENT_TEAMS_KEYS) delete next[key]
  flush(next)
  return { ...next }
}

describe('desktop-settings logic', () => {
  it('returns defaults when no file exists', () => {
    const s = get()
    assert.equal(s.closeBehavior, 'quit')
    assert.equal(s.agentTeamsMemberModel, undefined)
    assert.equal(s.agentTeamsMemberReasoningEffort, undefined)
  })

  it('persists and reads back updates', () => {
    set({ closeBehavior: 'tray', agentTeamsMemberModel: 'opencode/glm-4.6' })
    const s = get()
    assert.equal(s.closeBehavior, 'tray')
    assert.equal(s.agentTeamsMemberModel, 'opencode/glm-4.6')
    assert.equal(s.agentTeamsMemberReasoningEffort, undefined)
  })

  it('merges partial updates without losing other fields', () => {
    set({ agentTeamsMemberModel: 'model-a' })
    set({ agentTeamsMemberReasoningEffort: 'low' })
    const s = get()
    assert.equal(s.agentTeamsMemberModel, 'model-a')
    assert.equal(s.agentTeamsMemberReasoningEffort, 'low')
    assert.equal(s.closeBehavior, 'tray')
  })

  it('falls back to defaults on malformed JSON', () => {
    writeFileSync(settingsPath, '{ broken json', 'utf8')
    const s = load()
    assert.equal(s.closeBehavior, 'quit')
    assert.equal(s.agentTeamsMemberModel, undefined)
  })

  it('removes only the migrated AgentTeams keys', () => {
    set({
      closeBehavior: 'tray',
      agentTeamsMemberProvider: 'legacy-provider',
      agentTeamsMemberModel: 'legacy-model',
      agentTeamsMemberReasoningEffort: 'max',
      futureDesktopSetting: 'preserve-me',
    })

    const s = removeLegacyAgentTeamsSettings()

    assert.equal(s.closeBehavior, 'tray')
    assert.equal(s.futureDesktopSetting, 'preserve-me')
    for (const key of LEGACY_AGENT_TEAMS_KEYS) assert.equal(s[key], undefined)
    assert.deepEqual(JSON.parse(readFileSync(settingsPath, 'utf8')), s)
  })

  it('implements the removal helper in the desktop settings module', () => {
    const source = readFileSync(new URL('../src/desktop-settings.js', import.meta.url), 'utf8')
    assert.match(source, /export function removeLegacyAgentTeamsSettings\(\)/)
  })
})

process.on('exit', () => {
  try { rmSync(TMP, { recursive: true, force: true }) } catch { /* best effort */ }
})
