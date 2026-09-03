import assert from 'node:assert/strict'
import { resolveTeamProfile } from '../lib/profiles.js'
import { findMemberRoleTemplate, selectMemberCandidate } from '../lib/selection-policy.js'

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

const roleTemplate = (name, provider, model, reasoningMode = 'explicit', reasoningEffort = 'high', role = name) => ({
  name,
  role,
  provider,
  model,
  reasoningMode,
  ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
})
const ruleTemplates = [
  roleTemplate('analyst', 'cpa', 'analyst-model', 'explicit', 'low', 'requirements analyst'),
  roleTemplate('implementer', 'opencode-go', 'implementer-model', 'explicit', 'high', 'implementation engineer'),
  roleTemplate('tester', 'commandcodeai', 'tester-model', 'explicit', 'max', 'verification engineer'),
  roleTemplate('reviewer', 'woyaopro', 'reviewer-model', 'explicit', 'xhigh', 'code and risk reviewer'),
]

for (const [name, provider, model, effort] of [
  ['reviewer2', 'woyaopro', 'reviewer-model', 'xhigh'],
  ['reviewer3', 'woyaopro', 'reviewer-model', 'xhigh'],
  ['reviewer4', 'woyaopro', 'reviewer-model', 'xhigh'],
  ['reviewer5', 'woyaopro', 'reviewer-model', 'xhigh'],
  ['reviewer6', 'woyaopro', 'reviewer-model', 'xhigh'],
  ['analyst2', 'cpa', 'analyst-model', 'low'],
  ['implementer2', 'opencode-go', 'implementer-model', 'high'],
  ['tester2', 'commandcodeai', 'tester-model', 'max'],
]) {
  const result = findMemberRoleTemplate({ memberName: name, members: ruleTemplates })
  assert.equal(result.kind, 'matched', `${name} should match its unnumbered role`)
  assert.equal(result.template?.provider, provider)
  assert.equal(result.template?.model, model)
  assert.equal(result.template?.reasoningEffort, effort)
}

assert.equal(
  findMemberRoleTemplate({ memberName: 'reviewer-7', members: ruleTemplates }).template?.name,
  'reviewer',
)
assert.equal(
  findMemberRoleTemplate({ memberName: 'reviewer_8', members: ruleTemplates }).template?.name,
  'reviewer',
)
assert.equal(
  findMemberRoleTemplate({ memberName: 'reviewer 9', members: ruleTemplates }).template?.name,
  'reviewer',
)
const arbitrarilyLongReviewerSuffix = '9'.repeat(64)
assert.equal(
  findMemberRoleTemplate({ memberName: `reviewer${arbitrarilyLongReviewerSuffix}`, members: ruleTemplates }).template?.name,
  'reviewer',
)
assert.equal(
  findMemberRoleTemplate({ memberName: 'quality-gate2', role: 'Code and Risk Reviewer', members: ruleTemplates }).template?.name,
  'reviewer',
)
assert.equal(
  findMemberRoleTemplate({ memberName: 'new-specialist2', role: 'new role', members: ruleTemplates }).kind,
  'none',
)
assert.equal(
  findMemberRoleTemplate({ memberName: 'reviewer3', members: [
    ...ruleTemplates,
    roleTemplate('reviewer2', 'cpa', 'wrong-reviewer-model', 'explicit', 'low', 'temporary reviewer'),
  ] }).template?.model,
  'reviewer-model',
)
assert.equal(
  findMemberRoleTemplate({ memberName: 'quality-gate2', role: 'same role', members: [
    roleTemplate('first', 'cpa', 'first-model', 'explicit', 'low', 'same role'),
    roleTemplate('second', 'opencode-go', 'second-model', 'explicit', 'high', 'same role'),
  ] }).kind,
  'ambiguous',
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
