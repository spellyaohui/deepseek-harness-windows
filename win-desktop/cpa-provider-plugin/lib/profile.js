import { normalizeCpaBaseURL } from "./address.js";
import { reasoningEffortsForModel } from "./reasoning.js";
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
