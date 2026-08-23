import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeCpaBaseURL } from '../lib/address.js'

test('normalizes CPA roots and existing v1 paths', () => {
  assert.equal(normalizeCpaBaseURL(' http://127.0.0.1:8317 '), 'http://127.0.0.1:8317/v1')
  assert.equal(
    normalizeCpaBaseURL('https://proxy.example.invalid/cpa/v1/'),
    'https://proxy.example.invalid/cpa/v1',
  )
  assert.equal(
    normalizeCpaBaseURL('https://proxy.example.invalid/reverse-prefix'),
    'https://proxy.example.invalid/reverse-prefix/v1',
  )
})

test('rejects unsafe or ambiguous CPA addresses', () => {
  assert.throws(() => normalizeCpaBaseURL('ftp://proxy.example.invalid'), /http/i)
  assert.throws(() => normalizeCpaBaseURL('https://user:pass@proxy.example.invalid'), /credential/i)
  assert.throws(() => normalizeCpaBaseURL('https://proxy.example.invalid?route=cpa'), /query/i)
  assert.throws(() => normalizeCpaBaseURL('https://proxy.example.invalid/#fragment'), /fragment/i)
})
