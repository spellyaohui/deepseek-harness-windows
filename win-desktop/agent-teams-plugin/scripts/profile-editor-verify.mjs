import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  applyMemberReasoningMode,
  createEmptyTeamProfile,
  hasUnvalidatedExplicitRoleDraft,
  normalizeProfileSnapshot,
  prepareProfileMapForSave,
} from '../lib/client/profile-editor.js'

const editorSource = await readFile(new URL('../src/client/TeamProfilesEditor.tsx', import.meta.url), 'utf8')
assert.match(
  editorSource,
  /setAgentTeamsProfiles\(\{\s*schemaVersion: 2,\s*profiles: prepared\.profiles,\s*\}\)/,
)
assert.match(
  editorSource,
  /members: \[\.\.\.members, \{ name, reasoning_mode: 'target-default' \}\]/,
)
assert.match(
  editorSource,
  /const explicitRouteBlocked = hasUnvalidatedExplicitRoleDraft\(\s*profiles,\s*committedProfiles,\s*catalog\.models,\s*catalogReady,\s*\)/,
)
assert.match(
  editorSource,
  /if \(hasUnvalidatedExplicitRoleDraft\(nextProfiles, committedProfiles, catalog\.models, catalogReady\)\)/,
)
assert.match(editorSource, /applyMemberReasoningMode\(member, mode, selectedModel\)/)
assert.match(
  editorSource,
  /disabled=\{mode === 'explicit' && \(!catalogReady \|\| \(selectedModel\?\.efforts\.length \?\? 0\) === 0\)\}/,
)

const defaults = createEmptyTeamProfile('custom-profile')
assert.deepEqual(defaults.members, [{ name: 'member', reasoning_mode: 'target-default' }])
assert.equal(defaults.taskPlanning, 'captain')

const snapshot = normalizeProfileSnapshot({
  schemaVersion: 2,
  profiles: {
    'software-delivery': {
      members: [{ name: 'analyst', reasoning_mode: 'target-default' }],
      taskPlanning: 'captain',
    },
  },
  builtInNames: ['software-delivery'],
  builtInProfiles: {
    'software-delivery': {
      members: [{ name: 'analyst', reasoning_mode: 'target-default' }],
      taskPlanning: 'captain',
    },
  },
  unsupportedPersistedVersion: false,
})
assert.equal(snapshot.schemaVersion, 2)
assert.equal(snapshot.unsupportedPersistedVersion, false)
assert.deepEqual(snapshot.builtInNames, ['software-delivery'])
assert.equal(snapshot.profiles['software-delivery']?.members[0]?.name, 'analyst')
assert.equal(snapshot.profiles['software-delivery']?.members[0]?.reasoning_mode, 'target-default')

assert.throws(
  () => normalizeProfileSnapshot({ profiles: snapshot.profiles }),
  /schemaVersion.*2/i,
)
assert.equal(normalizeProfileSnapshot({
  schemaVersion: 2,
  profiles: {
    legacy: { members: [{ name: 'old' }] },
    'invalid-mode': { members: [{ name: 'old', reasoning_mode: 'automatic' }] },
  },
  builtInNames: [],
  builtInProfiles: {},
  unsupportedPersistedVersion: false,
}).profiles.legacy, undefined)
assert.equal(normalizeProfileSnapshot({
  schemaVersion: 2,
  profiles: { 'invalid-mode': { members: [{ name: 'old', reasoning_mode: 'automatic' }] } },
  builtInNames: [],
  builtInProfiles: {},
  unsupportedPersistedVersion: false,
}).profiles['invalid-mode'], undefined)

const prepared = prepareProfileMapForSave({
  'custom-profile': {
    description: '  A saved profile  ',
    protocol: '',
    taskPlanning: 'captain',
    members: [{ name: ' analyst ', role: ' Requirements ', reasoning_mode: 'target-default' }],
  },
})
assert.deepEqual(prepared, {
  ok: true,
  profiles: {
    'custom-profile': {
      description: 'A saved profile',
      taskPlanning: 'captain',
      members: [{ name: 'analyst', role: 'Requirements', reasoning_mode: 'target-default' }],
    },
  },
})

const explicitRole = prepareProfileMapForSave({
  custom: {
    members: [{
      name: 'reviewer',
      provider: 'opencode-go',
      model: 'review-model',
      reasoning_mode: 'explicit',
      reasoning_effort: 'max',
    }],
  },
})
assert.equal(explicitRole.ok, true)
assert.equal(explicitRole.profiles.custom.members[0].reasoning_mode, 'explicit')

const singleEffortModel = {
  provider: 'opencode-go',
  id: 'single-effort-model',
  name: 'Single effort model',
  efforts: [{ id: 'high', name: 'High' }],
  defaultEffort: 'high',
}
assert.deepEqual(
  applyMemberReasoningMode({
    name: 'reviewer',
    provider: singleEffortModel.provider,
    model: singleEffortModel.id,
    reasoning_mode: 'target-default',
  }, 'explicit', singleEffortModel),
  {
    name: 'reviewer',
    provider: singleEffortModel.provider,
    model: singleEffortModel.id,
    reasoning_mode: 'explicit',
    reasoning_effort: 'high',
  },
  'switching a routed single-effort role to explicit initializes a saveable effort',
)
assert.equal(
  applyMemberReasoningMode({
    name: 'reviewer',
    provider: 'provider-a',
    model: 'model-a',
    reasoning_mode: 'explicit',
    reasoning_effort: 'low',
  }, 'explicit', {
    provider: 'provider-a',
    id: 'model-a',
    name: 'Model A',
    efforts: [{ id: 'high', name: 'High' }, { id: 'low', name: 'Low' }],
    defaultEffort: 'high',
  })?.reasoning_effort,
  'low',
  'switching to explicit preserves an already valid effort',
)
assert.equal(
  applyMemberReasoningMode({
    name: 'reviewer',
    provider: 'provider-a',
    model: 'model-a',
    reasoning_mode: 'target-default',
  }, 'explicit', {
    provider: 'provider-a',
    id: 'model-a',
    name: 'Model A',
    efforts: [{ id: 'zeta', name: 'Zeta' }, { id: 'alpha', name: 'Alpha' }],
  })?.reasoning_effort,
  'zeta',
  'switching to explicit falls back to the first catalog effort without reordering',
)

const committedProfiles = {
  hidden: {
    members: [{
      name: 'reviewer',
      provider: singleEffortModel.provider,
      model: singleEffortModel.id,
      reasoning_mode: 'target-default',
    }],
  },
  visible: {
    description: 'before',
    members: [{ name: 'analyst', reasoning_mode: 'target-default' }],
  },
}
const nextProfiles = {
  hidden: {
    members: [{
      name: 'reviewer',
      provider: singleEffortModel.provider,
      model: singleEffortModel.id,
      reasoning_mode: 'explicit',
      reasoning_effort: 'high',
    }],
  },
  visible: {
    description: 'after',
    members: [{ name: 'analyst', reasoning_mode: 'target-default' }],
  },
}
assert.equal(
  hasUnvalidatedExplicitRoleDraft(nextProfiles, committedProfiles, [], false),
  true,
  'a changed explicit role in a non-selected Profile still blocks save while the catalog is unavailable',
)
assert.equal(
  hasUnvalidatedExplicitRoleDraft(nextProfiles, committedProfiles, [singleEffortModel], true),
  false,
  'a changed explicit role is saveable when its route and effort are catalog-supported',
)
assert.equal(
  hasUnvalidatedExplicitRoleDraft({
    ...nextProfiles,
    hidden: {
      members: [{ ...nextProfiles.hidden.members[0], reasoning_effort: 'unsupported' }],
    },
  }, committedProfiles, [singleEffortModel], true),
  true,
  'a changed explicit role with an unsupported effort remains blocked',
)
assert.equal(
  hasUnvalidatedExplicitRoleDraft(nextProfiles, {
    hidden: nextProfiles.hidden,
    visible: committedProfiles.visible,
  }, [], false),
  false,
  'an unchanged historical explicit route does not block unrelated edits while the catalog is unavailable',
)

for (const member of [
  { name: 'member' },
  { name: 'member', reasoning_mode: 'automatic' },
  { name: 'member', reasoning_mode: 'route-aware', provider: 'provider-only' },
  { name: 'member', reasoning_mode: 'route-aware', model: 'model-only' },
  { name: 'member', reasoning_mode: 'target-default', reasoning_effort: 'low' },
  { name: 'member', reasoning_mode: 'route-aware', reasoning_effort: 'low' },
  { name: 'member', reasoning_mode: 'explicit', provider: 'cpa', model: 'gpt-5.6-sol' },
]) {
  assert.equal(prepareProfileMapForSave({ broken: { members: [member] } }).ok, false)
}

console.log('profile editor verification passed')
