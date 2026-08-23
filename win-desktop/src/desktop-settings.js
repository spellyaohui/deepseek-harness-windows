/**
 * Desktop settings store: a small JSON file in the Electron userData
 * directory. Holds desktop-only preferences that the web UI does not own:
 * close-to-tray behavior. Legacy AgentTeams preferences are read only for the
 * first-launch migration and are removed after the host confirms it.
 *
 * The store is synchronous on read (cached in memory) and async on write
 * (flushed to disk). The main process notifies the renderer through IPC
 * whenever settings change.
 */
import * as electron from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const { app } = electron

/** Default settings when no config file exists yet. */
const DEFAULT_SETTINGS = {
  /** "tray" hides to tray on close; "quit" exits the app. */
  closeBehavior: 'quit',
}

const LEGACY_AGENT_TEAMS_KEYS = [
  'agentTeamsMemberProvider',
  'agentTeamsMemberModel',
  'agentTeamsMemberReasoningEffort',
]

/** @type {Record<string, unknown> | null} */
let cache = null
/** @type {string | null} */
let settingsPath = null

function resolveSettingsPath() {
  if (settingsPath !== null) return settingsPath
  settingsPath = join(app.getPath('userData'), 'desktop-settings.json')
  return settingsPath
}

/**
 * Load settings from disk into the in-memory cache. Called once at startup;
 * subsequent reads use the cache. A missing or malformed file falls back to
 * defaults silently — first launch or a hand-deleted file should not block.
 * @returns {Record<string, unknown>} the merged settings object.
 */
export function loadDesktopSettings() {
  if (cache !== null) return cache
  const path = resolveSettingsPath()
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    cache = { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

/**
 * Persist the full settings object to disk and update the cache.
 * @param {Record<string, unknown>} settings - the complete settings to save.
 */
function flushSettings(settings) {
  const path = resolveSettingsPath()
  try {
    mkdirSync(join(path, '..'), { recursive: true })
  } catch {
    // The userData directory always exists; ignore.
  }
  writeFileSync(path, JSON.stringify(settings, null, 2), 'utf8')
  cache = settings
}

/**
 * Read the current settings (from cache, loading first if needed).
 * @returns {Record<string, unknown>} a shallow copy of the current settings.
 */
export function getDesktopSettings() {
  const current = loadDesktopSettings()
  return { ...current }
}

/**
 * Apply a partial update to settings, persist, and return the full new state.
 * @param {Record<string, unknown>} patch - key/value pairs to merge.
 * @returns {Record<string, unknown>} the merged settings after the update.
 */
export function setDesktopSettings(patch) {
  const current = loadDesktopSettings()
  const next = { ...current, ...patch }
  flushSettings(next)
  return { ...next }
}

/**
 * Remove only the Electron-era AgentTeams preferences after the host has
 * durably migrated them. The desktop document itself, close behavior, and
 * unknown future settings remain untouched.
 */
export function removeLegacyAgentTeamsSettings() {
  const next = { ...loadDesktopSettings() }
  for (const key of LEGACY_AGENT_TEAMS_KEYS) delete next[key]
  flushSettings(next)
}
