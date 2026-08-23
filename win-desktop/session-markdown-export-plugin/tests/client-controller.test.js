import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

const runtimeClientStub = `data:text/javascript,${encodeURIComponent(`
  export function createSnapshotStore(init) {
    let state = init
    const listeners = new Set()
    return {
      getSnapshot: () => state,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
      update(mutator) {
        const next = { ...state, bySession: { ...state.bySession } }
        mutator(next)
        state = next
        for (const listener of listeners) listener()
      },
      set(next) { state = next; for (const listener of listeners) listener() },
    }
  }
`)}`

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/dsh-client-runtime/client') {
      return { url: runtimeClientStub, shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})

const { SessionMarkdownExportController } = await import('../lib/client/controller.js')

function deferred() {
  let resolve
  let reject
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

function okResponse() {
  return { ok: true, status: 200, text: async () => '' }
}

test('concurrent requests for one session share one HEAD preflight and one browser save', async () => {
  const head = deferred()
  const calls = []
  const saves = []
  const controller = new SessionMarkdownExportController(
    (url, init) => {
      calls.push({ url: String(url), init })
      return head.promise
    },
    (url) => saves.push(url),
  )

  const first = controller.download('session-a')
  const second = controller.download('session-a')

  assert.strictEqual(first, second)
  assert.equal(calls.length, 1)
  assert.equal(new URL(calls[0].url).pathname, '/api/session.export-markdown')
  assert.equal(new URL(calls[0].url).searchParams.get('sessionId'), 'session-a')
  assert.equal(new URL(calls[0].url).searchParams.get('includeDescendants'), 'true')
  assert.equal(calls[0].init.method, 'HEAD')
  assert.equal(controller.store.getSnapshot().bySession['session-a']?.status, 'preparing')

  head.resolve(okResponse())
  await first

  assert.equal(saves.length, 1)
  assert.equal(controller.store.getSnapshot().bySession['session-a']?.status, 'success')
})

test('different sessions keep independent preflights', async () => {
  const calls = []
  const controller = new SessionMarkdownExportController(
    async (url) => {
      calls.push(String(url))
      return okResponse()
    },
    () => {},
  )

  await Promise.all([controller.download('session-a'), controller.download('session-b')])

  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map((url) => new URL(url).searchParams.get('sessionId')).sort(), ['session-a', 'session-b'])
})

test('a failed HEAD publishes an error that can be retried', async () => {
  let attempts = 0
  const controller = new SessionMarkdownExportController(
    async () => {
      attempts += 1
      return attempts === 1
        ? { ok: false, status: 409, text: async () => 'Session changed or is incompatible' }
        : okResponse()
    },
    () => {},
  )

  await controller.download('session-a')
  const failed = controller.store.getSnapshot().bySession['session-a']
  assert.equal(failed?.open, true)
  assert.equal(failed?.status, 'error')
  assert.match(failed?.error ?? '', /409/u)

  await controller.download('session-a')
  assert.equal(attempts, 2)
  assert.equal(controller.store.getSnapshot().bySession['session-a']?.status, 'success')
})

test('dismissing closes the dialog without aborting its active preflight', async () => {
  const head = deferred()
  let signal
  const controller = new SessionMarkdownExportController(
    (_url, init) => {
      signal = init.signal
      return head.promise
    },
    () => {},
  )

  const pending = controller.download('session-a')
  controller.dismiss('session-a')

  assert.equal(signal.aborted, false)
  assert.equal(controller.store.getSnapshot().bySession['session-a']?.open, false)
  head.resolve(okResponse())
  await pending
  assert.equal(controller.store.getSnapshot().bySession['session-a']?.open, false)
})

test('dispose aborts and drains every active preflight', async () => {
  const signals = []
  const pending = []
  const controller = new SessionMarkdownExportController(
    (_url, init) => {
      const head = deferred()
      signals.push(init.signal)
      pending.push(head)
      init.signal.addEventListener('abort', () => head.reject(new Error('aborted')), { once: true })
      return head.promise
    },
    () => {},
  )

  const first = controller.download('session-a')
  const second = controller.download('session-b')
  await controller.dispose()
  await Promise.all([first, second])

  assert.equal(signals.length, 2)
  assert.equal(signals.every((signal) => signal.aborted), true)
  assert.equal(controller.store.getSnapshot().bySession['session-a']?.status, 'preparing')
  assert.equal(controller.store.getSnapshot().bySession['session-b']?.status, 'preparing')
})
