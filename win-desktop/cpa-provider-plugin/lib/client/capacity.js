function draftFromModel(model) {
    return {
        contextWindow: model.contextWindow === undefined ? '' : String(model.contextWindow),
        maxTokens: model.maxTokens === undefined ? '' : String(model.maxTokens),
    };
}
function parseCapacity(value) {
    if (value === '')
        return undefined;
    if (!/^[0-9]+$/.test(value))
        return false;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : false;
}
export function capacityDraftsFromModels(models) {
    return new Map(models.map(model => [model.id, draftFromModel(model)]));
}
export function mergeCapacityDrafts(current, discovered) {
    const merged = new Map(current);
    for (const model of discovered) {
        if (!merged.has(model.id))
            merged.set(model.id, draftFromModel(model));
    }
    return merged;
}
export function applyCapacityDrafts(models, drafts) {
    const parsedModels = [];
    for (const model of models) {
        if (model.selected === false) {
            parsedModels.push(model);
            continue;
        }
        const draft = drafts.get(model.id) ?? draftFromModel(model);
        const contextWindow = parseCapacity(draft.contextWindow);
        if (contextWindow === false)
            return { ok: false, modelId: model.id, field: 'contextWindow' };
        const maxTokens = parseCapacity(draft.maxTokens);
        if (maxTokens === false)
            return { ok: false, modelId: model.id, field: 'maxTokens' };
        const { contextWindow: _contextWindow, maxTokens: _maxTokens, ...base } = model;
        parsedModels.push({
            ...base,
            ...(contextWindow === undefined ? {} : { contextWindow }),
            ...(maxTokens === undefined ? {} : { maxTokens }),
        });
    }
    return { ok: true, models: parsedModels };
}
