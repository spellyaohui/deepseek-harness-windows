import assert from 'node:assert/strict'
import { selectMemberCandidate } from '../lib/selection-policy.js'

const captain = { provider: 'captain-p', model: 'captain-m', reasoningEffort: 'high' }
const settings = {
  delegationMode: 'teams',
  memberLlmProvider: 'settings-p',
  memberModel: 'settings-m',
  memberReasoningMode: 'explicit',
  memberReasoningEffort: 'low',
  migrationVersion: 1,
}

assert.deepEqual(selectMemberCandidate({ captain, settings, explicit: {} }), {
  provider: 'settings-p', model: 'settings-m', reasoningEffort: 'low',
})
assert.deepEqual(selectMemberCandidate({
  captain, settings, explicit: { provider: 'role-p', model: 'role-m', reasoningEffort: 'max' },
}), { provider: 'settings-p', model: 'settings-m', reasoningEffort: 'low' })
assert.deepEqual(selectMemberCandidate({
  captain, settings, explicit: { provider: '', model: '', reasoningEffort: '' },
}), { provider: 'settings-p', model: 'settings-m', reasoningEffort: 'low' })
assert.deepEqual(selectMemberCandidate({
  captain,
  settings,
  explicit: { provider: 'guessed-provider', model: 'guessed-model', reasoningEffort: 'max' },
}), { provider: 'settings-p', model: 'settings-m', reasoningEffort: 'low' })

const targetDefaultSettings = {
  ...settings,
  memberLlmProvider: '',
  memberModel: '',
  memberReasoningMode: 'target-default',
  memberReasoningEffort: '',
}
assert.deepEqual(selectMemberCandidate({
  captain,
  settings: targetDefaultSettings,
  explicit: { provider: '  ', model: '', reasoningEffort: ' ' },
}), { provider: 'captain-p', model: 'captain-m' })
assert.deepEqual(selectMemberCandidate({
  captain,
  settings: targetDefaultSettings,
  explicit: { provider: 'role-p', model: 'role-m', reasoningEffort: 'max' },
}), { provider: 'role-p', model: 'role-m', reasoningEffort: 'max' })
assert.equal(selectMemberCandidate({
  captain,
  settings: targetDefaultSettings,
  explicit: {},
}).reasoningEffort, undefined)
assert.equal(selectMemberCandidate({
  captain,
  settings: { ...settings, memberLlmProvider: '', memberModel: '', memberReasoningMode: 'route-aware', memberReasoningEffort: '' },
  explicit: { provider: '', model: ' ', reasoningEffort: '  ' },
}).reasoningEffort, 'high')
assert.equal(selectMemberCandidate({
  captain,
  settings: { ...settings, memberLlmProvider: 'other-p', memberModel: 'other-m', memberReasoningMode: 'route-aware', memberReasoningEffort: '' },
  explicit: {},
}).reasoningEffort, undefined)
console.log('agent-teams selection policy verification passed')
