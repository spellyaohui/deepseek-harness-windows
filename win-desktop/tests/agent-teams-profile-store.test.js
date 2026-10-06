import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import yaml from 'js-yaml'
import {
  AGENT_TEAMS_PROFILE_SCHEMA_VERSION,
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
  members: [{ name: 'custom', role: 'custom role', reasoning_mode: 'target-default' }],
  tasks: [{ id: 'work', subject: 'Work', assignee: 'custom', dependencies: [] }],
}

test('V2 cached profiles preserve reviewer arrays and reject malformed reviewers', () => {
  for (const requiredReviewers of [[], ['reviewer']]) {
    const profile = { ...customProfile, reviewPolicy: { codeMaxRounds: 2, requiredReviewers } }
    const document = { schemaVersion: 2, profiles: { custom: profile } }
    const snapshot = getAgentTeamsProfileSnapshot({ settings: { agentTeamsProfiles: document } })
    assert.equal(snapshot.hasPersistedProfiles, true)
    assert.deepEqual(snapshot.profiles.custom, profile, 'valid reviewer lists must not discard a saved profile')
    let saved
    writeAgentTeamsProfiles(document, { flush: value => { saved = value } })
    assert.deepEqual(saved.agentTeamsProfiles.profiles.custom, profile)
  }
  for (const requiredReviewers of [1, [''], [null]]) {
    assert.throws(() => writeAgentTeamsProfiles({
      schemaVersion: 2, profiles: { custom: { ...customProfile, reviewPolicy: { requiredReviewers } } },
    }), /requiredReviewers/)
  }
})

test('desktop snapshot distinguishes saved V2 records from built-in defaults', () => {
  assert.equal(getAgentTeamsProfileSnapshot().hasPersistedProfiles, false)
  assert.equal(getAgentTeamsProfileSnapshot({ settings: { agentTeamsProfiles: { profiles: {} } } }).hasPersistedProfiles, false)
  assert.equal(getAgentTeamsProfileSnapshot({ settings: { agentTeamsProfiles: { schemaVersion: 2, profiles: {} } } }).hasPersistedProfiles, true)
})

test('reading and saving cached V2 prompts preserves their exact whitespace', () => {
  const prompt = '\n  使用中文交流。\n    保留代码块缩进。\n'
  const profile = { ...customProfile, protocol: prompt, executionPrompt: prompt,
    members: [{ ...customProfile.members[0], executionPrompt: prompt }] }
  const document = { schemaVersion: 2, profiles: { custom: profile } }
  assert.deepEqual(getAgentTeamsProfileSnapshot({ settings: { agentTeamsProfiles: document } }).profiles.custom, profile)
  let saved
  writeAgentTeamsProfiles(document, { flush: value => { saved = value } })
  assert.deepEqual(saved.agentTeamsProfiles.profiles.custom, profile)
})

test('built-in profiles are complete V2 documents', () => {
  const snapshot = getAgentTeamsProfileSnapshot({ settings: {} })

  assert.equal(AGENT_TEAMS_PROFILE_SCHEMA_VERSION, 2)
  assert.equal(snapshot.schemaVersion, 2)
  assert.equal(snapshot.unsupportedPersistedVersion, false)
  assert.deepEqual(snapshot.builtInNames, ['software-delivery'])
  assert.deepEqual(snapshot.builtInProfiles, BUILTIN_AGENT_TEAMS_PROFILES)
  assert.deepEqual(BUILTIN_AGENT_TEAMS_PROFILE_NAMES, ['software-delivery'])
  assert.equal(snapshot.profiles['software-delivery'].taskPlanning, 'captain')
  assert.deepEqual(
    snapshot.profiles['software-delivery'].members.map((member) => member.name),
    ['analyst', 'implementer', 'tester', 'reviewer'],
  )
  assert.ok(snapshot.profiles['software-delivery'].members.every((member) => (
    member.reasoning_mode === 'target-default'
    && member.provider === undefined
    && member.model === undefined
    && member.reasoning_effort === undefined
  )))
})

test('profile snapshots are deep clones and cannot mutate built-in defaults', () => {
  const first = getAgentTeamsProfileSnapshot({ settings: {} })
  first.profiles['software-delivery'].members[0].role = 'changed'

  const second = getAgentTeamsProfileSnapshot({ settings: {} })
  assert.equal(second.profiles['software-delivery'].members[0].role, '需求分析师')
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
    schemaVersion: 2,
    profiles: {
      'software-delivery': edited,
      custom: customProfile,
    },
  }, {
    load: () => settings,
    flush: (next) => { flushed = next },
  })

  assert.equal(result.profiles['software-delivery'].description, 'edited')
  assert.deepEqual(result.profiles.custom, customProfile)
  assert.equal(flushed.closeBehavior, 'tray')
  assert.deepEqual(flushed.futureSetting, { keep: true })
  assert.equal(flushed.agentTeamsProfiles.schemaVersion, 2)
  assert.equal(flushed.agentTeamsProfiles.profiles['software-delivery'].description, 'edited')
})

test('reading a stored V2 document preserves custom profiles and reinserts a missing built-in', () => {
  const profiles = readAgentTeamsProfiles({
    agentTeamsProfiles: { schemaVersion: 2, profiles: { custom: customProfile } },
  })

  assert.deepEqual(Object.keys(profiles), ['software-delivery', 'custom'])
  assert.deepEqual(profiles.custom, customProfile)
  assert.equal(profiles['software-delivery'].taskPlanning, 'captain')
})

test('malformed V2 stored profiles are ignored without blocking the built-in profile', () => {
  const profiles = readAgentTeamsProfiles({
    agentTeamsProfiles: {
      schemaVersion: 2,
      profiles: {
        'software-delivery': { members: [] },
        'bad profile': customProfile,
        broken: { members: [{ role: 'missing name' }] },
        valid: customProfile,
      },
    },
  })

  assert.equal(profiles['software-delivery'].members.length, 4)
  assert.equal(profiles['bad profile'], undefined)
  assert.equal(profiles.broken, undefined)
  assert.deepEqual(profiles.valid, customProfile)
})

test('writing rejects unsafe profile maps at the persistence boundary', () => {
  assert.throws(() => writeAgentTeamsProfiles([], { load: () => ({}), flush: () => {} }), /profile document.*object/u)
  assert.throws(() => writeAgentTeamsProfiles({ 'bad profile': customProfile }, { load: () => ({}), flush: () => {} }), /profile document/u)
  assert.throws(() => writeAgentTeamsProfiles({ schemaVersion: 2, profiles: { empty: { members: [] } } }, { load: () => ({}), flush: () => {} }), /members/u)
  const sixteenCustom = Object.fromEntries(
    Array.from({ length: 16 }, (_value, index) => [`custom-${index}`, customProfile]),
  )
  assert.throws(() => writeAgentTeamsProfiles({ schemaVersion: 2, profiles: sixteenCustom }, { load: () => ({}), flush: () => {} }), /after built-in merge/u)
})

test('an unversioned profile map is not imported', () => {
  const snapshot = getAgentTeamsProfileSnapshot({
    settings: { agentTeamsProfiles: { custom: { members: [{ name: 'old' }] } } },
  })

  assert.equal(snapshot.unsupportedPersistedVersion, true)
  assert.deepEqual(Object.keys(snapshot.profiles), ['software-delivery'])
})

test('explicit role policy requires a complete route and effort', () => {
  assert.throws(() => writeAgentTeamsProfiles({
    schemaVersion: 2,
    profiles: { custom: { members: [{ name: 'reviewer', reasoning_mode: 'explicit' }] } },
  }, { load: () => ({}), flush: () => undefined }), /provider.*model.*reasoning_effort/i)
})

test('profile members require reasoning_mode', () => {
  assert.throws(() => writeAgentTeamsProfiles({
    schemaVersion: 2,
    profiles: { custom: { members: [{ name: 'reviewer' }] } },
  }, { load: () => ({}), flush: () => undefined }), /reasoning_mode.*must not be empty/i)
})

test('profile members reject invalid reasoning_mode', () => {
  assert.throws(() => writeAgentTeamsProfiles({
    schemaVersion: 2,
    profiles: { custom: { members: [{ name: 'reviewer', reasoning_mode: 'automatic' }] } },
  }, { load: () => ({}), flush: () => undefined }), /reasoning_mode.*invalid/i)
})

test('profile members reject provider without model', () => {
  assert.throws(() => writeAgentTeamsProfiles({
    schemaVersion: 2,
    profiles: {
      custom: { members: [{ name: 'reviewer', provider: 'cpa', reasoning_mode: 'route-aware' }] },
    },
  }, { load: () => ({}), flush: () => undefined }), /provider.*model.*set together/i)
})

test('profile members reject model without provider', () => {
  assert.throws(() => writeAgentTeamsProfiles({
    schemaVersion: 2,
    profiles: {
      custom: { members: [{ name: 'reviewer', model: 'gpt-5.6-sol', reasoning_mode: 'route-aware' }] },
    },
  }, { load: () => ({}), flush: () => undefined }), /provider.*model.*set together/i)
})

for (const reasoning_mode of ['target-default', 'route-aware']) {
  test(`profile members reject reasoning_effort for ${reasoning_mode}`, () => {
    assert.throws(() => writeAgentTeamsProfiles({
      schemaVersion: 2,
      profiles: {
        custom: { members: [{ name: 'reviewer', reasoning_mode, reasoning_effort: 'low' }] },
      },
    }, { load: () => ({}), flush: () => undefined }), /reasoning_effort.*only for explicit/i)
  })
}

test('the static software-delivery patch is V2-complete', () => {
  const patch = readFileSync(new URL('../config/agent-teams.patch.yml', import.meta.url), 'utf8')
  assert.equal((patch.match(/reasoning_mode: target-default/g) ?? []).length, 4)
  const entry = yaml.load(patch).flatMap((item) => item.insert ?? []).find((item) => item.id === 'agent-teams')
  assert.deepEqual(entry.config.profiles, BUILTIN_AGENT_TEAMS_PROFILES)
})

test('built-in Chinese guidance covers each role and survives V2 save and reload', () => {
  const profile = BUILTIN_AGENT_TEAMS_PROFILES['software-delivery']
  for (const field of ['description', 'protocol', 'executionPrompt']) {
    assert.match(profile[field], /[\u4e00-\u9fff]/u)
  }
  const responsibilities = {
    analyst: /验收标准.*依赖/su,
    implementer: /inScope.*changedPaths/su,
    tester: /实际.*未执行/su,
    reviewer: /独立.*严重程度/su,
  }
  for (const member of profile.members) {
    assert.match(member.role, /[\u4e00-\u9fff]/u)
    assert.match(member.executionPrompt, responsibilities[member.name])
    assert.match(member.executionPrompt, /队长/u)
    assert.match(member.executionPrompt, /中文/u)
  }
  assert.equal(new Set(profile.members.map((member) => member.executionPrompt)).size, 4)
  let stored = {}
  writeAgentTeamsProfiles({ schemaVersion: 2, profiles: BUILTIN_AGENT_TEAMS_PROFILES }, {
    load: () => stored,
    flush: (next) => { stored = next },
  })
  assert.deepEqual(readAgentTeamsProfiles(stored), BUILTIN_AGENT_TEAMS_PROFILES)
})

test('reading saved V2 guidance preserves user prompts and exposes current built-ins for explicit restore', () => {
  const edited = cloneAgentTeamsProfiles(BUILTIN_AGENT_TEAMS_PROFILES)['software-delivery']
  edited.description = 'My saved description'
  edited.protocol = 'My saved protocol'
  edited.executionPrompt = 'My saved team instructions'
  edited.members[0].executionPrompt = 'My saved analyst instructions'
  const settings = { agentTeamsProfiles: { schemaVersion: 2, profiles: { 'software-delivery': edited } } }
  const before = JSON.stringify(settings)
  const snapshot = getAgentTeamsProfileSnapshot({ settings })
  assert.deepEqual(snapshot.profiles['software-delivery'], edited)
  assert.deepEqual(snapshot.builtInProfiles, BUILTIN_AGENT_TEAMS_PROFILES)
  assert.equal(JSON.stringify(settings), before, 'reading must not migrate or overwrite stored prompts')
})

test('cloneAgentTeamsProfiles rejects arrays and returns independent JSON data', () => {
  assert.throws(() => cloneAgentTeamsProfiles([]), /object map/u)
  const source = { custom: customProfile }
  const clone = cloneAgentTeamsProfiles(source)
  clone.custom.members[0].name = 'changed'
  assert.equal(source.custom.members[0].name, 'custom')
})
