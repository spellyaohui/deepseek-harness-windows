import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import test from 'node:test'
import { buildDshArgs } from '../src/dsh-service.js'

test('desktop forwards its selected browser-safe port to the Harness CLI', () => {
  const args = buildDshArgs('fixture.js', { platform: 'linux', port: 12345 })
  assert.equal(args[args.indexOf('--port') + 1], '12345')
  assert.equal(args[args.indexOf('--host') + 1], '127.0.0.1')
})

test('rejects Chromium restricted ports including the reported 6697', async () => {
  const { isBrowserSafePort } = await import('../src/loopback-port.js')
  for (const port of [0, 1, 22, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697, 10080, -1, 65536, 1234.5, '1234']) {
    assert.equal(isBrowserSafePort(port), false, String(port))
  }
  for (const port of [1234, 6698, 8080, 49152, 65535]) assert.equal(isBrowserSafePort(port), true)
})

function servers(ports, bindings) {
  return () => Object.assign(new EventEmitter(), {
    listen(options, callback) { bindings.push({ ...options, closed: false }); queueMicrotask(callback) },
    address() { return { port: ports.shift() } },
    close(callback) { bindings.at(-1).closed = true; queueMicrotask(() => callback()) },
  })
}

test('releases rejected allocations and selects a safe loopback port', async () => {
  const { selectBrowserLoopbackPort } = await import('../src/loopback-port.js')
  const bindings = []
  const port = await selectBrowserLoopbackPort({ createServer: servers([6697, 6000, 10080, 12345], bindings) })
  assert.equal(port, 12345)
  assert.equal(bindings.length, 4)
  for (const binding of bindings) assert.deepEqual(binding, { host: '127.0.0.1', port: 0, exclusive: true, closed: true })
})

test('restricted-port allocation is bounded and closes every probe', async () => {
  const { selectBrowserLoopbackPort } = await import('../src/loopback-port.js')
  const bindings = []
  await assert.rejects(selectBrowserLoopbackPort({ createServer: servers([6697, 6697, 6697], bindings), maxAttempts: 3 }), /安全.*端口/)
  assert.equal(bindings.length, 3)
  assert.ok(bindings.every(binding => binding.closed))
})

test('loopback port selection preserves native bind failures', async () => {
  const { selectBrowserLoopbackPort } = await import('../src/loopback-port.js')
  const failure = Object.assign(new Error('fixture bind failed'), { code: 'EACCES' })
  await assert.rejects(selectBrowserLoopbackPort({ createServer: () => Object.assign(new EventEmitter(), {
    listen() { queueMicrotask(() => this.emit('error', failure)) },
  }) }), error => error === failure)
})

test('real loopback allocation is released before Harness binds', async () => {
  const { isBrowserSafePort, selectBrowserLoopbackPort } = await import('../src/loopback-port.js')
  const port = await selectBrowserLoopbackPort()
  assert.equal(isBrowserSafePort(port), true)
  const server = net.createServer()
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
    assert.equal(server.address().port, port)
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve))
  }
})

test('startup diagnostics redact process tokens while readiness retains them', async () => {
  const { redactDshDiagnostic, extractReadyUrl } = await import('../src/dsh-service.js')
  const url = 'http://127.0.0.1:6697/?token=fixture-secret'
  const diagnostic = redactDshDiagnostic(`ERR_UNSAFE_PORT (-312) loading '${url}' and http://127.0.0.1:1234/?x=1&token=other-secret&y=2`)
  assert.ok(!diagnostic.includes('fixture-secret'))
  assert.ok(!diagnostic.includes('other-secret'))
  assert.match(diagnostic, /ERR_UNSAFE_PORT/)
  assert.match(diagnostic, /&y=2/)
  assert.equal(extractReadyUrl(`dsh web: ${url}`), url)
})
