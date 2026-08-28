import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

import { loadModelCatalog } from '../lib/client/model-catalog.js'
import {
  createAgentTeamsSettingsWriter,
  planDelegationModeChange,
  runAgentTeamsSettingsAction,
} from '../lib/client/settings-write.js'

const model = {
  provider: 'provider-a',
  id: 'model-a',
  name: 'Model A',
  efforts: [{ id: 'high', name: 'High' }],
  defaultEffort: 'high',
}

const ready = await loadModelCatalog(async () => new Response(JSON.stringify({ models: [model], failures: [] }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
}))
assert.equal(ready.status, 'ready')
assert.deepEqual(ready.models, [model])
assert.equal(ready.error, null)

const empty = await loadModelCatalog(async () => new Response(JSON.stringify({ models: [], failures: [] }), {
  status: 200,
  headers: { 'content-type': 'application/json' },
}))
assert.equal(empty.status, 'empty')
assert.deepEqual(empty.models, [])
assert.equal(empty.error, null)

const httpError = await loadModelCatalog(async () => new Response('', { status: 500 }))
assert.equal(httpError.status, 'error')
assert.deepEqual(httpError.models, [])
assert.equal(httpError.error, 'HTTP 500')

const startedAt = performance.now()
const timeout = await Promise.race([
  loadModelCatalog((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
  }), 100),
  new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error('timeout case did not terminate within 250ms')), 250)
  }),
])
assert.equal(timeout.status, 'error')
assert.deepEqual(timeout.models, [])
assert.equal(timeout.error, '模型目录请求超过 100ms')
assert.ok(performance.now() - startedAt < 250, 'timeout case must settle within 250ms')

const clientBundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
assert.match(clientBundle, /getAgentTeamsProfiles/)
assert.match(clientBundle, /setAgentTeamsProfiles/)
assert.match(clientBundle, /Profile configuration|Profile 配置/)
assert.match(clientBundle, /taskPlanning/)
assert.match(clientBundle, /reviewPolicy/)
assert.match(clientBundle, /agent-teams-profile-member-.*reasoning-mode/)
assert.match(clientBundle, /settings\.profiles\.reasoning\.target-default/)
assert.doesNotMatch(clientBundle, /agent-teams-member-provider/)
assert.doesNotMatch(clientBundle, /agent-teams-member-model/)
assert.doesNotMatch(clientBundle, /agent-teams-member-effort/)
assert.doesNotMatch(clientBundle, /node:(?:crypto|fs|path|child_process)/)

const orderedOps = planDelegationModeChange('native').ops

function view(revision, value = {}) {
  return {
    ns: 'agent-teams',
    schema: {},
    value,
    applies: 'live',
    secrets: [],
    revision,
  }
}

function scope(revision) {
  return {
    getSnapshot: () => ({
      status: revision === undefined ? 'loading' : 'ready',
      value: {},
      base: {},
      user: {},
      revision,
      writable: true,
      mode: 'host',
    }),
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function success(value) {
  return { result: { ok: true, value } }
}

function failure(message) {
  return { result: { ok: false, error: { message } } }
}

const serialRequests = []
const acceptedSerialViews = []
const firstWrite = deferred()
const secondWrite = deferred()
const serialWriter = createAgentTeamsSettingsWriter({
  api: {
    settings: {
      mutate: async (request) => {
        serialRequests.push(request)
        return serialRequests.length === 1 ? firstWrite.promise : secondWrite.promise
      },
      describe: async () => success({ writable: true, hasDocument: true, namespaces: [view(99)] }),
    },
  },
  scope: scope(42),
  describe: { acceptView: (next) => acceptedSerialViews.push(next) },
  timeoutMs: 500,
})
const serialOne = serialWriter.write(orderedOps)
const serialTwo = serialWriter.write([{ op: 'set', path: ['delegationMode'], value: 'native' }])
await Promise.resolve()
assert.equal(serialRequests.length, 1, 'the second write must not start before the first settles')
assert.deepEqual(serialRequests[0], {
  ns: 'agent-teams',
  ops: orderedOps,
  expectedRevision: 42,
})
firstWrite.resolve(success(view(43)))
assert.deepEqual(await serialOne, { status: 'ready', error: null })
await Promise.resolve()
assert.equal(serialRequests.length, 2)
assert.equal(serialRequests[0].expectedRevision, 42)
assert.equal(serialRequests[1].expectedRevision, 43, 'the next write uses the accepted mutation revision')
secondWrite.resolve(success(view(44)))
assert.deepEqual(await serialTwo, { status: 'ready', error: null })
assert.deepEqual(acceptedSerialViews.map((entry) => entry.revision), [43, 44])

let advancedScopeRevision = 42
const staleSuccessAccepted = []
const staleSuccessCalls = []
const staleSuccessWriter = createAgentTeamsSettingsWriter({
  api: {
    settings: {
      mutate: async (request) => {
        staleSuccessCalls.push({ kind: 'mutate', request })
        advancedScopeRevision = 44
        return success(view(43))
      },
      describe: async (request) => {
        staleSuccessCalls.push({ kind: 'describe', request })
        return success({ writable: true, hasDocument: true, namespaces: [view(44)] })
      },
    },
  },
  scope: { getSnapshot: () => ({ revision: advancedScopeRevision }) },
  describe: { acceptView: (next) => staleSuccessAccepted.push(next) },
  timeoutMs: 20,
})
const staleSuccess = await Promise.race([
  staleSuccessWriter.write(orderedOps),
  new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error('stale success did not leave busy state')), 150)
  }),
])
assert.deepEqual(staleSuccess, {
  status: 'error',
  error: 'settings mutation returned a stale or mismatched view',
})
assert.deepEqual(staleSuccessCalls.map((entry) => entry.kind), ['mutate', 'describe'])
assert.deepEqual(
  staleSuccessAccepted.map((entry) => entry.revision),
  [44],
  'a response behind the live scope revision must not be accepted before authoritative recovery',
)

for (const scenario of [
  {
    name: 'non-ok',
    mutate: async () => failure('revision conflict'),
    expected: 'revision conflict',
  },
  {
    name: 'throw',
    mutate: async () => { throw new Error('transport unavailable') },
    expected: 'transport unavailable',
  },
  {
    name: 'timeout',
    mutate: async () => new Promise(() => {}),
    expected: 'settings mutation timed out after 20ms',
  },
]) {
  const calls = []
  const accepted = []
  const writer = createAgentTeamsSettingsWriter({
    api: {
      settings: {
        mutate: scenario.mutate,
        describe: async (request) => {
          calls.push({ kind: 'describe', request })
          return success({ writable: true, hasDocument: true, namespaces: [view(8)] })
        },
      },
    },
    scope: scope(7),
    describe: { acceptView: (next) => accepted.push(next) },
    timeoutMs: 20,
  })
  const started = performance.now()
  const result = await writer.write(orderedOps)
  assert.deepEqual(result, { status: 'error', error: scenario.expected }, `${scenario.name} is terminal and visible`)
  assert.ok(performance.now() - started < 150, `${scenario.name} must leave busy state within the bound`)
  assert.deepEqual(calls, [{ kind: 'describe', request: {} }], `${scenario.name} refreshes Host truth`)
  assert.deepEqual(accepted.map((entry) => entry.revision), [8], `${scenario.name} accepts the recovered namespace`)
}

let undefinedRevisionMutates = 0
const undefinedRevisionWriter = createAgentTeamsSettingsWriter({
  api: {
    settings: {
      mutate: async () => { undefinedRevisionMutates += 1; return success(view(1)) },
      describe: async () => success({ writable: true, hasDocument: true, namespaces: [view(1)] }),
    },
  },
  scope: scope(undefined),
  describe: { acceptView: () => {} },
  timeoutMs: 20,
})
assert.deepEqual(await undefinedRevisionWriter.write(orderedOps), {
  status: 'error', error: 'settings revision is not ready',
})
assert.equal(undefinedRevisionMutates, 0, 'a missing revision must fail closed before mutation')

const lateMutation = deferred()
const lateAccepted = []
let lateMutationCalls = 0
const lateWriter = createAgentTeamsSettingsWriter({
  api: {
    settings: {
      mutate: async () => {
        lateMutationCalls += 1
        return lateMutationCalls === 1 ? lateMutation.promise : success(view(12))
      },
      describe: async () => success({ writable: true, hasDocument: true, namespaces: [view(11)] }),
    },
  },
  scope: scope(10),
  describe: { acceptView: (next) => lateAccepted.push(next) },
  timeoutMs: 20,
})
assert.equal((await lateWriter.write(orderedOps)).status, 'error')
assert.deepEqual(await lateWriter.write(orderedOps), { status: 'ready', error: null })
lateMutation.resolve(success(view(11)))
await Promise.resolve()
assert.deepEqual(lateAccepted.map((entry) => entry.revision), [11, 12], 'a late timed-out answer cannot replace newer truth')

let failedRecoveryDescribeCalls = 0
let failedRecoveryMutates = 0
const failedRecoveryWriter = createAgentTeamsSettingsWriter({
  api: {
    settings: {
      mutate: async () => {
        failedRecoveryMutates += 1
        if (failedRecoveryMutates === 1) throw new Error('wire failed')
        return success(view(16))
      },
      describe: async () => {
        failedRecoveryDescribeCalls += 1
        if (failedRecoveryDescribeCalls === 1) throw new Error('refresh failed')
        return success({ writable: true, hasDocument: true, namespaces: [view(15)] })
      },
    },
  },
  scope: scope(14),
  describe: { acceptView: () => {} },
  timeoutMs: 20,
})
assert.deepEqual(await failedRecoveryWriter.write(orderedOps), { status: 'error', error: 'wire failed; recovery failed: refresh failed' })
assert.equal(failedRecoveryMutates, 1)
assert.deepEqual(await failedRecoveryWriter.write(orderedOps), { status: 'ready', error: null })
assert.equal(failedRecoveryDescribeCalls, 2, 'Retry recovers before it mutates again')
assert.equal(failedRecoveryMutates, 2)

const actionStates = []
const actionResult = await runAgentTeamsSettingsAction(
  { write: async () => ({ status: 'error', error: 'visible failure' }) },
  orderedOps,
  (state) => actionStates.push(state),
)
assert.deepEqual(actionResult, { status: 'error', error: 'visible failure' })
assert.deepEqual(actionStates, [
  { status: 'busy', ops: orderedOps, error: null },
  { status: 'error', ops: orderedOps, error: 'visible failure' },
], 'the shared UI action exposes every failure and always leaves busy')

const settingsSectionSource = await readFile(
  new URL('../src/client/AgentTeamsSettingsSection.tsx', import.meta.url),
  'utf8',
)
assert.doesNotMatch(
  settingsSectionSource,
  /\bsettings\.(?:set|unset)\s*\(/u,
  'the settings section must not create a second bound-scope write queue',
)

console.log('settings-client verification passed: catalog states, serialized fenced writes, recovery, and atomic plans converge')
