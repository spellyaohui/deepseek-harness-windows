import assert from 'node:assert/strict'
import test from 'node:test'
import * as settings from '../lib/client/settings-write.js'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const profiles = { delivery: { taskPlanning: 'captain', members: [{ name: 'reviewer', reasoning_mode: 'target-default' }] } }

async function clientModule(file) {
  const require = createRequire(import.meta.url)
  const bundled = await build({
    entryPoints: [fileURLToPath(new URL(`../src/client/${file}.tsx`, import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic', loader: { '.css': 'empty', '.module.css': 'empty' },
    plugins: [{ name: 'official-ui-transport', setup(builder) {
      builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true }))
      builder.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({ path: 'primitives', namespace: 'test' }))
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `import { createElement } from 'react'; export function Button({variant,size,...props}) { return createElement('button',props) }` }))
    } }],
  })
  return import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
}

test('Team settings render an associated default selector even without a binding', async () => {
  const { AgentTeamsSettingsSection } = await clientModule('AgentTeamsSettingsSection')
  const render = value => renderToStaticMarkup(createElement(AgentTeamsSettingsSection, {
    settings: { subscribe: () => () => {}, getSnapshot: () => ({ status: 'ready', writable: true, revision: 1, value }) },
    writer: { write: async () => { throw new Error('SSR must never write') } }, t: key => key,
  }))
  const unbound = render({ delegationMode: 'teams', profiles })
  assert.match(unbound, /<label[^>]*>[\s\S]*settings\.defaultProfile\.label[\s\S]*<select[^>]*id="agent-teams-default-profile"/, 'unbound Team settings must expose a visible, associated default Profile selector')
  assert.match(unbound, /<option value="" selected="">/, 'the first Profile must not become the default automatically')
  assert.match(unbound, /settings\.defaultProfile\.unbound/)
  const blank = render({ delegationMode: 'teams', profiles, defaultProfile: ' \t ' })
  assert.match(blank, /<option value="" selected="">/)
  assert.doesNotMatch(blank, /settings\.defaultProfile\.missing/)
  const padded = render({ delegationMode: 'teams', profiles, defaultProfile: '  delivery  ' })
  assert.match(padded, /<option value="delivery" selected="">/)
  assert.doesNotMatch(padded, /settings\.defaultProfile\.missing/)
  const missing = render({ delegationMode: 'teams', profiles, defaultProfile: 'missing' })
  assert.match(missing, /<option value="missing" selected="">/)
  assert.match(missing, /settings\.defaultProfile\.missing/)
  const native = render({ delegationMode: 'native', profiles, defaultProfile: 'delivery' })
  assert.match(native, /settings\.defaultProfile\.native/)
  const emptySeed = render({ delegationMode: 'teams', profiles: { delivery: { ...profiles.delivery, taskPlanning: 'seed', tasks: [] } }, defaultProfile: 'delivery' })
  assert.match(emptySeed, /settings\.profiles\.emptySeed/, 'zero-task fixed templates visibly explain why ordinary Teams cannot start')
})

test('default selector disables during save, displays failure, and ignores late feedback after unmount', async () => {
  const { DefaultTeamProfileSettings } = await clientModule('DefaultTeamProfileSettings')
  // Existing dependencies have no DOM renderer. Execute the real component and
  // event handler with a bounded hook transport; CAS behavior is tested separately.
  const dispatcher = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher
  const states = [], refs = [], cleanups = [], requests = []
  let stateIndex, refIndex, finish
  const writer = { write: (ops, baseline) => {
    requests.push({ ops, baseline })
    return new Promise(resolve => { finish = resolve })
  } }
  const value = { delegationMode: 'teams', profiles }
  function render() {
    stateIndex = 0; refIndex = 0
    const previous = dispatcher.current
    dispatcher.current = {
      useState(initial) {
        const index = stateIndex++
        if (!(index in states)) states[index] = initial
        return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
      },
      useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial } },
      useEffect(effect) { if (cleanups.length === 0) cleanups.push(effect()) },
    }
    try { return DefaultTeamProfileSettings({ value, writer, disabled: false, t: key => key }) }
    finally { dispatcher.current = previous }
  }
  function find(node, type) {
    if (!node || typeof node !== 'object') return undefined
    if (node.type === type) return node
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found }
  }
  const selection = find(render(), 'select').props.onChange({ currentTarget: { value: 'delivery' } })
  assert.equal(find(render(), 'select').props.disabled, true)
  assert.equal(render().props['aria-busy'], true)
  assert.deepEqual(requests, [{ ops: [{ op: 'set', path: ['defaultProfile'], value: 'delivery' }], baseline: settings.profileDraftSignature(value) }])
  finish({ status: 'error', error: 'fixture refusal' })
  await selection
  assert.equal(find(render(), 'select').props.disabled, false)
  assert.match(renderToStaticMarkup(render()), /role="alert"/, 'failed save is announced near the field')
  const retry = find(render(), 'select').props.onChange({ currentTarget: { value: 'delivery' } })
  finish({ status: 'ready', error: null })
  await retry
  assert.match(renderToStaticMarkup(render()), /settings\.defaultProfile\.saved/)
  const late = find(render(), 'select').props.onChange({ currentTarget: { value: 'delivery' } })
  cleanups.forEach(cleanup => cleanup())
  const before = structuredClone(states)
  finish({ status: 'error', error: 'late refusal' })
  await late
  assert.deepEqual(states, before, 'unmounted selector cannot revive an old failure')
})

test('default Profile choice never guesses a Profile and saves only the binding', () => {
  assert.equal(typeof settings.planDefaultProfileChange, 'function', 'the Team default selector needs its own binding write')
  assert.deepEqual(settings.planDefaultProfileChange('delivery').ops, [{ op: 'set', path: ['defaultProfile'], value: 'delivery' }])
  assert.deepEqual(settings.planDefaultProfileChange('').ops, [{ op: 'unset', path: ['defaultProfile'] }])
})

test('deleting a padded default Profile shows the bound-delete warning in the real editor', async () => {
  const { TeamProfilesEditor } = await clientModule('TeamProfilesEditor')
  const dispatcher = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher
  const states = [], refs = []
  let stateIndex, refIndex, effects
  const snapshot = { status: 'ready', revision: 1, value: { profiles, defaultProfile: '  delivery  ' } }
  const settings = { subscribe: () => () => {}, getSnapshot: () => snapshot }
  const writer = { write: async () => { throw new Error('draft delete must not write') } }
  const render = () => {
    stateIndex = 0; refIndex = 0; effects = []
    const previous = dispatcher.current
    dispatcher.current = {
      useState(initial) {
        const index = stateIndex++
        if (!(index in states)) states[index] = initial
        return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
      },
      useRef(initial) { const index = refIndex++; return refs[index] ??= { current: initial } },
      useCallback: fn => fn, useMemo: fn => fn,
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
      useEffect: effect => { effects.push(effect) },
    }
    try { return TeamProfilesEditor({ settings, writer, catalog: { status: 'ready', models: [], error: null }, onRetryCatalog() {}, t: key => key, writable: true }) }
    finally { dispatcher.current = previous }
  }
  const find = (node, predicate) => {
    if (!node || typeof node !== 'object') return undefined
    if (predicate(node)) return node
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found }
  }
  for (let pass = 0; pass < 3; pass++) { render(); effects.forEach(effect => effect()) }
  const remove = find(render(), node => node.props?.children === 'settings.profiles.delete')
  assert.equal(remove.props.disabled, false)
  remove.props.onClick()
  const warning = find(render(), node => node.props?.children === 'settings.defaultProfile.deleted')
  assert.equal(warning?.props.role, 'alert')
})

test('existing CAS writer fences a Profile draft when only its default binding changed', async () => {
  let snapshot = { revision: 1, value: { profiles, defaultProfile: 'delivery' } }
  let writes = 0
  const writer = settings.createAgentTeamsSettingsWriter({
    scope: { getSnapshot: () => snapshot }, describe: { acceptView: next => { snapshot = next } },
    api: { settings: {
      mutate: async () => { writes++; return { ok: true, value: { ns: 'agent-teams', revision: snapshot.revision + 1, value: snapshot.value } } },
      describe: async () => ({ ok: true, value: { namespaces: [{ ...snapshot, ns: 'agent-teams' }] } }),
    } },
  })
  const baseline = settings.profileDraftSignature(snapshot.value)
  const ops = [{ op: 'set', path: ['profiles'], value: {} }]
  assert.equal((await writer.write(ops, baseline)).status, 'ready', 'unchanged draft is accepted')
  snapshot = { ...snapshot, revision: 3, value: { ...snapshot.value, defaultProfile: 'other' } }
  assert.equal((await writer.write(ops, baseline)).status, 'error', 'binding-only concurrent edit must invalidate the Profile draft')
  assert.equal(writes, 1, 'the stale Profile deletion must never reach mutate')
})

test('Profile rename and delete update the bound name in the same CAS batch', () => {
  assert.equal(typeof settings.planProfileMapChange, 'function', 'Profile saves must include renamed or deleted bindings')
  const renamed = { renamed: profiles.delivery }
  assert.deepEqual(settings.planProfileMapChange(renamed, profiles, { renamed: 'delivery' }, 'delivery').ops, [
    { op: 'set', path: ['profiles'], value: renamed }, { op: 'set', path: ['defaultProfile'], value: 'renamed' },
  ])
  assert.deepEqual(settings.planProfileMapChange({}, profiles, {}, 'delivery').ops, [
    { op: 'set', path: ['profiles'], value: {} }, { op: 'unset', path: ['defaultProfile'] },
  ])
  for (const defaultProfile of [undefined, 'missing']) {
    assert.deepEqual(settings.planProfileMapChange(renamed, profiles, { renamed: 'delivery' }, defaultProfile).ops,
      [{ op: 'set', path: ['profiles'], value: renamed }], 'editing selected Profile cannot silently bind a default or replace an already missing name')
  }
})

test('padded bindings follow rename and delete but unrelated saves preserve raw text', () => {
  const renamed = { renamed: profiles.delivery }
  for (const binding of ['delivery', '  delivery  ']) {
    assert.deepEqual(settings.planProfileMapChange(renamed, profiles, { renamed: 'delivery' }, binding).ops, [
      { op: 'set', path: ['profiles'], value: renamed }, { op: 'set', path: ['defaultProfile'], value: 'renamed' },
    ])
    assert.deepEqual(settings.planProfileMapChange({}, profiles, {}, binding).ops, [
      { op: 'set', path: ['profiles'], value: {} }, { op: 'unset', path: ['defaultProfile'] },
    ])
  }
  for (const binding of ['  delivery  ', ' \t ', ' missing ']) {
    assert.deepEqual(settings.planProfileMapChange(profiles, profiles, { delivery: 'delivery' }, binding).ops,
      [{ op: 'set', path: ['profiles'], value: profiles }])
  }
})

test('raw-only binding changes invalidate both a stale save and retry', async () => {
  let snapshot = { revision: 1, value: { profiles, defaultProfile: ' delivery ' } }
  let writes = 0
  const writer = settings.createAgentTeamsSettingsWriter({
    scope: { getSnapshot: () => snapshot }, describe: { acceptView: next => { snapshot = next } },
    api: { settings: {
      mutate: async () => { writes++; return { ok: false, error: { code: 'conflict', message: 'fixture refusal' } } },
      describe: async () => ({ ok: true, value: { namespaces: [{ ...snapshot, ns: 'agent-teams' }] } }),
    } },
  })
  const baseline = settings.profileDraftSignature(snapshot.value)
  const ops = settings.planProfileMapChange({}, profiles, {}, ' delivery ').ops
  assert.equal((await writer.write(ops, baseline)).status, 'error')
  assert.equal(writes, 1)
  snapshot = { revision: 2, value: { profiles, defaultProfile: 'delivery' } }
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal((await writer.write(ops, baseline)).error, settings.PROFILE_DRAFT_CONFLICT)
    assert.equal(writes, 1)
  }
})

test('concurrent default binding changes reject Profile saves and failed retries without a write', async () => {
  assert.equal(typeof settings.profileDraftSignature, 'function', 'Profile baseline includes the default binding')
  let snapshot = { revision: 1, value: { profiles, defaultProfile: 'delivery', delegationMode: 'teams' } }
  let writes = 0
  const writer = settings.createAgentTeamsSettingsWriter({
    scope: { getSnapshot: () => snapshot },
    describe: { acceptView: value => { snapshot = value } },
    api: { settings: {
      mutate: async () => { writes++; return { ok: false, error: { code: 'conflict', message: 'fixture refusal' } } },
      describe: async () => ({ ok: true, value: { namespaces: [{ ...snapshot, ns: 'agent-teams' }] } }),
    } },
  })
  const baseline = settings.profileDraftSignature(snapshot.value)
  snapshot = { revision: 2, value: { ...snapshot.value, defaultProfile: 'other' } }
  const ops = settings.planProfileMapChange({}, profiles, {}, 'delivery').ops
  assert.equal((await writer.write(ops, baseline)).error, settings.PROFILE_DRAFT_CONFLICT)
  assert.equal(writes, 0)
  snapshot = { revision: 3, value: { profiles, defaultProfile: 'delivery', delegationMode: 'native' } }
  assert.equal((await writer.write(ops, baseline)).status, 'error')
  assert.equal(writes, 1, 'unrelated Native change does not invalidate the Profile baseline')
  snapshot = { revision: 4, value: { ...snapshot.value, defaultProfile: 'other' } }
  assert.equal((await writer.write(ops, baseline)).error, settings.PROFILE_DRAFT_CONFLICT)
  assert.equal(writes, 1, 'retry cannot borrow a revision from a changed binding')
})
