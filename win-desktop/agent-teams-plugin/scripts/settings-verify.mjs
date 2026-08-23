import assert from 'node:assert/strict'
import {
  DEFAULT_AGENT_TEAMS_SETTINGS,
  createAgentTeamsSettingsRuntime,
  normalizeAgentTeamsSettings,
  validateAgentTeamsSettings,
} from '../lib/settings.js'

assert.deepEqual(normalizeAgentTeamsSettings({}), DEFAULT_AGENT_TEAMS_SETTINGS)
assert.equal(normalizeAgentTeamsSettings({ memberModel: '  model-x  ' }).memberModel, 'model-x')
assert.throws(
  () => validateAgentTeamsSettings({
    ...DEFAULT_AGENT_TEAMS_SETTINGS,
    memberLlmProvider: 'provider-x',
    memberModel: '',
  }),
  /requires memberModel/,
)
assert.throws(
  () => validateAgentTeamsSettings({
    ...DEFAULT_AGENT_TEAMS_SETTINGS,
    memberReasoningMode: 'explicit',
    memberReasoningEffort: '',
  }),
  /requires memberReasoningEffort/,
)

function createSettingsHarness({ initial, updateError } = {}) {
  let attached
  let current = initial
  let watcher
  const updates = []
  const warnings = []
  const registrations = []
  const scope = {
    get: () => current,
    watch: (next) => {
      watcher = next
      return () => {
        watcher = undefined
      }
    },
    update: async (patch) => {
      updates.push(patch)
      if (updateError !== undefined) throw updateError
      current = { ...current, ...patch }
    },
  }
  const ctx = {
    inject: (_services, callback) => {
      attached = () => callback({
        settings: {
          register: (namespace, schema, options) => {
            registrations.push({ namespace, schema, options })
            current ??= options.base
            return scope
          },
        },
      })
    },
    effect: (callback) => callback(),
    logger: {
      warn: (message) => warnings.push(message),
    },
  }
  return {
    ctx,
    registrations,
    updates,
    warnings,
    attach: () => attached(),
    publish: (next) => {
      current = next
      watcher(next, current)
    },
  }
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
}

const liveHarness = createSettingsHarness()
const liveRuntime = createAgentTeamsSettingsRuntime(liveHarness.ctx, {
  memberModel: '  composition-model  ',
}, undefined)
assert.equal(liveHarness.registrations.length, 0)
assert.equal(liveHarness.updates.length, 0)
assert.equal(liveRuntime.get().memberModel, 'composition-model')
assert.deepEqual(liveRuntime.migrationStatus(), { migrationVersion: 0, complete: false })

liveHarness.attach()
assert.equal(liveHarness.registrations[0].options.applies, 'live')
assert.equal(liveHarness.registrations[0].options.base.memberModel, 'composition-model')
assert.equal(liveRuntime.get().memberModel, 'composition-model')
liveHarness.publish({
  ...DEFAULT_AGENT_TEAMS_SETTINGS,
  memberModel: '  watched-model  ',
  migrationVersion: 1,
})
assert.equal(liveRuntime.get().memberModel, 'watched-model')
assert.deepEqual(liveRuntime.migrationStatus(), { migrationVersion: 1, complete: true })

const completedHarness = createSettingsHarness({
  initial: { ...DEFAULT_AGENT_TEAMS_SETTINGS, migrationVersion: 1 },
})
const completedRuntime = createAgentTeamsSettingsRuntime(completedHarness.ctx, {}, {
  provider: ' legacy-provider ',
  model: ' legacy-model ',
  reasoningEffort: ' high ',
})
completedHarness.attach()
await settle()
assert.equal(completedHarness.updates.length, 0)
assert.deepEqual(completedRuntime.migrationStatus(), { migrationVersion: 1, complete: true })

const legacy = {
  provider: ' legacy-provider ',
  model: ' legacy-model ',
  reasoningEffort: ' high ',
}
const migrationHarness = createSettingsHarness()
const migrationRuntime = createAgentTeamsSettingsRuntime(migrationHarness.ctx, {}, legacy)
assert.equal(migrationHarness.updates.length, 0)
migrationHarness.attach()
await settle()
assert.deepEqual(migrationHarness.updates, [{
  memberLlmProvider: 'legacy-provider',
  memberModel: 'legacy-model',
  memberReasoningMode: 'explicit',
  memberReasoningEffort: 'high',
  migrationVersion: 1,
}])
assert.deepEqual(migrationRuntime.migrationStatus(), { migrationVersion: 1, complete: true })

const failedLegacy = {
  provider: ' retained-provider ',
  model: ' retained-model ',
  reasoningEffort: '',
}
const failedHarness = createSettingsHarness({ updateError: new Error('persist unavailable') })
const failedRuntime = createAgentTeamsSettingsRuntime(failedHarness.ctx, {}, failedLegacy)
failedHarness.attach()
await settle()
assert.deepEqual(failedRuntime.migrationStatus(), { migrationVersion: 0, complete: false })
assert.deepEqual(failedHarness.updates, [{
  memberLlmProvider: 'retained-provider',
  memberModel: 'retained-model',
  memberReasoningMode: 'target-default',
  memberReasoningEffort: '',
  migrationVersion: 1,
}])
assert.deepEqual(failedLegacy, {
  provider: ' retained-provider ',
  model: ' retained-model ',
  reasoningEffort: '',
})
assert.deepEqual(failedHarness.warnings, [
  'agent-teams: legacy settings migration failed: Error: persist unavailable',
])
console.log('agent-teams settings verification passed')
