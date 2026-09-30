import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  AGENT_TEAMS_SETTINGS_NAMESPACE,
  DEFAULT_AGENT_TEAMS_SETTINGS,
  createAgentTeamsSettingsRuntime,
  normalizeAgentTeamsSettings,
} from '../lib/settings.js'

assert.equal(AGENT_TEAMS_SETTINGS_NAMESPACE, 'agent-teams')
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
  let value = initialValue
  let presentation
  const ctx = {
    fiber: { id: 'agent-teams' },
    inject: (_services, callback) => { injectCallback = callback },
  }
  const attach = () => {
    let dispose
    injectCallback({
      settings: {
        configure: (next) => {
          presentation = next
          return () => { presentation = undefined }
        },
      },
      effect: (callback) => { dispose = callback() },
    })
    return {
      publish: (next) => {
        value = next
      },
      presentation: () => presentation,
      detach: () => dispose?.(),
    }
  }
  return { ctx, attach, ref: { get: () => value } }
}

const harness = createHarness('native')
const runtime = createAgentTeamsSettingsRuntime(harness.ctx, harness.ref)
assert.deepEqual(runtime.get(), { delegationMode: 'native' })
const attachment = harness.attach()
assert.deepEqual(runtime.get(), { delegationMode: 'native' })
assert.deepEqual(attachment.presentation(), { auto: false })
attachment.publish('teams')
assert.deepEqual(runtime.get(), { delegationMode: 'teams' })
attachment.detach()
assert.equal(attachment.presentation(), undefined)

const source = await readFile(new URL('../src/settings.ts', import.meta.url), 'utf8')
assert.doesNotMatch(source, /memberLlmProvider|memberModel|memberReasoningMode|memberReasoningEffort|migrationVersion|LegacyDesktop|normalizeLegacy|createLegacy|MIGRATION/)

const staleSettingNames = /(?:memberLlmProvider|memberModel|memberReasoningMode|memberReasoningEffort|migrationVersion|migrationStatus)\s*[:(]/
for (const verifier of ['lifecycle-verify.mjs', 'quality-gates-tdd.mjs', 'stress-verify.mjs']) {
  const verifierSource = await readFile(new URL(`./${verifier}`, import.meta.url), 'utf8')
  assert.doesNotMatch(verifierSource, staleSettingNames, `${verifier} contains removed AgentTeams settings`)
}
console.log('AgentTeams delegation-only settings verification passed')
