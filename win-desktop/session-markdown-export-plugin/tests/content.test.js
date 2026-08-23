import assert from 'node:assert/strict'
import test from 'node:test'

import { foldSessionContent } from '../lib/content.js'

const message = (role, source, content) => ({ id: `${role}-${content[0]?.text ?? 'message'}`, role, source, content })

function completeSessionFixture() {
  const events = [
    { seq: 1, time: 1001, type: 'turn/start', data: { turn: 1 } },
    {
      seq: 2,
      time: 1002,
      type: 'user/message',
      data: {
        turn: 1,
        step: 1,
        message: message('user', { kind: 'user' }, [{ type: 'text', text: 'Please continue this session.' }]),
      },
    },
    {
      seq: 3,
      time: 1003,
      type: 'user/message',
      data: {
        turn: 1,
        step: 1,
        message: message('user', { kind: 'plugin', plugin: 'workspace-notes', form: 'instructions' }, [{ type: 'text', text: 'Follow the workspace instructions.' }]),
      },
    },
    {
      seq: 4,
      time: 1004,
      type: 'request/header',
      data: {
        reason: 'initial',
        header: {
          config: { provider: 'provider-a', model: 'model-a', reasoningEffort: 'medium', maxTokens: 2048, temperature: 0.2 },
          system: 'Initial system prompt',
          tools: [{ name: 'read_file', description: 'Read one file', parameters: {} }],
        },
      },
    },
    {
      seq: 5,
      time: 1005,
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 1,
        message: message('assistant', { kind: 'model', provider: 'provider-a', model: 'model-a' }, [
          { type: 'text', text: 'I will inspect the session.' },
          { type: 'reasoning', text: 'Persist this visible reasoning.' },
          { type: 'tool-call', id: 'call-success', name: 'read_file', arguments: '{"raw":"tool arguments must not leak"}' },
          { type: 'future-block', payload: 'unknown content is represented safely' },
        ]),
      },
    },
    { seq: 6, time: 1006, type: 'tool/call', data: { turn: 1, step: 1, callId: 'call-success', name: 'read_file', arguments: '{"raw":"tool arguments must not leak"}' } },
    {
      seq: 7,
      time: 1007,
      type: 'tool/result',
      data: {
        turn: 1,
        step: 1,
        message: message('user', { kind: 'tool', callId: 'call-success' }, [{ type: 'tool-result', toolCallId: 'call-success', content: [{ type: 'text', text: 'SUCCESS_TOOL_RESULT_BODY_MUST_NOT_LEAK' }] }]),
        meta: { diffs: [{ path: 'src\\changed.ts', oldText: 'old file body', newText: 'new file body' }, { path: 'src\\folder\\..\\changed.ts', oldText: 'duplicate', newText: 'duplicate' }] },
      },
    },
    { seq: 8, time: 1008, type: 'tool/call', data: { turn: 1, step: 1, callId: 'call-failure', name: 'write_file', arguments: '{"raw":"failed arguments must not leak"}' } },
    {
      seq: 9,
      time: 1009,
      type: 'tool/result',
      data: {
        turn: 1,
        step: 1,
        message: message('user', { kind: 'tool', callId: 'call-failure' }, [{ type: 'tool-result', toolCallId: 'call-failure', isError: true, content: [{ type: 'text', text: 'Permission denied by the target directory.' }] }]),
        error: { name: 'PermissionError', code: 'EACCES' },
      },
    },
    { seq: 10, time: 1010, type: 'todo/write', data: { todos: [{ content: 'Old task', status: 'pending' }] } },
    {
      seq: 11,
      time: 1011,
      type: 'request/header',
      data: {
        reason: 'change',
        header: {
          config: { provider: 'provider-b', model: 'model-b', maxTokens: 4096, temperature: 0.7 },
          system: 'Changed system prompt',
          tools: [{ name: 'write_file', description: 'Write one file', parameters: {} }, { name: 'read_file', description: 'Read one file', parameters: {} }],
        },
      },
    },
    { seq: 12, time: 1012, type: 'todo/write', data: { todos: [{ content: 'Continue export', status: 'in_progress' }, { content: 'Verify output', status: 'pending' }] } },
    {
      seq: 13,
      time: 1013,
      type: 'assistant/message',
      data: {
        turn: 1,
        step: 2,
        interrupted: true,
        message: message('assistant', { kind: 'model', provider: 'provider-b', model: 'model-b' }, [{ type: 'text', text: 'Partial assistant reply.' }, { type: 'reasoning', text: 'Partial visible reasoning.' }]),
      },
    },
    { seq: 14, time: 1014, type: 'turn/end', data: { turn: 1, reason: { kind: 'max-tokens' } } },
    { seq: 15, time: 1015, type: 'turn/start', data: { turn: 2 } },
    { seq: 16, time: 1016, type: 'tool/call', data: { turn: 2, step: 1, callId: 'call-unfinished', name: 'shell_exec', arguments: '{"raw":"unfinished arguments must not leak"}' } },
  ]

  return {
    log: { session: { id: 'session-1', version: 0, createdAt: 1000 }, events },
    surface: { session: { id: 'session-1', version: 0, createdAt: 1000 }, capturedThroughSeq: 16, events: [events[1], events[2], events[4], events[6], events[12]] },
    title: 'Continuation-ready session',
  }
}

test('foldSessionContent retains the continuation-safe transcript and current surface', () => {
  const folded = foldSessionContent(completeSessionFixture())

  assert.equal(folded.title, 'Continuation-ready session')
  assert.deepEqual(folded.transcript.map((entry) => [entry.seq, entry.role, entry.source, entry.form, entry.interrupted]), [
    [2, 'user', undefined, undefined, undefined],
    [3, 'context', 'workspace-notes', 'instructions', undefined],
    [5, 'assistant', undefined, undefined, undefined],
    [13, 'assistant', undefined, undefined, true],
  ])
  assert.deepEqual(folded.transcript[2].blocks, [
    { type: 'text', text: 'I will inspect the session.' },
    { type: 'reasoning', text: 'Persist this visible reasoning.' },
    { type: 'omitted', originalType: 'future-block' },
  ])
  assert.deepEqual(folded.currentSurface.map((entry) => entry.seq), [2, 3, 5, 13])
  assert.equal(folded.latestHumanRequest?.seq, 2)
  assert.equal(folded.latestHumanRequest?.blocks[0]?.text, 'Please continue this session.')
  assert.equal(folded.latestAssistantText, 'Partial assistant reply.')
})

test('foldSessionContent folds request, todo, tool, path, and turn state without tool payloads', () => {
  const folded = foldSessionContent(completeSessionFixture())
  const serialized = JSON.stringify(folded)

  assert.deepEqual(folded.latestTodos, [{ content: 'Continue export', status: 'in_progress' }, { content: 'Verify output', status: 'pending' }])
  assert.deepEqual(folded.requestHistory, [
    { seq: 4, time: 1004, reason: 'initial', provider: 'provider-a', model: 'model-a', reasoningEffort: 'medium', maxTokens: 2048, temperature: 0.2, system: 'Initial system prompt', tools: ['read_file'] },
    { seq: 11, time: 1011, reason: 'change', provider: 'provider-b', model: 'model-b', maxTokens: 4096, temperature: 0.7, system: 'Changed system prompt', tools: ['write_file', 'read_file'] },
  ])
  assert.deepEqual(folded.latestRequest, folded.requestHistory[1])
  assert.deepEqual(folded.toolFailures, [{ seq: 9, time: 1009, tool: 'write_file', code: 'EACCES', message: 'Permission denied by the target directory.' }])
  assert.deepEqual(folded.unfinishedCalls, [{ seq: 16, time: 1016, callId: 'call-unfinished', tool: 'shell_exec' }])
  assert.deepEqual(folded.changedFiles, ['src/changed.ts'])
  assert.deepEqual(folded.turnEnds, [{ turn: 1, seq: 14, time: 1014, reason: 'max-tokens' }])
  assert.deepEqual(folded.openTurn, { turn: 2, seq: 15, time: 1015 })
  assert.equal(serialized.includes('tool arguments must not leak'), false)
  assert.equal(serialized.includes('failed arguments must not leak'), false)
  assert.equal(serialized.includes('unfinished arguments must not leak'), false)
  assert.equal(serialized.includes('SUCCESS_TOOL_RESULT_BODY_MUST_NOT_LEAK'), false)
  assert.equal(serialized.includes('old file body'), false)
  assert.equal(serialized.includes('new file body'), false)
})

test('foldSessionContent retains current direct-shape user and plugin messages', () => {
  const events = [
    {
      seq: 20,
      time: 1020,
      type: 'user/message',
      data: message('user', { kind: 'user' }, [{ type: 'text', text: 'Direct prompt.' }]),
    },
    {
      seq: 21,
      time: 1021,
      type: 'user/message',
      data: message(
        'user',
        { kind: 'plugin', plugin: 'workspace-notes', form: 'instructions' },
        [{ type: 'text', text: 'Historical workspace context.' }],
      ),
    },
  ]
  const session = { id: 'session-current-shape', version: 0, createdAt: 1000 }
  const folded = foldSessionContent({
    log: { session, events },
    surface: { session, capturedThroughSeq: 21, events },
    title: 'Current-shape fixture',
  })

  assert.deepEqual(
    folded.transcript.map((entry) => [entry.seq, entry.role, entry.source, entry.form]),
    [
      [20, 'user', undefined, undefined],
      [21, 'context', 'workspace-notes', 'instructions'],
    ],
  )
  assert.deepEqual(folded.currentSurface.map((entry) => entry.seq), [20, 21])
  assert.equal(folded.latestHumanRequest?.seq, 20)
  assert.equal(folded.latestHumanRequest?.blocks[0]?.text, 'Direct prompt.')
})
