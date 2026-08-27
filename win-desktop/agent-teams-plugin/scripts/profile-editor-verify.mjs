import assert from 'node:assert/strict'

import {
  createEmptyTeamProfile,
  normalizeProfileSnapshot,
  prepareProfileMapForSave,
} from '../lib/client/profile-editor.js'

const defaults = createEmptyTeamProfile('custom-profile')
assert.deepEqual(defaults.members, [{ name: 'member' }])
assert.equal(defaults.taskPlanning, 'captain')

const snapshot = normalizeProfileSnapshot({
  profiles: {
    'software-delivery': {
      members: [{ name: 'analyst' }],
      taskPlanning: 'captain',
    },
  },
  builtInNames: ['software-delivery'],
  builtInProfiles: {
    'software-delivery': {
      members: [{ name: 'analyst' }],
      taskPlanning: 'captain',
    },
  },
})
assert.deepEqual(snapshot.builtInNames, ['software-delivery'])
assert.equal(snapshot.profiles['software-delivery']?.members[0]?.name, 'analyst')

const prepared = prepareProfileMapForSave({
  'custom-profile': {
    description: '  A saved profile  ',
    protocol: '',
    taskPlanning: 'captain',
    members: [{ name: ' analyst ', role: ' Requirements ' }],
  },
})
assert.deepEqual(prepared, {
  ok: true,
  profiles: {
    'custom-profile': {
      description: 'A saved profile',
      taskPlanning: 'captain',
      members: [{ name: 'analyst', role: 'Requirements' }],
    },
  },
})

assert.equal(
  prepareProfileMapForSave({
    broken: { members: [{ name: 'member', provider: 'provider-only' }] },
  }).ok,
  false,
)

console.log('profile editor verification passed')
