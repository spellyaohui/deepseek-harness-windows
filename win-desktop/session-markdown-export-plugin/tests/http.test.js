import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import { apply } from '../lib/index.js'
import {
  SESSION_MARKDOWN_EXPORT_PATH,
  createSessionMarkdownExportHandler,
} from '../lib/http.js'

const NOW = new Date('2026-08-23T01:02:03.000Z')

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

function state(session, title, text) {
  const events = [userEvent(0, text)]
  return {
    log: { session, events },
    surface: { session, capturedThroughSeq: 0, events },
    title: {
      session,
      title: { title, eventSeq: 0, updatedAt: 2_000, messageSeqs: [0], source: { kind: 'user' } },
    },
  }
}

function lineageNode(session, descendants = []) {
  return { session: { header: session, live: true, persisted: true }, descendants }
}

function queryFixture({ children = [], hooks = {}, rootOverrides = {} } = {}) {
  const root = header('root', { cwd: 'D:/workspace', agentPreset: 'default', ...rootOverrides })
  const states = new Map([
    ['root', state(root, 'Unicode 续接 🧠', '你好 from root')],
    ...children.map((child, index) => [
      child.id,
      state(child, `Child ${index + 1}`, `child ${index + 1}`),
    ]),
  ])
  const calls = []
  const counts = new Map()
  const invoke = async (name, sessionId, signal) => {
    calls.push(`${name}:${sessionId}`)
    const key = `${name}:${sessionId}`
    const count = (counts.get(key) ?? 0) + 1
    counts.set(key, count)
    await hooks[name]?.({ sessionId, signal, count, calls })
    const current = states.get(sessionId)
    if (current === undefined) {
      const error = new Error(`session "${sessionId}" not found`)
      error.code = 'SESSION_QUERY_SESSION_NOT_FOUND'
      throw error
    }
    return structuredClone(current[name])
  }
  return {
    root,
    calls,
    counts,
    query: {
      readSession: (sessionId, signal) => invoke('log', sessionId, signal),
      readSurface: (sessionId, signal) => invoke('surface', sessionId, signal),
      readTitleSnapshot: (sessionId, signal) => invoke('title', sessionId, signal),
      async traceSession(sessionId, signal) {
        calls.push(`trace:${sessionId}`)
        await hooks.trace?.({ sessionId, signal, count: 1, calls })
        return {
          target: { header: root, live: true, persisted: true },
          ancestors: [],
          descendants: children.map((child) => lineageNode(child)),
          complete: true,
          root: { header: root, live: true, persisted: true },
        }
      },
    },
  }
}

class FakeRequest extends EventEmitter {
  constructor(method, url) {
    super()
    this.method = method
    this.url = url
    this.aborted = false
    this.complete = false
  }

  abort() {
    this.aborted = true
    this.emit('aborted')
  }
}

class FakeResponse extends EventEmitter {
  constructor(writeResults = []) {
    super()
    this.statusCode = 200
    this.headers = {}
    this.headersSent = false
    this.writableEnded = false
    this.destroyed = false
    this.writable = true
    this.chunks = []
    this.writeResults = [...writeResults]
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode
    this.headers = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]),
    )
    this.headersSent = true
    return this
  }

  write(chunk) {
    this.headersSent = true
    this.chunks.push(Buffer.from(chunk))
    return this.writeResults.shift() ?? true
  }

  end(chunk) {
    if (chunk !== undefined) this.chunks.push(Buffer.from(chunk))
    this.headersSent = true
    this.writableEnded = true
    this.writable = false
    this.emit('finish')
    return this
  }

  body() {
    return Buffer.concat(this.chunks).toString('utf8')
  }
}

function handlerFor(query, errors = []) {
  return createSessionMarkdownExportHandler({
    query,
    now: () => new Date(NOW),
    logError: (error) => errors.push(error),
  })
}

async function request(handler, method, url, response = new FakeResponse()) {
  const req = new FakeRequest(method, url)
  await handler(req, response)
  return { req, res: response }
}

test('HEAD performs the full preflight and returns GET content headers without a body', async () => {
  const child = header('child', { parentSession: 'root', delegationDepth: 1 })
  const headFixture = queryFixture({ children: [child] })
  const getFixture = queryFixture({ children: [child] })

  const { res: head } = await request(
    handlerFor(headFixture.query),
    'HEAD',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root&includeDescendants=true`,
  )
  const { res: get } = await request(
    handlerFor(getFixture.query),
    'GET',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root&includeDescendants=true`,
  )

  assert.equal(head.statusCode, 200)
  assert.deepEqual(head.headers, get.headers)
  assert.equal(head.body(), '')
  assert.equal(headFixture.counts.get('log:child'), 2)
  assert.equal(get.body().includes('你好 from root'), true)
  assert.match(get.body(), /### Delegated session · `Child 1`/u)
  assert.equal(get.headers['content-type'], 'text/markdown; charset=utf-8')
  assert.equal(get.headers['cache-control'], 'no-store')
  assert.equal(get.headers['x-content-type-options'], 'nosniff')
  assert.match(get.headers['content-disposition'], /^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/u)
  assert.match(get.headers['content-disposition'], /Unicode%20%E7%BB%AD%E6%8E%A5%20%F0%9F%A7%A0-2026-08-23\.md/u)
})

test('invalid, repeated, and unknown query parameters fail closed before querying', async () => {
  const cases = [
    '',
    '?sessionId=',
    '?sessionId=root&sessionId=root',
    '?sessionId=root&includeDescendants=1',
    '?sessionId=root&includeDescendants=true&includeDescendants=false',
    '?sessionId=root&unexpected=true',
  ]

  for (const suffix of cases) {
    const fixture = queryFixture()
    const { res } = await request(handlerFor(fixture.query), 'GET', `${SESSION_MARKDOWN_EXPORT_PATH}${suffix}`)
    assert.equal(res.statusCode, 400, suffix)
    assert.deepEqual(JSON.parse(res.body()), {
      error: { code: 'INVALID_REQUEST', message: 'Invalid session export request' },
    })
    assert.deepEqual(fixture.calls, [])
  }
})

test('absent includeDescendants defaults to true and includes traced descendants', async () => {
  const child = header('child', { parentSession: 'root', delegationDepth: 1 })
  const fixture = queryFixture({ children: [child] })

  const { res } = await request(
    handlerFor(fixture.query),
    'GET',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root`,
  )

  assert.equal(res.statusCode, 200)
  assert.equal(fixture.calls.includes('trace:root'), true)
  assert.match(res.body(), /include_descendants: true/u)
  assert.match(res.body(), /### Delegated session · `Child 1`/u)
})

test('GET exposes root lineage and seed boundary metadata', async () => {
  const fixture = queryFixture({
    rootOverrides: {
      parentSession: 'parent-root',
      delegationDepth: 1,
      seedLength: 3,
    },
  })

  const { res } = await request(
    handlerFor(fixture.query),
    'GET',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root&includeDescendants=false`,
  )

  assert.equal(res.statusCode, 200)
  assert.match(res.body(), /Parent session: `parent-root`\./u)
  assert.match(res.body(), /Delegation depth: 1\./u)
  assert.match(res.body(), /Inherited seed history: 3 events from `parent-root`\./u)
  assert.match(res.body(), /Sequences below 3 are inherited history; sequences at or above 3 belong to this session log\./u)
})

test('explicit includeDescendants=false does not trace lineage', async () => {
  const fixture = queryFixture()

  const { res } = await request(
    handlerFor(fixture.query),
    'GET',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root&includeDescendants=false`,
  )

  assert.equal(res.statusCode, 200)
  assert.equal(fixture.calls.some((call) => call.startsWith('trace:')), false)
  assert.match(res.body(), /include_descendants: false/u)
})

test('methods other than HEAD and GET return 405 with the exact Allow header', async () => {
  const fixture = queryFixture()
  const { res } = await request(
    handlerFor(fixture.query),
    'POST',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root`,
  )

  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'HEAD, GET')
  assert.deepEqual(fixture.calls, [])
})

test('a missing root target maps to stable 404 JSON without leaking the query error', async () => {
  const fixture = queryFixture()
  const errors = []
  const { res } = await request(
    handlerFor(fixture.query, errors),
    'GET',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=absent`,
  )

  assert.equal(res.statusCode, 404)
  assert.deepEqual(JSON.parse(res.body()), {
    error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' },
  })
  assert.equal(res.body().includes('absent'), false)
  assert.equal(errors.length, 1)
})

test('a source compatibility race maps to stable 409 JSON', async () => {
  const fixture = queryFixture({
    hooks: {
      surface({ sessionId, count }) {
        if (sessionId === 'root' && count === 1) fixture.root.createdAt = 2_000
      },
    },
  })
  // Replace the stored surface header after the raw log observation.
  fixture.query.readSurface = async (sessionId) => ({
    session: { ...fixture.root, createdAt: 2_000 },
    capturedThroughSeq: 0,
    events: [userEvent(0, 'root')],
  })

  const { res } = await request(
    handlerFor(fixture.query),
    'GET',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root`,
  )

  assert.equal(res.statusCode, 409)
  assert.deepEqual(JSON.parse(res.body()), {
    error: { code: 'SESSION_CONFLICT', message: 'Session changed or is incompatible' },
  })
})

test('unexpected pre-stream failures map to sanitized 500 JSON and are logged host-side', async () => {
  const secret = 'private stack detail'
  const fixture = queryFixture({ hooks: { log() { throw new Error(secret) } } })
  const errors = []
  const { res } = await request(
    handlerFor(fixture.query, errors),
    'GET',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root`,
  )

  assert.equal(res.statusCode, 500)
  assert.deepEqual(JSON.parse(res.body()), {
    error: { code: 'EXPORT_FAILED', message: 'Session export failed' },
  })
  assert.equal(res.body().includes(secret), false)
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), new RegExp(secret, 'u'))
})

test('GET waits for drain before continuing after response backpressure', async () => {
  const fixture = queryFixture()
  const response = new FakeResponse([false])
  const pending = request(
    handlerFor(fixture.query),
    'GET',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root`,
    response,
  )

  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(response.chunks.length, 1)
  assert.equal(response.writableEnded, false)
  response.emit('drain')
  await pending
  assert.equal(response.writableEnded, true)
  assert.ok(response.chunks.length > 1)
})

test('request abort stops before further descendant observations and does not append an incomplete marker', async () => {
  const req = new FakeRequest('GET', `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root&includeDescendants=true`)
  const child = header('child', { parentSession: 'root', delegationDepth: 1 })
  const fixture = queryFixture({
    children: [child],
    hooks: {
      log({ sessionId, count }) {
        if (sessionId === 'child' && count === 2) req.abort()
      },
    },
  })
  const res = new FakeResponse()

  await handlerFor(fixture.query)(req, res)

  assert.equal(fixture.counts.get('log:child'), 2)
  assert.equal(fixture.counts.get('surface:child'), 1)
  assert.equal(res.body().includes('EXPORT INCOMPLETE'), false)
  assert.equal(res.writableEnded, true)
})

test('a close event for a normally completed incoming request does not abort the export', async () => {
  const req = new FakeRequest('GET', `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root`)
  req.complete = true
  const fixture = queryFixture({
    hooks: {
      log({ sessionId, count }) {
        if (sessionId === 'root' && count === 1) req.emit('close')
      },
    },
  })
  const res = new FakeResponse()

  await handlerFor(fixture.query)(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.writableEnded, true)
  assert.match(res.body(), /dsh_continuation_export: 1/u)
})

test('a descendant failure after streaming starts appends only the explicit incomplete marker', async () => {
  const secret = 'descendant raw failure and stack'
  const child = header('child', { parentSession: 'root', delegationDepth: 1 })
  const fixture = queryFixture({
    children: [child],
    hooks: {
      log({ sessionId, count }) {
        if (sessionId === 'child' && count === 2) throw new Error(secret)
      },
    },
  })
  const errors = []
  const { res } = await request(
    handlerFor(fixture.query, errors),
    'GET',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root&includeDescendants=true`,
  )

  assert.equal(res.statusCode, 200)
  assert.match(res.body(), /^---\ndsh_continuation_export: 1/mu)
  assert.match(res.body(), /## EXPORT INCOMPLETE\n\nThe export stopped before every validated section was written\./u)
  assert.equal(res.body().includes(secret), false)
  assert.equal(errors.length, 1)
})

test('GET reloads descendants sequentially after the first renderer chunk', async () => {
  const children = [
    header('child-a', { parentSession: 'root', delegationDepth: 1 }),
    header('child-b', { parentSession: 'root', delegationDepth: 1 }),
  ]
  let activeReloads = 0
  let maximumActiveReloads = 0
  const fixture = queryFixture({
    children,
    hooks: {
      async log({ sessionId, count }) {
        if (sessionId === 'root' || count !== 2) return
        activeReloads += 1
        maximumActiveReloads = Math.max(maximumActiveReloads, activeReloads)
        await new Promise((resolve) => setImmediate(resolve))
        activeReloads -= 1
      },
    },
  })

  const { res } = await request(
    handlerFor(fixture.query),
    'GET',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root&includeDescendants=true`,
  )

  assert.equal(maximumActiveReloads, 1)
  assert.ok(fixture.calls.indexOf('log:child-a') < fixture.calls.lastIndexOf('log:child-b'))
  assert.match(res.body(), /### Delegated session · `Child 1`[\s\S]*### Delegated session · `Child 2`/u)
})

test('HEAD descendant failure remains a pre-body stable error status without an entity body', async () => {
  const child = header('child', { parentSession: 'root', delegationDepth: 1 })
  const fixture = queryFixture({
    children: [child],
    hooks: {
      log({ sessionId, count }) {
        if (sessionId === 'child' && count === 2) throw new Error('head child failed')
      },
    },
  })
  const { res } = await request(
    handlerFor(fixture.query),
    'HEAD',
    `${SESSION_MARKDOWN_EXPORT_PATH}?sessionId=root&includeDescendants=true`,
  )

  assert.equal(res.statusCode, 500)
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8')
  assert.equal(res.body(), '')
})

test('plugin registers only the exact markdown route after a compatible web service binds', () => {
  const fixture = queryFixture()
  const listeners = new Map()
  const services = new Map()
  const routes = []
  const webServer = {
    register(route) {
      routes.push(route)
      return () => {}
    },
  }
  const ctx = {
    sessionQuery: fixture.query,
    logger: { warn() {} },
    get(key) { return services.get(key) },
    effect(activate) { return activate() },
    on(event, listener) { listeners.set(event, listener) },
  }

  apply(ctx)
  assert.deepEqual(routes, [])
  services.set('httpServer', webServer)
  listeners.get('internal/service')('httpServer')

  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'exact')
  assert.equal(routes[0].path, '/api/session.export-markdown')
})
