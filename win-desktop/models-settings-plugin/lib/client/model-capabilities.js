const IMAGE_INPUT = ['text', 'image'];
const TEXT_INPUT = ['text'];
/** Classify a bounded HTTP attempt without turning transient failures into facts. */
export function classifyCapabilityOutcome(outcome) {
    if (outcome.aborted === true)
        return 'inconclusive';
    if (outcome.status === undefined)
        return 'inconclusive';
    if (outcome.status >= 200 && outcome.status < 300)
        return 'supported';
    if (outcome.status >= 400 && outcome.status < 500 && outcome.status !== 408 && outcome.status !== 429) {
        return 'unsupported';
    }
    return 'inconclusive';
}
function checkIs(check, status) {
    return check?.status === status;
}
/** Convert successful/explicitly unsupported checks into the canonical pi-ai patch. */
export function capabilityPatchFromChecks(checks) {
    const patch = {};
    const image = checks['image'];
    if (checkIs(image, 'supported'))
        patch.input = IMAGE_INPUT;
    else if (checkIs(image, 'unsupported'))
        patch.input = TEXT_INPUT;
    const reasoning = checks['reasoning'];
    if (reasoning?.status === 'supported') {
        const efforts = reasoning.efforts ?? {};
        const normalized = { ...efforts };
        // A rejected wire `none` is not an explicit off value. When the request
        // without any reasoning parameter works, pi-ai represents that fact as
        // `off: null`, which means "omit the parameter".
        if (reasoning.noneRejected === true && reasoning.omittedReasoningSupported === true) {
            normalized['off'] = null;
        }
        if (Object.keys(normalized).length > 0)
            patch.reasoningEfforts = normalized;
    }
    else if (reasoning?.status === 'unsupported' && reasoning.allEffortsUnsupported === true) {
        patch.reasoningEfforts = false;
    }
    const compat = {};
    const compatChecks = {
        developer: ['supportsDeveloperRole', 'developer'],
        strict: ['supportsStrictMode', 'strict'],
        store: ['supportsStore', 'store'],
        streamingUsage: ['supportsUsageInStreaming', 'streamingUsage'],
    };
    for (const [field, [property, key]] of Object.entries(compatChecks)) {
        const check = checks[key];
        if (checkIs(check, 'supported'))
            compat[property] = true;
        else if (checkIs(check, 'unsupported'))
            compat[property] = false;
        void field;
    }
    const maxTokens = checks['maxTokens'];
    if (maxTokens?.status === 'supported' && typeof maxTokens.error === 'string') {
        compat['maxTokensField'] = maxTokens.error;
    }
    if (Object.keys(compat).length > 0)
        patch.compat = compat;
    return patch;
}
function isCapabilityInput(value) {
    return Array.isArray(value)
        && (value.length === 1 && value[0] === 'text'
            || value.length === 2 && value[0] === 'text' && value[1] === 'image');
}
function isPlainRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Apply capability fields to a draft row without rebuilding or losing hidden
 * model fields. The source is explicit so later callers cannot silently use
 * this helper for a different precedence rule.
 */
export function applyCapabilityPatch(model, patch, options) {
    const next = { ...model };
    const { overwriteExisting, source: _source } = options;
    if (patch.input !== undefined && isCapabilityInput(patch.input)
        && (!Object.hasOwn(model, 'input') || overwriteExisting)) {
        next['input'] = [...patch.input];
    }
    if (patch.reasoningEfforts !== undefined
        && (!Object.hasOwn(model, 'reasoningEfforts') || overwriteExisting)) {
        next['reasoningEfforts'] = patch.reasoningEfforts === false
            ? false
            : { ...patch.reasoningEfforts };
    }
    if (patch.compat !== undefined) {
        const existing = isPlainRecord(model['compat']) ? model['compat'] : {};
        const merged = { ...existing };
        for (const [key, value] of Object.entries(patch.compat)) {
            if (!Object.hasOwn(existing, key) || overwriteExisting)
                merged[key] = value;
        }
        next['compat'] = merged;
    }
    return next;
}
