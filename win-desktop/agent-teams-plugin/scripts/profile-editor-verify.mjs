import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createEmptyTeamProfile,
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
