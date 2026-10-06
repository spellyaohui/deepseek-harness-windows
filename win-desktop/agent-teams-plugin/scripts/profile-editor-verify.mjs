import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  applyMemberReasoningMode,
  createCommittedProfileNameMap,
  createEmptyTeamProfile,
  hasUnvalidatedFallbackDraft,
  hasUnvalidatedExplicitRoleDraft,
  normalizeProfileSnapshot,
  normalizeEffectiveProfileMap,
  importDesktopProfileDraft,
  prepareProfileMapForSave,
  renameCommittedProfileName,
} from '../lib/client/profile-editor.js'

const editorSource = await readFile(new URL('../src/client/TeamProfilesEditor.tsx', import.meta.url), 'utf8')
assert.match(
  editorSource,
  /writer\.write\(\[\s*\{ op: 'set', path: \['profiles'\], value: prepared\.profiles as unknown as JsonValue \},\s*\], baselineSignature\)/,
  'Profile Save must use the official serialized CAS writer with its draft baseline',
)
assert.doesNotMatch(editorSource, /setAgentTeamsProfiles/, 'legacy desktop choices remain read-only')
assert.match(editorSource, /importDesktopProfileDraft\(profiles, snapshot\)/, 'legacy choices require explicit draft import')
assert.match(
  editorSource,
  /members: \[\.\.\.members, \{ name, reasoning_mode: 'target-default' \}\]/,
)
assert.match(
  editorSource,
  /const explicitRouteBlocked = hasUnvalidatedExplicitRoleDraft\(\s*profiles,\s*committedProfiles,\s*catalog\.models,\s*catalogReady,\s*committedProfileNames,\s*\)/,
)
assert.match(
  editorSource,
  /if \(hasUnvalidatedExplicitRoleDraft\(\s*nextProfiles,\s*committedProfiles,\s*catalog\.models,\s*catalogReady,\s*renamed\.committedProfileNames,\s*\)\)/,
)
assert.match(editorSource, /applyMemberReasoningMode\(member, mode, selectedModel\)/)
assert.match(
  editorSource,
  /disabled=\{mode === 'explicit' && \(!catalogReady \|\| \(selectedModel\?\.efforts\.length \?\? 0\) === 0\)\}/,
)
assert.match(
  editorSource,
  /function FallbackFields\(\{\s*catalog,\s*catalogReady,/,
  'fallback controls must receive the shared Harness catalog',
)
assert.match(
  editorSource,
  /<FallbackFields\s+catalog=\{catalog\}\s+catalogReady=\{catalogReady\}/,
  'Profile and member fallbacks must use the same catalog-aware control',
)
assert.doesNotMatch(
  editorSource,
  /function FallbackFields[\s\S]*?<input[\s\S]*?fallback\?\.provider/,
  'fallback Provider must not remain a free-text field',
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
  hasPersistedProfiles: true,
})
assert.equal(snapshot.schemaVersion, 2)
assert.equal(snapshot.unsupportedPersistedVersion, false)
assert.deepEqual(snapshot.builtInNames, ['software-delivery'])
assert.equal(snapshot.profiles['software-delivery']?.members[0]?.name, 'analyst')
assert.equal(snapshot.profiles['software-delivery']?.members[0]?.reasoning_mode, 'target-default')

const effectiveOnly = { 'official-only': { members: [{ name: 'analyst', reasoning_mode: 'target-default', executionPrompt: '保留已保存的角色提示词。' }] } }
const effectiveOriginal = structuredClone(effectiveOnly)
const effectiveDraft = normalizeEffectiveProfileMap(effectiveOnly)
assert.deepEqual(effectiveDraft, effectiveOnly)
effectiveDraft['official-only'].members[0].executionPrompt = '独立草稿。'
assert.deepEqual(effectiveOnly, effectiveOriginal, 'native reads isolate the editable draft without rewriting saved prompts')
const importedDraft = importDesktopProfileDraft(effectiveOnly, snapshot)
assert.deepEqual(importedDraft['official-only'], effectiveOriginal['official-only'], 'explicit cache import preserves official-only Profiles')
assert.deepEqual(importedDraft['software-delivery'], snapshot.profiles['software-delivery'])
importedDraft['software-delivery'].members[0].name = 'draft-only'
assert.equal(snapshot.profiles['software-delivery'].members[0].name, 'analyst', 'the historical cache is read-only')
assert.deepEqual(effectiveOnly, effectiveOriginal, 'import has no durable write side effect')
assert.throws(() => importDesktopProfileDraft(effectiveOnly, { ...snapshot, unsupportedPersistedVersion: true }), /Unsupported/)
assert.throws(() => importDesktopProfileDraft(effectiveOnly, { ...snapshot, hasPersistedProfiles: false }), /No saved/,
  'built-in defaults returned without a saved desktop record cannot masquerade as saved choices')
assert.equal(normalizeProfileSnapshot({ ...snapshot, hasPersistedProfiles: undefined }).hasPersistedProfiles, false, 'old IPC without provenance never advertises a saved desktop import')
assert.throws(() => normalizeEffectiveProfileMap({ broken: { members: [{ name: 'lost-route', provider: 'provider-a', reasoning_mode: 'explicit' }] } }), /provider|model|reasoning_effort/,
  'an invalid effective route fails visibly instead of disappearing from the editor')
assert.deepEqual(normalizeEffectiveProfileMap({}), {}, 'an empty official map never silently restores desktop defaults')

const promptBytes = {
  protocol: '\n  协作协议：保留原有缩进。\n',
  executionPrompt: '\n    团队提示词：逐字保留。\n\n',
  members: [{ name: 'analyst', reasoning_mode: 'target-default', executionPrompt: '\n  成员提示词：保留结尾空行。\n\n' }],
}
const promptDraft = normalizeEffectiveProfileMap({ delivery: promptBytes })
promptDraft.delivery.description = '仅调整描述。'
const promptSaved = prepareProfileMapForSave(promptDraft)
assert.equal(promptSaved.ok, true)
for (const field of ['protocol', 'executionPrompt']) assert.equal(promptSaved.profiles.delivery[field], promptBytes[field], 'unrelated edits preserve saved prompt bytes')
assert.equal(promptSaved.profiles.delivery.members[0].executionPrompt, promptBytes.members[0].executionPrompt)
const promptLegacy = normalizeProfileSnapshot({ ...snapshot, profiles: { delivery: promptBytes } })
const promptImport = importDesktopProfileDraft({}, promptLegacy)
assert.deepEqual(promptImport.delivery, promptBytes, 'legacy import preserves prompt whitespace instead of silently rewriting it')

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
      provider: 'alt-gateway',
      model: 'review-model',
      reasoning_mode: 'explicit',
      reasoning_effort: 'max',
    }],
  },
})
assert.equal(explicitRole.ok, true)
assert.equal(explicitRole.profiles.custom.members[0].reasoning_mode, 'explicit')

const singleEffortModel = {
  provider: 'alt-gateway',
  id: 'single-effort-model',
  name: 'Single effort model',
  efforts: [{ id: 'high', name: 'High' }],
  defaultEffort: 'high',
}
const fallbackCatalog = [
  { provider: 'provider-a', id: 'fallback-a', name: 'Fallback A', efforts: [] },
  { provider: 'provider-b', id: 'fallback-b', name: 'Fallback B', efforts: [] },
]
const committedFallbackProfiles = {
  hidden: {
    fallback: { provider: 'provider-a', model: 'fallback-a' },
    members: [{
      name: 'reviewer',
      reasoning_mode: 'target-default',
      fallback: { provider: 'provider-a', model: 'fallback-a' },
    }],
  },
  visible: {
    description: 'before',
    members: [{ name: 'analyst', reasoning_mode: 'target-default' }],
  },
}
const committedFallbackNames = { hidden: 'hidden', visible: 'visible' }
const profileFallbackChangedProfiles = {
  hidden: {
    ...committedFallbackProfiles.hidden,
    fallback: { provider: 'provider-b', model: 'fallback-b' },
  },
  visible: { ...committedFallbackProfiles.visible, description: 'after' },
}
const memberFallbackChangedProfiles = {
  hidden: {
    ...committedFallbackProfiles.hidden,
    members: [{
      ...committedFallbackProfiles.hidden.members[0],
      fallback: { provider: 'provider-b', model: 'fallback-b' },
    }],
  },
  visible: { ...committedFallbackProfiles.visible, description: 'after' },
}
const missingFallbackProfiles = {
  hidden: {
    ...committedFallbackProfiles.hidden,
    fallback: { provider: 'provider-a', model: 'missing-model' },
  },
  visible: committedFallbackProfiles.visible,
}
assert.equal(
  hasUnvalidatedFallbackDraft(profileFallbackChangedProfiles, committedFallbackProfiles, [], false, committedFallbackNames),
  true,
  'a changed Profile fallback in a non-selected Profile blocks save while the catalog is unavailable',
)
assert.equal(
  hasUnvalidatedFallbackDraft(memberFallbackChangedProfiles, committedFallbackProfiles, [], false, committedFallbackNames),
  true,
  'a changed member fallback in a non-selected Profile blocks save while the catalog is unavailable',
)
assert.equal(
  hasUnvalidatedFallbackDraft(profileFallbackChangedProfiles, committedFallbackProfiles, fallbackCatalog, true, committedFallbackNames),
  false,
  'a changed Profile fallback is saveable when its route exists in the shared catalog',
)
assert.equal(
  hasUnvalidatedFallbackDraft(memberFallbackChangedProfiles, committedFallbackProfiles, fallbackCatalog, true, committedFallbackNames),
  false,
  'a changed member fallback is saveable when its route exists in the shared catalog',
)
assert.equal(
  hasUnvalidatedFallbackDraft(missingFallbackProfiles, committedFallbackProfiles, fallbackCatalog, true, committedFallbackNames),
  true,
  'a changed fallback route that is absent from the shared catalog remains blocked',
)
assert.equal(
  hasUnvalidatedFallbackDraft(committedFallbackProfiles, committedFallbackProfiles, [], false, committedFallbackNames),
  false,
  'an unchanged historical fallback does not block unrelated edits while the catalog is unavailable',
)
assert.equal(
  hasUnvalidatedFallbackDraft(
    { renamed: committedFallbackProfiles.hidden },
    committedFallbackProfiles,
    [],
    false,
    { renamed: 'hidden' },
  ),
  false,
  'renaming preserves the committed source identity of an unchanged fallback',
)
assert.equal(
  hasUnvalidatedFallbackDraft(
    { copied: committedFallbackProfiles.hidden },
    committedFallbackProfiles,
    [],
    false,
    {},
  ),
  true,
  'copying a Profile does not inherit fallback source identity',
)
assert.equal(
  hasUnvalidatedFallbackDraft(
    { hidden: committedFallbackProfiles.hidden },
    committedFallbackProfiles,
    [],
    false,
    {},
  ),
  true,
  'a new Profile reusing a removed name does not inherit fallback source identity',
)
assert.equal(
  prepareProfileMapForSave(profileFallbackChangedProfiles, {
    catalog: [],
    catalogReady: false,
    committedProfiles: committedFallbackProfiles,
    committedProfileNames: committedFallbackNames,
  }).ok,
  false,
  'the save normalizer must reject changed fallback routes when the catalog cannot validate them',
)
assert.equal(
  prepareProfileMapForSave(profileFallbackChangedProfiles, {
    catalog: fallbackCatalog,
    catalogReady: true,
    committedProfiles: committedFallbackProfiles,
    committedProfileNames: committedFallbackNames,
  }).ok,
  true,
  'the save normalizer accepts a changed Profile fallback only when the catalog contains it',
)
assert.equal(
  prepareProfileMapForSave(missingFallbackProfiles, {
    catalog: fallbackCatalog,
    catalogReady: true,
    committedProfiles: committedFallbackProfiles,
    committedProfileNames: committedFallbackNames,
  }).ok,
  false,
  'the save normalizer rejects changed fallbacks that are missing from the catalog',
)
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
const committedProfileNames = { hidden: 'hidden', visible: 'visible' }
assert.equal(
  hasUnvalidatedExplicitRoleDraft(nextProfiles, committedProfiles, [], false, committedProfileNames),
  true,
  'a changed explicit role in a non-selected Profile still blocks save while the catalog is unavailable',
)
assert.equal(
  hasUnvalidatedExplicitRoleDraft(nextProfiles, committedProfiles, [singleEffortModel], true, committedProfileNames),
  false,
  'a changed explicit role is saveable when its route and effort are catalog-supported',
)
assert.equal(
  hasUnvalidatedExplicitRoleDraft({
    ...nextProfiles,
    hidden: {
      members: [{ ...nextProfiles.hidden.members[0], reasoning_effort: 'unsupported' }],
    },
  }, committedProfiles, [singleEffortModel], true, committedProfileNames),
  true,
  'a changed explicit role with an unsupported effort remains blocked',
)
assert.equal(
  hasUnvalidatedExplicitRoleDraft(nextProfiles, {
    hidden: nextProfiles.hidden,
    visible: committedProfiles.visible,
  }, [], false, committedProfileNames),
  false,
  'an unchanged historical explicit route does not block unrelated edits while the catalog is unavailable',
)

const committedExplicitProfiles = {
  oldName: {
    members: [{
      name: 'reviewer',
      provider: singleEffortModel.provider,
      model: singleEffortModel.id,
      reasoning_mode: 'explicit',
      reasoning_effort: 'high',
    }],
  },
}
const renamedExplicitProfiles = {
  newName: committedExplicitProfiles.oldName,
}
assert.deepEqual(createCommittedProfileNameMap(committedExplicitProfiles), { oldName: 'oldName' })
assert.deepEqual(
  renameCommittedProfileName({ oldName: 'oldName' }, 'oldName', 'newName'),
  { newName: 'oldName' },
  'renaming moves the committed identity without deriving it from Profile contents',
)
assert.deepEqual(
  renameCommittedProfileName({}, 'copiedName', 'renamedCopy'),
  {},
  'renaming a copied or new Profile does not invent a committed identity',
)
assert.equal(
  hasUnvalidatedExplicitRoleDraft(
    renamedExplicitProfiles,
    committedExplicitProfiles,
    [],
    false,
    { newName: 'oldName' },
  ),
  false,
  'renaming a Profile preserves the committed identity of an unchanged explicit route during catalog failure',
)
assert.equal(
  hasUnvalidatedExplicitRoleDraft({
    newName: {
      members: [{ ...committedExplicitProfiles.oldName.members[0], reasoning_effort: 'max' }],
    },
  }, committedExplicitProfiles, [], false, { newName: 'oldName' }),
  true,
  'changing the explicit effort while renaming still requires catalog validation',
)
assert.equal(
  hasUnvalidatedExplicitRoleDraft({
    copiedName: committedExplicitProfiles.oldName,
  }, committedExplicitProfiles, [], false, {}),
  true,
  'a copied Profile does not inherit the source committed identity',
)
assert.equal(
  hasUnvalidatedExplicitRoleDraft({
    oldName: committedExplicitProfiles.oldName,
  }, committedExplicitProfiles, [], false, {}),
  true,
  'a new Profile reusing a removed committed name does not inherit that committed identity',
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
