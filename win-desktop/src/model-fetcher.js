/**
 * Model fetcher: dynamically query the OpenCode API for available models and
 * merge them into the pi-ai static catalog.
 *
 * The pi-ai library ships a hardcoded JSON catalog per provider
 * (opencode-go.json). OpenCode updates its model list frequently, so this
 * module fetches the live list from the API at startup and adds any new
 * model IDs into the catalog file — keeping existing entries' metadata
 * intact while giving new entries sensible defaults.
 *
 * The settings window also calls {@link getOpencodeModelList} to populate
 * its model dropdown without hardcoding any IDs.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { parse } from 'yaml'

/** Default OpenCode Go API base URL (matches the pi-ai catalog entry). */
export const DEFAULT_OPENCODE_BASE_URL = 'https://opencode.ai/zen/go/v1'

/** Bound live API wait so a settings page can always settle into a usable state. */
export const DEFAULT_OPENCODE_TIMEOUT_MS = 8_000

/** Cost placeholder for models the catalog does not describe. */
const NO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

/**
 * Verified per-model OpenCode Go catalog profiles.
 *
 * OpenCode's `/models` response exposes IDs only, so its live catalog cannot
 * describe a model's transport. Keep only profiles verified by Pi's model
 * registry here; unknown IDs deliberately retain the generic Completions
 * fallback rather than being retried on another endpoint after a server error.
 */
export const OPENCODE_GO_PROTOCOL_PROFILES = Object.freeze({
  'muse-spark-1.2-contributor': Object.freeze({
    api: 'openai-responses',
    name: 'Muse Spark 1.2 Contributor',
    reasoning: true,
    input: ['text', 'image'],
    thinkingLevelMap: { off: null, minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: null },
    contextWindow: 1048576,
    maxTokens: 131072,
    cost: { input: 0.1, output: 0.2, cacheRead: 0.002, cacheWrite: 0 },
    compat: { sessionAffinityFormat: 'openai-nosession' },
  }),
  'gpt-5.6-luna': Object.freeze({
    api: 'openai-responses',
    name: 'GPT-5.6 Luna',
    reasoning: true,
    input: ['text', 'image'],
    thinkingLevelMap: { off: null, minimal: null, low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max' },
    contextWindow: 1050000,
    maxTokens: 128000,
    cost: { input: 0.2, output: 1.2, cacheRead: 0.02, cacheWrite: 0.25 },
    compat: { sessionAffinityFormat: 'openai-nosession' },
  }),
  'qwen3.7-max': Object.freeze({
    api: 'openai-completions',
    name: 'Qwen3.7 Max',
    reasoning: true,
    input: ['text'],
    contextWindow: 1000000,
    maxTokens: 65536,
    cost: { input: 2.5, output: 7.5, cacheRead: 0.5, cacheWrite: 3.125 },
    compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
  }),
  'qwen3.7-plus': Object.freeze({
    api: 'openai-completions',
    name: 'Qwen3.7 Plus',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1000000,
    maxTokens: 65536,
    cost: { input: 0.4, output: 1.6, cacheRead: 0.04, cacheWrite: 0.5 },
    compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
  }),
  'ox-alpha-free': Object.freeze({
    api: 'openai-completions',
    name: 'Ox Alpha Free (Unlimited)',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1000000,
    maxTokens: 131072,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
  }),
  'deepseek-v4-flash-vision-exp': Object.freeze({
    api: 'openai-completions',
    name: 'DeepSeek V4 Flash Vision Exp',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1000000,
    maxTokens: 384000,
    cost: { input: 0.22, output: 0.66, cacheRead: 0.007, cacheWrite: 0 },
    compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
  }),
  'qwen3.8-max': Object.freeze({
    api: 'openai-completions',
    name: 'Qwen3.8 Max',
    reasoning: true,
    input: ['text', 'image'],
    contextWindow: 1000000,
    maxTokens: 131072,
    cost: { input: 2, output: 6, cacheRead: 0.25, cacheWrite: 2.5 },
    compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: 'max_tokens' },
  }),
})

/**
 * Image-input compatibility corrections for models retained by OpenCode Go
 * but absent from the current Pi catalog. The source only confirms modality,
 * so unlike {@link OPENCODE_GO_PROTOCOL_PROFILES} these entries never guess
 * a transport, capacity, cost, or reasoning vocabulary.
 */
export const OPENCODE_GO_COMPATIBILITY_INPUTS = Object.freeze({
  'kimi-k2.5': Object.freeze(['text', 'image']),
  'qwen3.5-plus': Object.freeze(['text', 'image']),
  'mimo-v2-omni': Object.freeze(['text', 'image']),
  'mimo-v2.5-pro': Object.freeze(['text']),
})

/**
 * Resolve the pi-ai catalog JSON file path for one provider.
 *
 * In dev the file sits at `../node_modules/...` relative to `src/`; in the
 * packaged app (asar:false) it sits at the same relative path inside
 * `resources/app/`. Both resolve identically from this module's location.
 * @param providerName - provider route key (`opencode-go`, `opencode`, …).
 * @returns the absolute path, or `undefined` when no catalog file is found.
 */
function resolveCatalogPath(providerName) {
  const candidates = [
    fileURLToPath(new URL(`../node_modules/@earendil-works/pi-ai/dist/providers/data/${providerName}.json`, import.meta.url)),
  ]
  return candidates.find((p) => existsSync(p))
}

/** Resolve the Harness settings document without importing the service runtime. */
function resolveSettingsPath() {
  return join(resolveDshHome(), 'settings.yaml')
}

/**
 * Fetch the live model ID list from the OpenCode API.
 *
 * The endpoint is OpenAI-compatible `GET /models` and accepts an optional
 * bearer token. Network failures are thrown so callers can fall back to the
 * static catalog.
 * @param baseUrl - the API base URL (default: the OpenCode Go endpoint).
 * @param apiKey - optional bearer token; read from `OPENCODE_GO_API_KEY` env
 *   when not supplied.
 * @returns array of `{ id }` entries in endpoint order.
 */
export async function fetchOpencodeModelIds(
  baseUrl = DEFAULT_OPENCODE_BASE_URL,
  apiKey = process.env.OPENCODE_GO_API_KEY,
  { timeoutMs = DEFAULT_OPENCODE_TIMEOUT_MS } = {},
) {
  const url = `${baseUrl.replace(/\/+$/, '')}/models`
  const headers = { accept: 'application/json' }
  if (apiKey !== undefined && apiKey.length > 0) {
    headers.authorization = `Bearer ${apiKey}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error(`OpenCode API timed out after ${timeoutMs}ms`))
  }, timeoutMs)
  try {
    const response = await fetch(url, { headers, signal: controller.signal })
    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}`)
    }
    const body = await response.json()
    if (!Array.isArray(body.data)) {
      throw new Error('OpenCode API response has no "data" array')
    }
    return body.data
      .filter((entry) => typeof entry?.id === 'string' && entry.id.length > 0)
      .map((entry) => ({ id: entry.id }))
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Build a default catalog entry for a model ID the installed catalog does not
 * describe. Uses `openai-completions` (the protocol most OpenCode models
 * speak) with conservative capacity defaults.
 * @param id - model id from the API.
 * @param providerName - provider route key.
 * @param baseUrl - API base URL for this provider.
 * @returns a minimal catalog model object.
 */
function createDefaultModel(id, providerName, baseUrl) {
  return {
    id,
    name: id,
    api: 'openai-completions',
    provider: providerName,
    baseUrl,
    reasoning: true,
    input: ['text'],
    cost: NO_COST,
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      maxTokensField: 'max_tokens',
    },
    contextWindow: 262_144,
    maxTokens: 32_768,
  }
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function recordOf(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : undefined
}

function profileModel(id, model, profile) {
  const { thinkingLevelMap: _thinkingLevelMap, compat: _compat, cost: _cost, ...base } = recordOf(model) ?? {}
  return {
    ...base,
    id,
    provider: base.provider ?? 'opencode-go',
    baseUrl: base.baseUrl ?? DEFAULT_OPENCODE_BASE_URL,
    api: profile.api,
    name: profile.name,
    reasoning: profile.reasoning,
    input: [...profile.input],
    contextWindow: profile.contextWindow,
    maxTokens: profile.maxTokens,
    cost: { ...profile.cost },
    compat: { ...profile.compat },
    ...(profile.thinkingLevelMap === undefined ? {} : { thinkingLevelMap: { ...profile.thinkingLevelMap } }),
  }
}

/**
 * Return a catalog whose documented OpenCode Go models appear exactly once
 * under their verified API transport. The input remains untouched.
 *
 * @param {Record<string, Record<string, object>>} catalog Pi catalog JSON.
 * @returns {Record<string, Record<string, object>>} repaired catalog JSON.
 */
export function reconcileOpencodeCatalog(catalog) {
  const repaired = {}
  for (const [api, models] of Object.entries(recordOf(catalog) ?? {})) {
    repaired[api] = recordOf(models) === undefined ? models : { ...models }
  }

  for (const [id, profile] of Object.entries(OPENCODE_GO_PROTOCOL_PROFILES)) {
    let source
    for (const models of Object.values(repaired)) {
      if (recordOf(models) === undefined || !Object.hasOwn(models, id)) continue
      source ??= models[id]
      delete models[id]
    }
    if (source === undefined) continue
    if (recordOf(repaired[profile.api]) === undefined) repaired[profile.api] = {}
    repaired[profile.api][id] = profileModel(id, source, profile)
  }

  for (const [id, input] of Object.entries(OPENCODE_GO_COMPATIBILITY_INPUTS)) {
    for (const models of Object.values(repaired)) {
      if (recordOf(models) === undefined || !Object.hasOwn(models, id)) continue
      models[id] = { ...models[id], input: [...input] }
    }
  }

  return repaired
}

function reconcileOpencodeCatalogFile(catalogPath) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  const repaired = reconcileOpencodeCatalog(catalog)
  const repairedCount = countRepairedModels(catalog, repaired)
  if (repairedCount > 0) {
    writeFileSync(catalogPath, JSON.stringify(repaired), 'utf8')
  }
  return { catalog: repaired, repaired: repairedCount }
}

function countRepairedModels(before, after) {
  const models = (catalog) => new Map(Object.entries(recordOf(catalog) ?? {})
    .flatMap(([api, rows]) => Object.entries(recordOf(rows) ?? {})
      .map(([id, model]) => [id, { api, model }])))
  const beforeModels = models(before)
  const afterModels = models(after)
  return [...new Set([...beforeModels.keys(), ...afterModels.keys()])]
    .filter(id => JSON.stringify(beforeModels.get(id)) !== JSON.stringify(afterModels.get(id)))
    .length
}

/**
 * Repair only the installed OpenCode catalog, without reading settings or
 * contacting a remote endpoint. Used by Settings → 模型 when a user wants to
 * validate stale capability declarations before restarting Harness.
 */
export function validateOpencodeCatalog({
  catalogPath = resolveCatalogPath('opencode-go'),
} = {}) {
  if (catalogPath === undefined || !existsSync(catalogPath)) {
    return { models: [], repaired: 0, error: 'catalog file not found' }
  }
  try {
    const result = reconcileOpencodeCatalogFile(catalogPath)
    return { models: readCatalogModels(catalogPath), repaired: result.repaired, error: undefined }
  } catch (error) {
    return { models: [], repaired: 0, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Restore model metadata persisted by the Models page before the LLM runtime
 * imports pi-ai's JSON catalog. Desktop upgrades replace package files while
 * leaving settings.yaml intact, so a dynamically discovered model must be
 * reintroduced locally even when the live endpoint is temporarily offline.
 */
export function hydrateOpencodeCatalogFromSettings({
  catalogPath = resolveCatalogPath('opencode-go'),
  settingsPath = resolveSettingsPath(),
} = {}) {
  if (catalogPath === undefined || !existsSync(catalogPath)) {
    return { models: [], added: 0, error: 'catalog file not found' }
  }
  let catalog
  try {
    catalog = reconcileOpencodeCatalogFile(catalogPath).catalog
  } catch (error) {
    return {
      models: readCatalogModels(catalogPath),
      added: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  if (!existsSync(settingsPath)) {
    return { models: readCatalogModels(catalogPath), added: 0, error: undefined }
  }

  try {
    const document = recordOf(parse(readFileSync(settingsPath, 'utf8')))
    const piAi = recordOf(document?.['llm-pi-ai'])
    const providers = recordOf(piAi?.['providers'])
    const opencode = recordOf(providers?.['opencode-go'])
    const persisted = Array.isArray(opencode?.['models']) ? opencode.models : []
    const existingIds = new Set()
    for (const apiModels of Object.values(catalog)) {
      if (typeof apiModels !== 'object' || apiModels === null) continue
      for (const id of Object.keys(apiModels)) existingIds.add(id)
    }

    let added = 0
    for (const value of persisted) {
      const row = recordOf(value)
      const id = typeof row?.id === 'string' ? row.id.trim() : ''
      if (id === '' || existingIds.has(id)) continue
      const model = createDefaultModel(id, 'opencode-go', DEFAULT_OPENCODE_BASE_URL)
      const name = typeof row.name === 'string' && row.name.trim() !== '' ? row.name.trim() : id
      const contextWindow = positiveInteger(row.contextWindow)
      const maxTokens = positiveInteger(row.maxTokens)
      model.name = name
      if (contextWindow !== undefined) model.contextWindow = contextWindow
      if (maxTokens !== undefined) model.maxTokens = maxTokens
      if (catalog[model.api] === undefined) catalog[model.api] = {}
      catalog[model.api][id] = model
      existingIds.add(id)
      added++
    }

    const repaired = reconcileOpencodeCatalog(catalog)
    if (added > 0 || JSON.stringify(repaired) !== JSON.stringify(catalog)) {
      writeFileSync(catalogPath, JSON.stringify(repaired), 'utf8')
    }
    return { models: readCatalogModels(catalogPath), added, error: undefined }
  } catch (error) {
    return {
      models: readCatalogModels(catalogPath),
      added: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Synchronously read all models from the catalog file (all APIs merged).
 * @param catalogPath - absolute path to the provider JSON.
 * @returns array of `{ id, name }` sorted by id.
 */
function readCatalogModels(catalogPath) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  const models = []
  const seen = new Set()
  for (const apiModels of Object.values(catalog)) {
    if (typeof apiModels !== 'object' || apiModels === null) continue
    for (const [id, model] of Object.entries(apiModels)) {
      if (!seen.has(id)) {
        models.push({ id, name: model.name ?? id })
        seen.add(id)
      }
    }
  }
  models.sort((a, b) => a.id.localeCompare(b.id))
  return models
}

/**
 * Fetch the live model list from the API and merge any new IDs into the pi-ai
 * catalog JSON file. Existing catalog entries are never modified — only new
 * model IDs are added with default metadata.
 *
 * Call this at DSH service startup so the service recognizes every model the
 * API currently offers, not just the ones the catalog shipped with.
 * @param baseUrl - API base URL.
 * @returns `{ models, added, error }` — `models` is the full merged list,
 *   `added` is the count of new entries written, and `error` is a message
 *   when the API call failed (in which case the existing catalog is returned
 *   unchanged).
 */
export async function syncOpencodeCatalog(
  baseUrl = DEFAULT_OPENCODE_BASE_URL,
  options = {},
) {
  const catalogPath = options.catalogPath ?? resolveCatalogPath('opencode-go')
  if (catalogPath === undefined) {
    return { models: [], added: 0, error: 'catalog file not found' }
  }

  let catalog
  try {
    catalog = reconcileOpencodeCatalogFile(catalogPath).catalog
  } catch (error) {
    return {
      models: readCatalogModels(catalogPath),
      added: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  let fetched
  try {
    fetched = await fetchOpencodeModelIds(baseUrl, undefined, options)
  } catch (error) {
    // API unreachable — return the existing catalog so the app still works.
    return {
      models: readCatalogModels(catalogPath),
      added: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const existingIds = new Set()
  for (const apiModels of Object.values(catalog)) {
    if (typeof apiModels !== 'object' || apiModels === null) continue
    for (const id of Object.keys(apiModels)) existingIds.add(id)
  }

  let added = 0
  for (const { id } of fetched) {
    if (existingIds.has(id)) continue
    const model = createDefaultModel(id, 'opencode-go', baseUrl)
    if (catalog[model.api] === undefined) catalog[model.api] = {}
    catalog[model.api][id] = model
    existingIds.add(id)
    added++
  }

  const repaired = reconcileOpencodeCatalog(catalog)
  if (added > 0 || JSON.stringify(repaired) !== JSON.stringify(catalog)) {
    writeFileSync(catalogPath, JSON.stringify(repaired), 'utf8')
  }

  return { models: readCatalogModels(catalogPath), added, error: undefined }
}

/**
 * Complete every on-disk catalog repair before the Harness child imports
 * pi-ai. This ordering is what keeps persisted and newly discovered OpenCode
 * models active in the same launch rather than requiring a second restart.
 */
export async function prepareOpencodeCatalog(options = {}) {
  const hydrated = hydrateOpencodeCatalogFromSettings(options)
  const synced = await syncOpencodeCatalog(
    options.baseUrl ?? DEFAULT_OPENCODE_BASE_URL,
    options,
  )
  return {
    models: synced.models.length > 0 ? synced.models : hydrated.models,
    added: hydrated.added + synced.added,
    error: synced.error,
    hydrationError: hydrated.error,
  }
}

/**
 * Get the model list for the settings dropdown. Tries the live API first;
 * falls back to the static catalog when the API is unreachable.
 * @param baseUrl - API base URL.
 * @returns `{ models, source }` where `source` is `'api'` or `'catalog'`.
 */
export async function getOpencodeModelList(
  baseUrl = DEFAULT_OPENCODE_BASE_URL,
  options = {},
) {
  try {
    const fetched = await fetchOpencodeModelIds(baseUrl, undefined, options)
    const models = fetched.map(({ id }) => ({ id, name: id }))
    models.sort((a, b) => a.id.localeCompare(b.id))
    return { models, source: 'api' }
  } catch {
    const catalogPath = resolveCatalogPath('opencode-go')
    if (catalogPath === undefined) return { models: [], source: 'empty' }
    return { models: readCatalogModels(catalogPath), source: 'catalog' }
  }
}
