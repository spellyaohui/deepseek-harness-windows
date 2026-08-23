import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadPreparedDescendant,
  prepareSessionExport,
} from '../lib/session-export.js'

function header(id, overrides = {}) {
  return { version: 0, id, createdAt: 1_000, ...overrides }
}

function userEvent(seq, text) {
  return {
    seq,
    time: 1_000 + seq,
    type: 'user/message',
    data: {
      turn: 1,
      step: 1,
      message: {
        id: `user-${seq}`,
        role: 'user',
        source: { kind: 'user' },
        content: [{ type: 'text', text }],
      },
    },
  }
}

function turnStart(seq, turn = 1) {
  return { seq, time: 1_000 + seq, type: 'turn/start', data: { turn } }
}

function titleObservation(session, title) {
  return {
    session,
    ...(title === undefined
      ? {}
      : {
          title: {
            title,
            eventSeq: 99,
            updatedAt: 2_000,
            messageSeqs: [],
            source: { kind: 'user' },
          },
        }),
  }
}

function sessionState(session, events, options = {}) {
  return {
    log: { session, events },
    surface: {
      session,
      capturedThroughSeq: events.at(-1)?.seq ?? null,
      events: options.surfaceEvents ?? events.filter((event) => event.type === 'user/message'),
    },
    title: titleObservation(session, options.title),
  }
}

function completeTrace(root, descendants = []) {
  return {
    target: { header: root, live: true, persisted: true },
    ancestors: [],
    descendants,
    complete: true,
    root: { header: root, live: true, persisted: true },
  }
}

function lineageNode(session, descendants = []) {
  return {
    session: { header: session, live: true, persisted: true },
    descendants,
  }
}

function fakeQuery(states, trace, hooks = {}) {
  const calls = []
  return {
    calls,
    async readSession(sessionId) {
      calls.push(`log:${sessionId}`)
      hooks.readSession?.(sessionId)
      return structuredClone(states.get(sessionId).log)
    },
    async readSurface(sessionId) {
      calls.push(`surface:${sessionId}`)
      hooks.readSurface?.(sessionId)
      return structuredClone(states.get(sessionId).surface)
    },
    async readTitleSnapshot(sessionId, signal) {
      calls.push(`title:${sessionId}`)
      hooks.readTitleSnapshot?.(sessionId, signal)
      return structuredClone(states.get(sessionId).title)
    },
    async traceSession(sessionId, signal) {
      calls.push(`trace:${sessionId}`)
      hooks.traceSession?.(sessionId, signal)
      return structuredClone(trace)
    },
  }
}

test('prepareSessionExport folds the live-preferred root, including an open turn', async () => {
  const root = header('root-live', { cwd: 'D:/workspace', agentPreset: 'preset-a' })
  const states = new Map([
    ['root-live', sessionState(root, [turnStart(0), userEvent(1, 'live body')], { title: 'Live title' })],
  ])
  const query = fakeQuery(states, completeTrace(root))

  const prepared = await prepareSessionExport(query, { sessionId: 'root-live', includeDescendants: false })

  assert.equal(prepared.root.session.id, 'root-live')
  assert.equal(prepared.root.title, 'Live title')
  assert.equal(prepared.root.seedLength, 0)
  assert.equal(prepared.root.content.transcript[0].blocks[0].text, 'live body')
  assert.deepEqual(prepared.root.content.openTurn, { turn: 1, seq: 0, time: 1_000 })
  assert.deepEqual(query.calls, ['log:root-live', 'surface:root-live', 'title:root-live'])
})

test('prepareSessionExport reads a cold persisted root and falls back to its session id for title', async () => {
  const root = header('cold-root')
  const states = new Map([
    ['cold-root', sessionState(root, [userEvent(0, 'cold body')])],
  ])
  const query = fakeQuery(states, completeTrace(root))

  const prepared = await prepareSessionExport(query, { sessionId: 'cold-root', includeDescendants: false })

  assert.equal(prepared.root.title, 'cold-root')
  assert.equal(prepared.root.content.title, 'cold-root')
  assert.equal(prepared.root.content.transcript[0].blocks[0].text, 'cold body')
})

test('prepareSessionExport rejects a raw and surface capture race with stable SESSION_CHANGED', async () => {
  const root = header('racing-root')
  const state = sessionState(root, [userEvent(0, 'first'), userEvent(1, 'second')], { title: 'Racing' })
  state.surface.capturedThroughSeq = 0
  const query = fakeQuery(new Map([['racing-root', state]]), completeTrace(root))

  await assert.rejects(
    prepareSessionExport(query, { sessionId: 'racing-root', includeDescendants: false }),
    (error) => error?.code === 'SESSION_CHANGED',
  )
})

test('prepareSessionExport flattens descendants depth-first in trace order and keeps descriptors lightweight', async () => {
  const root = header('root')
  const childB = header('child-b', { parentSession: 'root', delegationDepth: 1 })
  const grandchild = header('grandchild', { parentSession: 'child-b', delegationDepth: 2 })
  const childA = header('child-a', { parentSession: 'root', delegationDepth: 1 })
  const states = new Map([
    ['root', sessionState(root, [userEvent(0, 'root')], { title: 'Root' })],
    ['child-b', sessionState(childB, [userEvent(0, 'child b')], { title: 'Child B' })],
    ['grandchild', sessionState(grandchild, [userEvent(0, 'grandchild')], { title: 'Grandchild' })],
    ['child-a', sessionState(childA, [userEvent(0, 'child a')], { title: 'Child A' })],
  ])
  const trace = completeTrace(root, [
    lineageNode(childB, [lineageNode(grandchild)]),
    lineageNode(childA),
  ])
  const query = fakeQuery(states, trace)

  const prepared = await prepareSessionExport(query, { sessionId: 'root', includeDescendants: true })

  assert.deepEqual(prepared.descendants.map(({ sessionId, parentId, depth }) => ({ sessionId, parentId, depth })), [
    { sessionId: 'child-b', parentId: 'root', depth: 1 },
    { sessionId: 'grandchild', parentId: 'child-b', depth: 2 },
    { sessionId: 'child-a', parentId: 'root', depth: 1 },
  ])
  assert.deepEqual(query.calls, [
    'log:root', 'surface:root', 'title:root', 'trace:root',
    'log:child-b', 'surface:child-b', 'title:child-b',
    'log:grandchild', 'surface:grandchild', 'title:grandchild',
    'log:child-a', 'surface:child-a', 'title:child-a',
  ])
  assert.equal('content' in prepared.descendants[0], false)
  assert.equal('events' in prepared.descendants[0], false)
  assert.equal(JSON.stringify(prepared.descendants).includes('child b'), false)
})

test('loadPreparedDescendant omits the inherited transcript prefix and records the seed reference', async () => {
  const root = header('root')
  const child = header('child', { parentSession: 'root', seedLength: 2, delegationDepth: 1 })
  const states = new Map([
    ['root', sessionState(root, [userEvent(0, 'root')], { title: 'Root' })],
    ['child', sessionState(child, [userEvent(0, 'inherited 0'), userEvent(1, 'inherited 1'), userEvent(2, 'child only')], { title: 'Child' })],
  ])
  const query = fakeQuery(states, completeTrace(root, [lineageNode(child)]))
  const prepared = await prepareSessionExport(query, { sessionId: 'root', includeDescendants: true })

  const loaded = await loadPreparedDescendant(query, prepared.descendants[0])

  assert.deepEqual(loaded.transcript.map((message) => message.seq), [2])
  assert.deepEqual(loaded.currentSurface.map((message) => message.seq), [0, 1, 2])
  assert.equal(loaded.title, 'Child')
  assert.equal(loaded.inheritedFrom, 'root')
  assert.equal(loaded.inheritedEventCount, 2)
})

test('loadPreparedDescendant rejects header and final-sequence races since preflight', async () => {
  const root = header('root')
  const child = header('child', { parentSession: 'root', delegationDepth: 1 })
  const states = new Map([
    ['root', sessionState(root, [userEvent(0, 'root')], { title: 'Root' })],
    ['child', sessionState(child, [userEvent(0, 'child')], { title: 'Child' })],
  ])
  const query = fakeQuery(states, completeTrace(root, [lineageNode(child)]))
  const prepared = await prepareSessionExport(query, { sessionId: 'root', includeDescendants: true })

  states.set('child', sessionState({ ...child, createdAt: 2_000 }, [userEvent(0, 'child')], { title: 'Child' }))
  await assert.rejects(
    loadPreparedDescendant(query, prepared.descendants[0]),
    (error) => error?.code === 'SESSION_CHANGED',
  )

  states.set('child', sessionState(child, [userEvent(0, 'child'), userEvent(1, 'new event')], { title: 'Child' }))
  await assert.rejects(
    loadPreparedDescendant(query, prepared.descendants[0]),
    (error) => error?.code === 'SESSION_CHANGED',
  )
})

test('prepareSessionExport preserves known descendants and records an unresolved-parent warning', async () => {
  const root = header('root', { parentSession: 'missing-parent' })
  const child = header('child', { parentSession: 'root', delegationDepth: 1 })
  const states = new Map([
    ['root', sessionState(root, [userEvent(0, 'root')], { title: 'Root' })],
    ['child', sessionState(child, [userEvent(0, 'child')], { title: 'Child' })],
  ])
  const trace = {
    target: { header: root, live: true, persisted: true },
    ancestors: [],
    descendants: [lineageNode(child)],
    complete: false,
    unresolvedParentId: 'missing-parent',
  }
  const query = fakeQuery(states, trace)

  const prepared = await prepareSessionExport(query, { sessionId: 'root', includeDescendants: true })

  assert.deepEqual(prepared.descendants.map((entry) => entry.sessionId), ['child'])
  assert.deepEqual(prepared.warnings, [{
    code: 'INCOMPLETE_LINEAGE',
    unresolvedParentId: 'missing-parent',
    message: 'Known lineage is partial: unresolved parent missing-parent',
  }])
})

test('prepareSessionExport and descendant loading honor aborts between every observation', async () => {
  const root = header('root')
  const child = header('child', { parentSession: 'root', delegationDepth: 1 })
  const states = new Map([
    ['root', sessionState(root, [userEvent(0, 'root')], { title: 'Root' })],
    ['child', sessionState(child, [userEvent(0, 'child')], { title: 'Child' })],
  ])
  const controller = new AbortController()
  const reason = new Error('stop after raw log')
  const query = fakeQuery(states, completeTrace(root), {
    readSession(sessionId) {
      if (sessionId === 'root') controller.abort(reason)
    },
  })

  await assert.rejects(
    prepareSessionExport(query, { sessionId: 'root', includeDescendants: false }, controller.signal),
    (error) => error === reason,
  )
  assert.deepEqual(query.calls, ['log:root'])

  const queryForDescriptor = fakeQuery(states, completeTrace(root, [lineageNode(child)]))
  const prepared = await prepareSessionExport(queryForDescriptor, { sessionId: 'root', includeDescendants: true })
  const preAborted = new AbortController()
  const loadReason = new Error('do not reload child')
  preAborted.abort(loadReason)

  await assert.rejects(
    loadPreparedDescendant(queryForDescriptor, prepared.descendants[0], preAborted.signal),
    (error) => error === loadReason,
  )
  assert.equal(queryForDescriptor.calls.filter((call) => call === 'log:child').length, 1)
})
