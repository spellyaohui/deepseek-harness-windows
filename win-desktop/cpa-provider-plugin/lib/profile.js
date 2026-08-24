import { normalizeCpaBaseURL } from "./address.js";
import { reasoningEffortsForModel } from "./reasoning.js";
/** Merge a fresh listing with configured rows the endpoint temporarily omitted. */
export function mergeCpaCandidates(configured, discovered) {
    const configuredById = new Map(configured.map(candidate => [candidate.id.trim(), candidate]));
    const merged = new Map();
    for (const candidate of discovered) {
        const id = candidate.id.trim();
        if (id === '' || merged.has(id))
            continue;
        const previous = configuredById.get(id);
        const next = { ...previous, ...candidate, id };
        if (candidate.contextWindow === undefined && previous?.contextWindow !== undefined) {
            next.contextWindow = previous.contextWindow;
        }
        if (candidate.maxTokens === undefined && previous?.maxTokens !== undefined) {
            next.maxTokens = previous.maxTokens;
        }
        merged.set(id, next);
    }
    for (const candidate of configured) {
        const id = candidate.id.trim();
        if (id !== '' && !merged.has(id))
            merged.set(id, { ...candidate, id });
    }
    return [...merged.values()];
}
/** Convert selected discovery candidates to the exact pi-ai model profile. */
export function buildCpaModels(candidates) {
    const seen = new Set();
    const models = [];
    for (const candidate of candidates) {
        if (candidate.selected === false)
            continue;
        const id = candidate.id.trim();
        if (id === '' || seen.has(id))
            continue;
        seen.add(id);
        const name = candidate.name?.trim() || id;
        models.push({
            id,
            name,
            ...candidate.contextWindow === undefined ? {} : { contextWindow: candidate.contextWindow },
            ...candidate.maxTokens === undefined ? {} : { maxTokens: candidate.maxTokens },
            reasoningEfforts: reasoningEffortsForModel(id),
        });
    }
    if (models.length === 0)
        throw new Error('Select at least one model');
    return models;
}
/** Assemble the stable redacted CPA provider route. */
export function buildCpaProfile(draft) {
    return {
        displayName: 'CPA / CLIProxyAPI',
        apiKeyEnv: 'CPA_API_KEY',
        api: 'openai-responses',
        baseURL: normalizeCpaBaseURL(draft.baseURL),
        models: buildCpaModels(draft.models),
    };
}
