#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  AGENT_TEAMS_MIGRATION_VERSION,
  createLegacyDesktopSettingsMigration,
  normalizeLegacyDesktopAgentTeamsSettings,
} from '../lib/settings.js'

const emptyEffort = createLegacyDesktopSettingsMigration({
  provider: 'legacy-provider',
  model: 'legacy-model',
  reasoningEffort: '',
}, 0)
assert.deepEqual(emptyEffort, {
  memberLlmProvider: 'legacy-provider',
  memberModel: 'legacy-model',
  memberReasoningMode: 'target-default',
  memberReasoningEffort: '',
  migrationVersion: AGENT_TEAMS_MIGRATION_VERSION,
})

const explicitEffort = createLegacyDesktopSettingsMigration({
  provider: 'legacy-provider',
  model: 'legacy-model',
  reasoningEffort: 'max',
}, 0)
assert.equal(explicitEffort?.memberReasoningMode, 'explicit')
assert.equal(explicitEffort?.memberReasoningEffort, 'max')

assert.deepEqual(normalizeLegacyDesktopAgentTeamsSettings({
  provider: /** @type {never} */ (null),
  model: ' legacy-model ',
  reasoningEffort: '',
}), {
  provider: '',
  model: 'legacy-model',
  reasoningEffort: '',
})

assert.equal(createLegacyDesktopSettingsMigration({ provider: 'p' }, AGENT_TEAMS_MIGRATION_VERSION), undefined)

console.log('AgentTeams legacy migration verification passed')
