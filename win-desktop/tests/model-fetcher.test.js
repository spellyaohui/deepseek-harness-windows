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
  reconcileOpencodeCatalog,
  validateOpencodeCatalog,
} from '../src/model-fetcher.js'

function minimalOpencodeModel(id, api = 'openai-completions') {
  return {
    id,
    name: id,
    api,
    provider: 'opencode-go',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    reasoning: true,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 262144,
    maxTokens: 32768,
  }
}

function countCatalogId(catalog, id) {
  return Object.values(catalog)
    .filter(models => typeof models === 'object' && models !== null)
    .filter(models => Object.hasOwn(models, id))
    .length
}

test('reconciles every documented OpenCode transport mismatch exactly once', () => {
  const futureModel = minimalOpencodeModel('future-model')
  const catalog = {
    'openai-completions': {
      'muse-spark-1.2-contributor': minimalOpencodeModel('muse-spark-1.2-contributor'),
      'gpt-5.6-luna': minimalOpencodeModel('gpt-5.6-luna'),
      'future-model': futureModel,
    },
    'anthropic-messages': {
      'qwen3.7-max': minimalOpencodeModel('qwen3.7-max', 'anthropic-messages'),
      'qwen3.7-plus': minimalOpencodeModel('qwen3.7-plus', 'anthropic-messages'),
    },
  }

  const repaired = reconcileOpencodeCatalog(catalog)

  assert.equal(repaired['openai-responses']['muse-spark-1.2-contributor'].api, 'openai-responses')
  assert.equal(repaired['openai-responses']['gpt-5.6-luna'].api, 'openai-responses')
  assert.equal(repaired['openai-completions']['qwen3.7-max'].api, 'openai-completions')
  assert.equal(repaired['openai-completions']['qwen3.7-plus'].api, 'openai-completions')
  assert.equal(countCatalogId(repaired, 'muse-spark-1.2-contributor'), 1)
  assert.equal(countCatalogId(repaired, 'gpt-5.6-luna'), 1)
  assert.equal(countCatalogId(repaired, 'qwen3.7-max'), 1)
  assert.equal(countCatalogId(repaired, 'qwen3.7-plus'), 1)
  assert.deepEqual(repaired['openai-completions']['future-model'], futureModel)
})

test('applies verified OpenCode Muse capabilities without mutating the source catalog', () => {
  const catalog = {
    'openai-completions': {
      'muse-spark-1.2-contributor': minimalOpencodeModel('muse-spark-1.2-contributor'),
    },
  }

  const repaired = reconcileOpencodeCatalog(catalog)
  const muse = repaired['openai-responses']['muse-spark-1.2-contributor']

  assert.deepEqual(muse.input, ['text', 'image'])
  assert.equal(muse.contextWindow, 1048576)
  assert.equal(muse.maxTokens, 131072)
  assert.equal(catalog['openai-completions']['muse-spark-1.2-contributor'].api, 'openai-completions')
})

test('repairs Kimi K3 tool compatibility before the first OpenCode Go request', () => {
  const catalog = {
    'openai-completions': {
      'kimi-k3': minimalOpencodeModel('kimi-k3'),
    },
  }

  const repaired = reconcileOpencodeCatalog(catalog)
  const k3 = repaired['openai-completions']['kimi-k3']

  assert.equal(k3.api, 'openai-completions')
  assert.equal(k3.compat.supportsStrictMode, false)
  assert.equal(k3.compat.requiresReasoningContentOnAssistantMessages, true)
  assert.equal(k3.compat.deferredToolsMode, 'kimi')
  assert.equal(k3.thinkingLevelMap.max, 'max')
  assert.equal(k3.thinkingLevelMap.low, null)
  assert.equal(k3.contextWindow, 1048576)
  assert.equal(k3.maxTokens, 131072)
})

test('repairs the complete verified OpenCode image capability coverage without guessing unknown models', () => {
  const catalog = {
    'openai-completions': Object.fromEntries([
      'ox-alpha-free',
      'deepseek-v4-flash-vision-exp',
      'qwen3.8-max',
      'kimi-k2.5',
      'qwen3.5-plus',
      'mimo-v2-omni',
      'muse-spark-1.2-contributor',
      'gpt-5.6-luna',
      'mimo-v2.5-pro',
      'future-model',
    ].map(id => [id, minimalOpencodeModel(id)])),
  }

  const repaired = reconcileOpencodeCatalog(catalog)
  const find = (id) => Object.values(repaired)
    .find(models => typeof models === 'object' && models !== null && Object.hasOwn(models, id))[id]

  for (const id of [
    'ox-alpha-free',
    'deepseek-v4-flash-vision-exp',
    'qwen3.8-max',
    'kimi-k2.5',
    'qwen3.5-plus',
    'mimo-v2-omni',
    'muse-spark-1.2-contributor',
    'gpt-5.6-luna',
  ]) {
    assert.deepEqual(find(id).input, ['text', 'image'], id)
  }
  assert.equal(find('ox-alpha-free').api, 'openai-completions')
  assert.equal(find('ox-alpha-free').contextWindow, 1000000)
  assert.equal(find('ox-alpha-free').maxTokens, 131072)
  assert.deepEqual(find('mimo-v2.5-pro').input, ['text'])
  assert.deepEqual(find('future-model').input, ['text'])
})

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

test('OpenCode hydration preserves manual image overrides only in provider settings', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-opencode-image-override-'))
  const catalogPath = join(root, 'opencode-go.json')
  const settingsPath = join(root, 'settings.yaml')
  const settings = `llm-pi-ai:
  providers:
    opencode-go:
      models:
        - id: muse-spark-1.2-contributor
          input:
            - text
        - id: future-image-model
          input:
            - text
            - image
`
  writeFileSync(catalogPath, JSON.stringify({
    'openai-completions': {
      'muse-spark-1.2-contributor': minimalOpencodeModel('muse-spark-1.2-contributor'),
    },
  }))
  writeFileSync(settingsPath, settings)

  try {
    const result = hydrateOpencodeCatalogFromSettings({ catalogPath, settingsPath })
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))

    assert.equal(result.added, 1)
    assert.equal(readFileSync(settingsPath, 'utf8'), settings)
    assert.deepEqual(catalog['openai-responses']['muse-spark-1.2-contributor'].input, ['text', 'image'])
    assert.deepEqual(catalog['openai-completions']['future-image-model'].input, ['text'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('static OpenCode protocol mismatches are repaired even without a settings file', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-opencode-static-repair-'))
  const catalogPath = join(root, 'opencode-go.json')
  const settingsPath = join(root, 'missing-settings.yaml')
  writeFileSync(catalogPath, JSON.stringify({
    'openai-completions': {
      'muse-spark-1.2-contributor': minimalOpencodeModel('muse-spark-1.2-contributor'),
      'gpt-5.6-luna': minimalOpencodeModel('gpt-5.6-luna'),
    },
    'anthropic-messages': {
      'qwen3.7-max': minimalOpencodeModel('qwen3.7-max', 'anthropic-messages'),
      'qwen3.7-plus': minimalOpencodeModel('qwen3.7-plus', 'anthropic-messages'),
    },
  }))

  try {
    const result = hydrateOpencodeCatalogFromSettings({ catalogPath, settingsPath })
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
    assert.equal(result.added, 0)
    assert.equal(catalog['openai-responses']['muse-spark-1.2-contributor'].api, 'openai-responses')
    assert.equal(catalog['openai-responses']['gpt-5.6-luna'].api, 'openai-responses')
    assert.equal(catalog['openai-completions']['qwen3.7-max'].api, 'openai-completions')
    assert.equal(catalog['openai-completions']['qwen3.7-plus'].api, 'openai-completions')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('manual OpenCode validation reports the repaired model count and is idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-opencode-manual-validation-'))
  const catalogPath = join(root, 'opencode-go.json')
  writeFileSync(catalogPath, JSON.stringify({
    'openai-completions': {
      'ox-alpha-free': minimalOpencodeModel('ox-alpha-free'),
    },
  }))

  try {
    const first = validateOpencodeCatalog({ catalogPath })
    const second = validateOpencodeCatalog({ catalogPath })
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
    assert.equal(first.repaired, 1)
    assert.equal(second.repaired, 0)
    assert.equal(first.error, undefined)
    assert.deepEqual(catalog['openai-completions']['ox-alpha-free'].input, ['text', 'image'])
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

test('live discovery gives a documented OpenCode profile its verified transport', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-opencode-live-profile-'))
  const catalogPath = join(root, 'opencode-go.json')
  const settingsPath = join(root, 'settings.yaml')
  writeFileSync(catalogPath, JSON.stringify({ 'openai-completions': {} }))
  writeFileSync(settingsPath, '{}\n')
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: [{ id: 'muse-spark-1.2-contributor' }, { id: 'future-model' }] }),
  })

  try {
    const result = await prepareOpencodeCatalog({ catalogPath, settingsPath })
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
    assert.equal(result.added, 2)
    assert.equal(catalog['openai-responses']['muse-spark-1.2-contributor'].api, 'openai-responses')
    assert.equal(catalog['openai-completions']['future-model'].api, 'openai-completions')
  } finally {
    globalThis.fetch = previousFetch
    rmSync(root, { recursive: true, force: true })
  }
})

test('desktop waits for OpenCode catalog preparation before starting Harness', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  const prepareAt = source.indexOf('await prepareOpencodeCatalog()')
  const startAt = source.indexOf('service = await startDshService(')
  assert.ok(prepareAt >= 0)
  assert.ok(startAt > prepareAt)
})
