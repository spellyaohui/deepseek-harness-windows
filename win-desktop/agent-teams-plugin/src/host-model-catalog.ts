interface HostModelCatalogEntry {
  provider: string
  id: string
  name: string
  efforts: readonly { id: string; name: string }[]
  defaultEffort?: string
}

interface HostModelCatalogFailure {
  provider: string
  message: string
}

interface HostModelCatalogSource {
  listProviders(): readonly { id: string }[]
  listModels(provider: string): Promise<readonly { id: string; name: string }[]>
  resolveModelInfo(provider: string, model: string): Promise<{
    reasoning?: {
      efforts: readonly { id: unknown; name: string }[]
      defaultEffort?: unknown
    }
  }>
}

export async function buildHostModelCatalog(llm: HostModelCatalogSource): Promise<{
  models: HostModelCatalogEntry[]
  failures: HostModelCatalogFailure[]
}> {
  const models: HostModelCatalogEntry[] = []
  const failures: HostModelCatalogFailure[] = []
  for (const provider of llm.listProviders()) {
    try {
      for (const model of await llm.listModels(provider.id)) {
        const exact = await llm.resolveModelInfo(provider.id, model.id)
        models.push({
          provider: provider.id,
          id: model.id,
          name: model.name,
          efforts: exact.reasoning?.efforts.map((effort) => ({
            id: String(effort.id),
            name: effort.name,
          })) ?? [],
          ...(exact.reasoning?.defaultEffort === undefined
            ? {}
            : { defaultEffort: String(exact.reasoning.defaultEffort) }),
        })
      }
    } catch (error: unknown) {
      failures.push({
        provider: provider.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { models, failures }
}
