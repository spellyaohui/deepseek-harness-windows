import assert from 'node:assert/strict'
import { resolveTeamProfile } from '../lib/profiles.js'
import { selectMemberCandidate } from '../lib/selection-policy.js'

const captain = { provider: 'cpa', model: 'cheap-captain', reasoningEffort: 'high' }

assert.deepEqual(selectMemberCandidate({
  captain,
  role: { reasoningMode: 'target-default' },
}), { provider: 'cpa', model: 'cheap-captain' })

assert.deepEqual(selectMemberCandidate({
  captain,
  role: { provider: 'opencode-go', model: 'review-model', reasoningMode: 'target-default' },
}), { provider: 'opencode-go', model: 'review-model' })

assert.deepEqual(selectMemberCandidate({
  captain,
  role: { provider: 'opencode-go', model: 'review-model', reasoningMode: 'route-aware' },
}), { provider: 'opencode-go', model: 'review-model' })

assert.deepEqual(selectMemberCandidate({
  captain,
  role: { provider: 'cpa', model: 'cheap-captain', reasoningMode: 'route-aware' },
}), { provider: 'cpa', model: 'cheap-captain', reasoningEffort: 'high' })

assert.deepEqual(selectMemberCandidate({
  captain,
  role: {
    provider: 'opencode-go',
    model: 'review-model',
    reasoningMode: 'explicit',
    reasoningEffort: 'max',
  },
}), { provider: 'opencode-go', model: 'review-model', reasoningEffort: 'max' })

assert.throws(
  () => selectMemberCandidate({ captain, role: { reasoningMode: 'invalid-mode' } }),
  /reasoning mode/i,
)
assert.throws(
  () => selectMemberCandidate({ captain, role: { provider: 'opencode-go', reasoningMode: 'target-default' } }),
  /provider.*model|route/i,
)
assert.throws(
  () => selectMemberCandidate({ captain, role: { model: 'review-model', reasoningMode: 'route-aware' } }),
  /provider.*model|route/i,
)

const profileWith = (member) => ({ demo: { members: [member] } })
assert.throws(
  () => resolveTeamProfile(profileWith({ name: 'member' }), 'demo', 8),
  /reasoning_mode/i,
)
assert.throws(
  () => resolveTeamProfile(profileWith({ name: 'member', provider: 'cpa', reasoning_mode: 'target-default' }), 'demo', 8),
  /provider.*model|route/i,
)
assert.throws(
  () => resolveTeamProfile(profileWith({ name: 'member', model: 'm', reasoning_mode: 'route-aware' }), 'demo', 8),
  /provider.*model|route/i,
)
assert.throws(
  () => resolveTeamProfile(profileWith({ name: 'member', reasoning_mode: 'target-default', reasoning_effort: 'low' }), 'demo', 8),
  /reasoning_effort|explicit/i,
)
assert.throws(
  () => resolveTeamProfile(profileWith({ name: 'member', provider: 'cpa', model: 'm', reasoning_mode: 'explicit' }), 'demo', 8),
  /reasoning_effort|explicit/i,
)

console.log('agent-teams selection policy verification passed')
