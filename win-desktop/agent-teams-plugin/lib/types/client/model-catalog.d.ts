export interface ModelCatalogEntry {
    provider: string;
    id: string;
    name: string;
    efforts: readonly {
        id: string;
        name: string;
    }[];
    defaultEffort?: string;
}
export type ModelCatalogState = {
    status: 'ready';
    models: readonly ModelCatalogEntry[];
    error: null;
} | {
    status: 'empty';
    models: readonly ModelCatalogEntry[];
    error: null;
} | {
    status: 'error';
    models: readonly ModelCatalogEntry[];
    error: string;
};
export declare function loadModelCatalog(fetcher?: typeof fetch, timeoutMs?: number): Promise<ModelCatalogState>;
