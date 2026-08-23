interface HostModelCatalogEntry {
    provider: string;
    id: string;
    name: string;
    efforts: readonly {
        id: string;
        name: string;
    }[];
    defaultEffort?: string;
}
interface HostModelCatalogFailure {
    provider: string;
    message: string;
}
interface HostModelCatalogSource {
    listProviders(): readonly {
        id: string;
    }[];
    listModels(provider: string): Promise<readonly {
        id: string;
        name: string;
    }[]>;
    resolveModelInfo(provider: string, model: string): Promise<{
        reasoning?: {
            efforts: readonly {
                id: unknown;
                name: string;
            }[];
            defaultEffort?: unknown;
        };
    }>;
}
export declare function buildHostModelCatalog(llm: HostModelCatalogSource): Promise<{
    models: HostModelCatalogEntry[];
    failures: HostModelCatalogFailure[];
}>;
export {};
