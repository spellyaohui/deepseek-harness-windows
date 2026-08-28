import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  DEFAULT_AGENT_TEAMS_SETTINGS,
  createAgentTeamsSettingsRuntime,
  normalizeAgentTeamsSettings,
} from '../lib/settings.js'

assert.deepEqual(normalizeAgentTeamsSettings({}), DEFAULT_AGENT_TEAMS_SETTINGS)
assert.deepEqual(normalizeAgentTeamsSettings({
  delegationMode: 'native',
  memberLlmProvider: 'legacy-provider',
  memberModel: 'legacy-model',
  memberReasoningMode: 'explicit',
  memberReasoningEffort: 'max',
  migrationVersion: 1,
}), { delegationMode: 'native' })

function createHarness(initialValue) {
  let injectCallback
  const watchers = new Set()
  let value = initialValue
  const ctx = {
    inject: (_services, callback) => { injectCallback = callback },
  }
  const attach = () => {
    let dispose
    injectCallback({
      settings: {
        register: (_namespace, _schema, options) => {
          value ??= options.base
          return {
            get: () => value,
            watch: (watcher) => {
              watchers.add(watcher)
              return () => watchers.delete(watcher)
            },
          }
        },
      },
      effect: (callback) => { dispose = callback() },
    })
    return {
      publish: (next) => {
        const previous = value
        value = next
        for (const watcher of watchers) watcher(next, previous)
      },
      detach: () => dispose?.(),
    }
  }
  return { ctx, attach }
}

const harness = createHarness(undefined)
const runtime = createAgentTeamsSettingsRuntime(harness.ctx, { delegationMode: 'native' })
assert.deepEqual(runtime.get(), { delegationMode: 'native' })
const attachment = harness.attach()
assert.deepEqual(runtime.get(), { delegationMode: 'native' })
attachment.publish({
  delegationMode: 'teams',
  memberModel: 'ignored-model',
  migrationVersion: 1,
})
assert.deepEqual(runtime.get(), { delegationMode: 'teams' })
attachment.detach()
assert.deepEqual(runtime.get(), { delegationMode: 'native' })

const source = await readFile(new URL('../src/settings.ts', import.meta.url), 'utf8')
assert.doesNotMatch(source, /memberLlmProvider|memberModel|memberReasoningMode|memberReasoningEffort|migrationVersion|LegacyDesktop|normalizeLegacy|createLegacy|MIGRATION/)
console.log('AgentTeams delegation-only settings verification passed')
