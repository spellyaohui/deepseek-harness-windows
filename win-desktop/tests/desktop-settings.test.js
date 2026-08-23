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
  agentTeamsMemberProvider: '',
  agentTeamsMemberModel: 'deepseek-v4-flash',
  agentTeamsMemberReasoningEffort: 'max',
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
  it('returns defaults when no file exists', () => {
    const s = get()
    assert.equal(s.closeBehavior, 'quit')
    assert.equal(s.agentTeamsMemberModel, 'deepseek-v4-flash')
    assert.equal(s.agentTeamsMemberReasoningEffort, 'max')
  })

  it('persists and reads back updates', () => {
    set({ closeBehavior: 'tray', agentTeamsMemberModel: 'opencode/glm-4.6' })
    const s = get()
    assert.equal(s.closeBehavior, 'tray')
    assert.equal(s.agentTeamsMemberModel, 'opencode/glm-4.6')
    assert.equal(s.agentTeamsMemberReasoningEffort, 'max')
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
    assert.equal(s.agentTeamsMemberModel, 'deepseek-v4-flash')
  })
})

process.on('exit', () => {
  try { rmSync(TMP, { recursive: true, force: true }) } catch { /* best effort */ }
})
