import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchOpencodeModelIds, getOpencodeModelList } from '../src/model-fetcher.js'

test('model fetch aborts a stalled API request', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  })
  try {
    await assert.rejects(
      fetchOpencodeModelIds('https://example.invalid', undefined, { timeoutMs: 5 }),
      /aborted/i,
    )
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('model list falls back to the local catalog when the API is unavailable', async () => {
  const result = await getOpencodeModelList('http://127.0.0.1:1')
  assert.equal(result.source, 'catalog')
  assert.ok(result.models.length > 0)
})
