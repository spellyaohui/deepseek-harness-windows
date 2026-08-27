import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BUILTIN_AGENT_TEAMS_PROFILES,
  BUILTIN_AGENT_TEAMS_PROFILE_NAMES,
  cloneAgentTeamsProfiles,
  getAgentTeamsProfileSnapshot,
  readAgentTeamsProfiles,
  writeAgentTeamsProfiles,
} from '../src/agent-teams-profile-store.js'

const customProfile = {
  description: 'Custom team',
  taskPlanning: 'seed',
  members: [{ name: 'custom', role: 'custom role' }],
  tasks: [{ id: 'work', subject: 'Work', assignee: 'custom', dependencies: [] }],
}

test('first snapshot exposes the four-role captain-planning software profile', () => {
  const snapshot = getAgentTeamsProfileSnapshot({ settings: {} })

  assert.deepEqual(snapshot.builtInNames, ['software-delivery'])
  assert.deepEqual(snapshot.builtInProfiles, BUILTIN_AGENT_TEAMS_PROFILES)
  assert.deepEqual(BUILTIN_AGENT_TEAMS_PROFILE_NAMES, ['software-delivery'])
  assert.equal(snapshot.profiles['software-delivery'].taskPlanning, 'captain')
  assert.deepEqual(
    snapshot.profiles['software-delivery'].members.map((member) => member.name),
    ['analyst', 'implementer', 'tester', 'reviewer'],
  )
  assert.ok(snapshot.profiles['software-delivery'].members.every((member) => (
    member.provider === undefined
    && member.model === undefined
    && member.reasoning_effort === undefined
  )))
})

test('profile snapshots are deep clones and cannot mutate built-in defaults', () => {
  const first = getAgentTeamsProfileSnapshot({ settings: {} })
  first.profiles['software-delivery'].members[0].role = 'changed'

  const second = getAgentTeamsProfileSnapshot({ settings: {} })
  assert.equal(second.profiles['software-delivery'].members[0].role, 'Requirements analyst')
  assert.notEqual(first.profiles, BUILTIN_AGENT_TEAMS_PROFILES)
})

test('saving an edited built-in preserves the edit and unrelated settings', () => {
  const settings = { closeBehavior: 'tray', futureSetting: { keep: true } }
  let flushed
  const edited = {
    ...BUILTIN_AGENT_TEAMS_PROFILES['software-delivery'],
    description: 'edited',
  }

  const result = writeAgentTeamsProfiles({
    'software-delivery': edited,
    custom: customProfile,
  }, {
    load: () => settings,
    flush: (next) => { flushed = next },
  })

  assert.equal(result.profiles['software-delivery'].description, 'edited')
  assert.deepEqual(result.profiles.custom, customProfile)
  assert.equal(flushed.closeBehavior, 'tray')
  assert.deepEqual(flushed.futureSetting, { keep: true })
  assert.equal(flushed.agentTeamsProfiles['software-delivery'].description, 'edited')
})

test('reading a stored map preserves custom profiles and reinserts a missing built-in', () => {
  const profiles = readAgentTeamsProfiles({
    agentTeamsProfiles: { custom: customProfile },
  })

  assert.deepEqual(Object.keys(profiles), ['software-delivery', 'custom'])
  assert.deepEqual(profiles.custom, customProfile)
  assert.equal(profiles['software-delivery'].taskPlanning, 'captain')
})

test('malformed stored profiles are ignored without blocking the built-in profile', () => {
  const profiles = readAgentTeamsProfiles({
    agentTeamsProfiles: {
      'software-delivery': { members: [] },
      'bad profile': customProfile,
      broken: { members: [{ role: 'missing name' }] },
      valid: customProfile,
    },
  })

  assert.equal(profiles['software-delivery'].members.length, 4)
  assert.equal(profiles['bad profile'], undefined)
  assert.equal(profiles.broken, undefined)
  assert.deepEqual(profiles.valid, customProfile)
})

test('writing rejects unsafe profile maps at the persistence boundary', () => {
  assert.throws(() => writeAgentTeamsProfiles([], { load: () => ({}), flush: () => {} }), /object map/u)
  assert.throws(() => writeAgentTeamsProfiles({ 'bad profile': customProfile }, { load: () => ({}), flush: () => {} }), /profile name/u)
  assert.throws(() => writeAgentTeamsProfiles({ empty: { members: [] } }, { load: () => ({}), flush: () => {} }), /members/u)
  const sixteenCustom = Object.fromEntries(
    Array.from({ length: 16 }, (_value, index) => [`custom-${index}`, customProfile]),
  )
  assert.throws(() => writeAgentTeamsProfiles(sixteenCustom, { load: () => ({}), flush: () => {} }), /after built-in merge/u)
})

test('cloneAgentTeamsProfiles rejects arrays and returns independent JSON data', () => {
  assert.throws(() => cloneAgentTeamsProfiles([]), /object map/u)
  const source = { custom: customProfile }
  const clone = cloneAgentTeamsProfiles(source)
  clone.custom.members[0].name = 'changed'
  assert.equal(source.custom.members[0].name, 'custom')
})
