export async function buildHostModelCatalog(llm) {
    const models = [];
    const failures = [];
    for (const provider of llm.listProviders()) {
        try {
            for (const model of await llm.listModels(provider.id)) {
                const exact = await llm.resolveModelInfo(provider.id, model.id);
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
                });
            }
        }
        catch (error) {
            failures.push({
                provider: provider.id,
                message: error instanceof Error ? error.message : String(error),
            });
        }
    }
    return { models, failures };
}
