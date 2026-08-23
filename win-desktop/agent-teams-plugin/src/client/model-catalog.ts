export interface ModelCatalogEntry {
  provider: string
  id: string
  name: string
  efforts: readonly { id: string; name: string }[]
  defaultEffort?: string
}

export type ModelCatalogState =
  | { status: 'ready'; models: readonly ModelCatalogEntry[]; error: null }
  | { status: 'empty'; models: readonly ModelCatalogEntry[]; error: null }
  | { status: 'error'; models: readonly ModelCatalogEntry[]; error: string }

export async function loadModelCatalog(
  fetcher: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<ModelCatalogState> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const response = await fetcher('/plugins/dsh-agent-teams/models', { signal: abort.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const body = await response.json() as { models?: ModelCatalogEntry[] }
    const models = Array.isArray(body.models) ? body.models : []
    return models.length === 0
      ? { status: 'empty', models, error: null }
      : { status: 'ready', models, error: null }
  } catch (error: unknown) {
    const message = abort.signal.aborted
      ? `模型目录请求超过 ${timeoutMs}ms`
      : error instanceof Error ? error.message : String(error)
    return { status: 'error', models: [], error: message }
  } finally {
    clearTimeout(timer)
  }
}
