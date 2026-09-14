import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createLoopbackAuthCookieRecovery,
  installLoopbackAuthCookieRecovery,
  isLoopbackPluginsResponse431,
} from '../src/loopback-auth-cookies.js'

function createCookies(entries) {
  const removed = []
  return {
    removed,
    async get() { return entries },
    async remove(url, name) { removed.push({ url, name }) },
  }
}

test('clears only stale loopback dsh auth cookies before loading the service URL', async () => {
  const cookies = createCookies([
    { domain: '127.0.0.1', path: '/', name: 'dsh-auth-old' },
    { domain: '127.0.0.1', path: '/', name: 'session' },
    { domain: 'localhost', path: '/', name: 'dsh-auth-localhost' },
    { domain: 'example.test', path: '/', name: 'dsh-auth-remote' },
  ])
  const events = []
  const recovery = createLoopbackAuthCookieRecovery({
    cookies: {
      ...cookies,
      async remove(url, name) {
        events.push(`remove:${name}`)
        await cookies.remove(url, name)
      },
    },
    getServiceUrl: () => 'http://127.0.0.1:4567/?token=current-token',
    loadServiceUrl: async (url) => events.push(`load:${url}`),
  })

  await recovery.loadFreshServiceUrl()

  assert.deepEqual(cookies.removed, [{
    url: 'http://127.0.0.1/',
    name: 'dsh-auth-old',
  }])
  assert.deepEqual(events, [
    'remove:dsh-auth-old',
    'load:http://127.0.0.1:4567/?token=current-token',
  ])
})

test('recognizes only an HTTP 431 for the current loopback plugins route', () => {
  const serviceUrl = 'http://127.0.0.1:4567/?token=current-token'
  assert.equal(isLoopbackPluginsResponse431({
    statusCode: 431,
    url: 'http://127.0.0.1:4567/plugins/??module-a',
  }, serviceUrl), true)

  for (const details of [
    { statusCode: 200, url: 'http://127.0.0.1:4567/plugins/??module-a' },
    { statusCode: 431, url: 'http://127.0.0.1:4567/api/status' },
    { statusCode: 431, url: 'http://127.0.0.1:4568/plugins/??module-a' },
    { statusCode: 431, url: 'http://localhost:4567/plugins/??module-a' },
    { statusCode: 431, url: 'https://127.0.0.1:4567/plugins/??module-a' },
  ]) {
    assert.equal(isLoopbackPluginsResponse431(details, serviceUrl), false)
  }
})

test('recovery reloads once after a qualifying 431 and never loops', async () => {
  const cookies = createCookies([{ domain: '127.0.0.1', path: '/', name: 'dsh-auth-old' }])
  const loads = []
  const recovery = createLoopbackAuthCookieRecovery({
    cookies,
    getServiceUrl: () => 'http://127.0.0.1:4567/?token=current-token',
    loadServiceUrl: async (url) => loads.push(url),
  })
  const qualifying = { statusCode: 431, url: 'http://127.0.0.1:4567/plugins/??module-a' }

  assert.equal(await recovery.recoverFromResponse({
    statusCode: 431,
    url: 'http://127.0.0.1:4567/api/status',
  }), false)
  assert.deepEqual(loads, [])
  assert.equal(await recovery.recoverFromResponse(qualifying), true)
  assert.equal(await recovery.recoverFromResponse(qualifying), false)
  assert.deepEqual(loads, ['http://127.0.0.1:4567/?token=current-token'])
  assert.equal(cookies.removed.length, 1)
})

test('installs the bounded recovery hook on the current window session', async () => {
  const cookies = createCookies([{ domain: '127.0.0.1', path: '/', name: 'dsh-auth-old' }])
  let completed
  const loads = []
  installLoopbackAuthCookieRecovery({
    webContents: {
      session: {
        cookies,
        webRequest: { onCompleted(listener) { completed = listener } },
      },
    },
    getServiceUrl: () => 'http://127.0.0.1:4567/?token=current-token',
    loadServiceUrl: async (url) => loads.push(url),
    onError: assert.fail,
  })

  completed({ statusCode: 431, url: 'http://127.0.0.1:4567/plugins/??module-a' })
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(loads, ['http://127.0.0.1:4567/?token=current-token'])
})
