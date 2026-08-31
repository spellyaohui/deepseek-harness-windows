import assert from 'node:assert/strict'
import test from 'node:test'

import { extractReadyUrl } from '../src/dsh-service.js'

test('preserves the Alpha.2 process token from the canonical dsh web URL', () => {
  const output = [
    'booting DeepSeek Harness',
    'dsh web: http://127.0.0.1:4567/?token=test-token (LAN: http://192.168.1.5:4567/?token=test-token)',
    'ready',
  ].join('\n')

  assert.equal(
    extractReadyUrl(output),
    'http://127.0.0.1:4567/?token=test-token',
  )
})

test('does not treat the browser-opening notice as a ready URL', () => {
  assert.equal(
    extractReadyUrl('dsh web: opening the default browser; pass --no-open to disable'),
    undefined,
  )
})

test('rejects an unauthenticated loopback URL as an Alpha.2 readiness signal', () => {
  assert.equal(
    extractReadyUrl('dsh web: http://127.0.0.1:4567'),
    undefined,
  )
})
