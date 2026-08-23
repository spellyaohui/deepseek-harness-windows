function recordOf(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function numberOf(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}
function readModels(value) {
    if (!Array.isArray(value))
        return [];
    const models = [];
    for (const candidate of value) {
        const row = recordOf(candidate);
        const id = typeof row?.['id'] === 'string' ? row['id'].trim() : '';
        if (id === '')
            continue;
        const name = typeof row?.['name'] === 'string' && row['name'].trim() !== '' ? row['name'].trim() : id;
        const contextWindow = numberOf(row?.['contextWindow']);
        const maxTokens = numberOf(row?.['maxTokens']);
        models.push({
            id,
            name,
            ...contextWindow === undefined ? {} : { contextWindow },
            ...maxTokens === undefined ? {} : { maxTokens },
            selected: true,
        });
    }
    return models;
}
/** Project the redacted shared Models snapshot into CPA card state. */
export function cpaSettingsView(state) {
    const namespace = state.namespaces.get('llm-pi-ai');
    const root = recordOf(namespace?.value);
    const providers = recordOf(root?.['providers']);
    const profile = recordOf(providers?.['cpa']);
    const row = state.rows.find(candidate => candidate.entry.provider === 'cpa');
    return {
        status: state.status,
        writable: state.writable,
        revision: namespace?.revision,
        baseURL: typeof profile?.['baseURL'] === 'string' ? profile['baseURL'] : '',
        models: readModels(profile?.['models']),
        credentialConfigured: row?.credential?.configured === true,
    };
}
