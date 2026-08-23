import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
assert.throws(
  () => validateAgentTeamsSettings({
    ...DEFAULT_AGENT_TEAMS_SETTINGS,
    memberLlmProvider: ' provider-x ',
    memberModel: ' ',
  }),
  /requires memberModel/,
)
assert.throws(
  () => validateAgentTeamsSettings({
    ...DEFAULT_AGENT_TEAMS_SETTINGS,
    memberReasoningMode: 'explicit',
    memberReasoningEffort: ' ',
  }),
  /requires memberReasoningEffort/,
)
assert.doesNotThrow(() => validateAgentTeamsSettings({
  ...DEFAULT_AGENT_TEAMS_SETTINGS,
  memberLlmProvider: ' ',
  memberModel: ' ',
}))

function createSettingsHarness({ initialStates = [], updateError, deferUpdates = false } = {}) {
  let inject
  let deferredUpdate
  const attachments = []
  const updates = []
  const warnings = []
  const outerDisposers = []
  const ctx = {
    inject: (_services, callback) => {
      inject = callback
    },
    effect: (callback) => {
      outerDisposers.push(callback())
    },
    logger: {
      warn: (message) => warnings.push(message),
    },
  }
  const attach = () => {
    const index = attachments.length
    let value = initialStates[index]
    const watchers = new Set()
    const scopedDisposers = []
    const attachment = {
      registration: undefined,
      detach: () => {
        for (const dispose of scopedDisposers.splice(0).reverse()) dispose?.()
      },
      publish: (next) => {
        const previous = value
        value = next
        for (const watcher of watchers) watcher(next, previous)
      },
    }
    const scope = {
      get: () => value,
      watch: (watcher) => {
        watchers.add(watcher)
        return () => watchers.delete(watcher)
      },
      update: (patch) => {
        updates.push({ index, patch })
        if (deferUpdates) {
          return new Promise((resolve, reject) => {
            deferredUpdate = { resolve, reject }
          })
        }
        if (updateError !== undefined) return Promise.reject(updateError)
        value = { ...value, ...patch }
        return Promise.resolve()
      },
    }
    inject({
      settings: {
        register: (namespace, schema, options) => {
          attachment.registration = { namespace, schema, options }
          value ??= options.base
          return scope
        },
      },
      effect: (callback) => {
        scopedDisposers.push(callback())
      },
    })
    attachments.push(attachment)
    return attachment
  }
  return {
    ctx,
    attachments,
    updates,
    warnings,
    attach,
    rejectDeferredUpdate: (error) => deferredUpdate.reject(error),
    outerDisposers,
  }
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
}

const liveHarness = createSettingsHarness({
  initialStates: [undefined, {
    ...DEFAULT_AGENT_TEAMS_SETTINGS,
    memberModel: '  reattached-model  ',
    migrationVersion: 1,
  }],
})
const liveRuntime = createAgentTeamsSettingsRuntime(liveHarness.ctx, {
  memberModel: '  composition-model  ',
}, undefined)
assert.equal(liveHarness.attachments.length, 0)
assert.equal(liveHarness.updates.length, 0)
assert.equal(liveRuntime.get().memberModel, 'composition-model')
assert.deepEqual(liveRuntime.migrationStatus(), { migrationVersion: 0, complete: false })

const firstAttachment = liveHarness.attach()
assert.equal(firstAttachment.registration.options.applies, 'live')
assert.equal(firstAttachment.registration.options.base.memberModel, 'composition-model')
assert.equal(liveRuntime.get().memberModel, 'composition-model')
firstAttachment.publish({
  ...DEFAULT_AGENT_TEAMS_SETTINGS,
  memberModel: '  watched-model  ',
  migrationVersion: 1,
})
assert.equal(liveRuntime.get().memberModel, 'watched-model')
firstAttachment.detach()
assert.equal(liveRuntime.get().memberModel, 'composition-model')

const secondAttachment = liveHarness.attach()
assert.equal(liveRuntime.get().memberModel, 'reattached-model')
firstAttachment.publish({
  ...DEFAULT_AGENT_TEAMS_SETTINGS,
  memberModel: 'stale-model',
  migrationVersion: 1,
})
assert.equal(liveRuntime.get().memberModel, 'reattached-model')
secondAttachment.publish({
  ...DEFAULT_AGENT_TEAMS_SETTINGS,
  memberModel: '  live-model  ',
  migrationVersion: 1,
})
assert.equal(liveRuntime.get().memberModel, 'live-model')
assert.deepEqual(liveRuntime.migrationStatus(), { migrationVersion: 1, complete: true })

const completedHarness = createSettingsHarness({
  initialStates: [{ ...DEFAULT_AGENT_TEAMS_SETTINGS, migrationVersion: 1 }],
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

const migrationHarness = createSettingsHarness()
const migrationRuntime = createAgentTeamsSettingsRuntime(migrationHarness.ctx, {}, {
  provider: ' legacy-provider ',
  model: ' legacy-model ',
  reasoningEffort: ' high ',
})
assert.equal(migrationHarness.updates.length, 0)
migrationHarness.attach()
await settle()
assert.deepEqual(migrationHarness.updates.map(({ patch }) => patch), [{
  memberLlmProvider: 'legacy-provider',
  memberModel: 'legacy-model',
  memberReasoningMode: 'explicit',
  memberReasoningEffort: 'high',
  migrationVersion: 1,
}])
assert.deepEqual(migrationRuntime.migrationStatus(), { migrationVersion: 1, complete: true })

const retryHarness = createSettingsHarness({
  initialStates: [undefined, {
    ...DEFAULT_AGENT_TEAMS_SETTINGS,
    memberModel: '  recovered-model  ',
  }],
  deferUpdates: true,
})
const retryRuntime = createAgentTeamsSettingsRuntime(retryHarness.ctx, {}, {
  provider: ' retained-provider ',
  model: ' retained-model ',
  reasoningEffort: '',
})
const retryFirstAttachment = retryHarness.attach()
assert.equal(retryHarness.updates.length, 1)
retryFirstAttachment.detach()
assert.equal(retryRuntime.get().memberModel, '')
retryHarness.attach()
assert.equal(retryHarness.updates.length, 1)
assert.equal(retryRuntime.get().memberModel, 'recovered-model')
retryHarness.rejectDeferredUpdate(new Error('persist unavailable'))
await settle()
assert.equal(retryHarness.updates.length, 1)
assert.equal(retryRuntime.get().memberModel, 'recovered-model')
assert.deepEqual(retryHarness.warnings, [
  'agent-teams: legacy settings migration failed: Error: persist unavailable',
])

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
assert.match(packageJson.scripts.verify, /node scripts\/settings-verify\.mjs/)

const settingsExports = await import('../lib/settings.js')
const { resolveMemberLlmSelection } = await import('../lib/members.js')
const { Config } = await import('../lib/index.js')
assert.equal(settingsExports.normalizeLegacyDesktopAgentTeamsSettings({}), undefined)
assert.deepEqual(settingsExports.normalizeLegacyDesktopAgentTeamsSettings({
  provider: ' provider-x ',
  model: ' ',
  reasoningEffort: '',
}), { provider: 'provider-x', model: '', reasoningEffort: '' })
assert.equal(settingsExports.normalizeMemberModelOverride(' '), undefined)
assert.equal(settingsExports.normalizeMemberModelOverride('  member-model  '), 'member-model')
const defaultConfig = Config({})
assert.equal(defaultConfig.memberModel, '')
assert.deepEqual(await resolveMemberLlmSelection({
  llm: {
    resolveCallConfig: async (selection) => selection,
  },
}, {
  session: {
    requestHeader: () => ({
      config: {
        provider: 'captain-provider',
        model: 'captain-model',
        reasoningEffort: 'captain-effort',
      },
    }),
  },
  options: {},
}, {
  defaults: settingsExports.DEFAULT_AGENT_TEAMS_SETTINGS,
}), {
  provider: 'captain-provider',
  model: 'captain-model',
})

const ordinaryHarness = createSettingsHarness()
createAgentTeamsSettingsRuntime(ordinaryHarness.ctx, {}, settingsExports.normalizeLegacyDesktopAgentTeamsSettings({}))
ordinaryHarness.attach()
assert.equal(ordinaryHarness.updates.length, 0)
console.log('agent-teams settings verification passed')
