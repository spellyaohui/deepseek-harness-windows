import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeEffectiveProfileMap, prepareProfileMapForSave } from '../lib/client/profile-editor.js'
import { stagedPlanMutationFromPayload } from '../lib/staged-plan-payload.js'

test('Profile read and unrelated prompt save preserve owner tool policy selection', () => {
  const source = { audit: { taskPlanning: 'captain', members: [{ name: 'auditor', reasoning_mode: 'target-default', tool_policy: 'read-only' }] } }
  const draft = normalizeEffectiveProfileMap(source)
  draft.audit.members[0].executionPrompt = 'Review the requested scope.'
  const saved = prepareProfileMapForSave(draft)
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(saved.profiles.audit.members[0].tool_policy, 'read-only')
  assert.throws(() => normalizeEffectiveProfileMap({ audit: { ...source.audit, members: [{ ...source.audit.members[0], tool_policy: 1 }] } }), /tool_policy/)
})

test('staged CAS payload retains a selected policy and rejects a wrong-typed id', () => {
  const source = { action: 'update_member', memberName: 'auditor', provider: 'p', model: 'm', reasoningMode: 'target-default', tool_policy: 'read-only' }
  assert.equal(stagedPlanMutationFromPayload(source).toolPolicy, 'read-only')
  assert.throws(() => stagedPlanMutationFromPayload({ ...source, tool_policy: 1 }), /tool_policy/)
})
