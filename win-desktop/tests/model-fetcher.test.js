import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  fetchOpencodeModelIds,
  getOpencodeModelList,
  hydrateOpencodeCatalogFromSettings,
  prepareOpencodeCatalog,
} from '../src/model-fetcher.js'

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

test('persisted OpenCode models hydrate the runtime catalog before startup', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-opencode-hydrate-'))
  const catalogPath = join(root, 'opencode-go.json')
  const settingsPath = join(root, 'settings.yaml')
  const existing = {
    id: 'known-model',
    name: 'Known Model',
    api: 'openai-completions',
    provider: 'opencode-go',
    baseUrl: 'https://example.invalid/v1',
    reasoning: true,
    input: ['text'],
    cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
  }
  writeFileSync(catalogPath, JSON.stringify({ 'openai-completions': { 'known-model': existing } }))
  writeFileSync(settingsPath, `llm-pi-ai:\n  providers:\n    opencode-go:\n      models:\n        - id: known-model\n          name: Must Not Replace Existing\n        - id: future-model\n          name: Future Model\n          contextWindow: 1000000\n          maxTokens: 131072\n`)

  try {
    const result = hydrateOpencodeCatalogFromSettings({ catalogPath, settingsPath })
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
    assert.equal(result.added, 1)
    assert.deepEqual(catalog['openai-completions']['known-model'], existing)
    assert.deepEqual(catalog['openai-completions']['future-model'], {
      id: 'future-model',
      name: 'Future Model',
      api: 'openai-completions',
      provider: 'opencode-go',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      reasoning: true,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: {
        supportsStore: false,
        supportsDeveloperRole: false,
        maxTokensField: 'max_tokens',
      },
      contextWindow: 1000000,
      maxTokens: 131072,
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('catalog preparation waits for live OpenCode models before resolving', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-opencode-prepare-'))
  const catalogPath = join(root, 'opencode-go.json')
  const settingsPath = join(root, 'settings.yaml')
  writeFileSync(catalogPath, JSON.stringify({ 'openai-completions': {} }))
  writeFileSync(settingsPath, '{}\n')
  const previousFetch = globalThis.fetch
  let release
  globalThis.fetch = () => new Promise((resolve) => {
    release = () => resolve({
      ok: true,
      json: async () => ({ data: [{ id: 'live-model' }] }),
    })
  })

  try {
    let settled = false
    const preparing = prepareOpencodeCatalog({ catalogPath, settingsPath })
      .then((result) => {
        settled = true
        return result
      })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(settled, false)
    release()
    const result = await preparing
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
    assert.equal(result.added, 1)
    assert.equal(catalog['openai-completions']['live-model'].api, 'openai-completions')
  } finally {
    globalThis.fetch = previousFetch
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop waits for OpenCode catalog preparation before starting Harness', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const prepareAt = source.indexOf('await prepareOpencodeCatalog()')
  const startAt = source.indexOf('service = startDshService(')
  assert.ok(prepareAt >= 0)
  assert.ok(startAt > prepareAt)
})
