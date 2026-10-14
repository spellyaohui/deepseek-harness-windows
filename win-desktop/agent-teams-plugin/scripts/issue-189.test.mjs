// #189 migrated to the desktop owner: provider/model are an indivisible role
// policy, not global memberModel/memberLlmProvider overrides. Real Tools +
// AgentLoop coverage is in custom-member-routing.test.mjs (different providers).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectMemberCandidate } from '../lib/selection-policy.js'

const captain = { provider: 'aihub', model: 'captain-large', reasoningEffort: 'max' }
const select = role => selectMemberCandidate({ captain, role: { reasoningMode: 'target-default', ...role } })

test('a slash inside a configured model id is preserved verbatim with its named provider', () => {
  assert.deepEqual(select({ provider: 'openrouter', model: 'google/gemini-x' }), { provider: 'openrouter', model: 'google/gemini-x' })
})
test('a named role provider is authoritative and is never discovered or re-pointed', () => {
  assert.deepEqual(select({ provider: 'ollama-cloud', model: 'deepseek-v4.1-flash' }), { provider: 'ollama-cloud', model: 'deepseek-v4.1-flash' })
})
test('explicit role effort wins independently of the captain provider and effort', () => {
  assert.deepEqual(select({ provider: 'openrouter', model: 'google/gemini-x', reasoningMode: 'explicit', reasoningEffort: 'high' }), { provider: 'openrouter', model: 'google/gemini-x', reasoningEffort: 'high' })
})
test('provider-only and model-only roles fail closed instead of selecting an unintended account', () => {
  for (const role of [{ provider: 'openrouter' }, { model: 'deepseek-v4.1-flash' }, { provider: ' ', model: 'deepseek-v4.1-flash' }, { provider: 'openrouter', model: '' }]) {
    assert.throws(() => select(role), /explicit member.*provider.*model/)
  }
})
test('no configured route retains the captain pair but target-default does not borrow its effort', () => {
  assert.deepEqual(select({}), { provider: captain.provider, model: captain.model })
})
test('route-aware effort only follows an identical provider and model pair', () => {
  assert.deepEqual(select({ reasoningMode: 'route-aware' }), captain)
  assert.deepEqual(select({ reasoningMode: 'route-aware', provider: 'other-account', model: captain.model }), { provider: 'other-account', model: captain.model })
})
