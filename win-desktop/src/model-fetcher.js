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
  if (!existsSync(settingsPath)) {
    return { models: readCatalogModels(catalogPath), added: 0, error: undefined }
  }

  try {
    const document = recordOf(parse(readFileSync(settingsPath, 'utf8')))
    const piAi = recordOf(document?.['llm-pi-ai'])
    const providers = recordOf(piAi?.['providers'])
    const opencode = recordOf(providers?.['opencode-go'])
    const persisted = Array.isArray(opencode?.['models']) ? opencode.models : []
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
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

    if (added > 0) writeFileSync(catalogPath, JSON.stringify(catalog), 'utf8')
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

  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
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

  if (added > 0) {
    writeFileSync(catalogPath, JSON.stringify(catalog), 'utf8')
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
