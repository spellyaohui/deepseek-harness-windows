function checkIs(check, status) {
    return check?.status === status;
}
/** Convert successful/explicitly unsupported checks into the canonical pi-ai patch. */
export function capabilityPatchFromChecks(checks) {
    const patch = {};
    const image = checks['image'];
    if (checkIs(image, 'supported'))
        patch.input = ['text', 'image'];
    else if (checkIs(image, 'unsupported'))
        patch.input = ['text'];
    const reasoning = checks['reasoning'];
    if (reasoning?.status === 'supported') {
        const normalized = { ...(reasoning.efforts ?? {}) };
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
    const compatChecks = [
        ['supportsDeveloperRole', 'developer'],
        ['supportsStrictMode', 'strict'],
        ['supportsStore', 'store'],
        ['supportsUsageInStreaming', 'streamingUsage'],
    ];
    for (const [property, key] of compatChecks) {
        const check = checks[key];
        if (checkIs(check, 'supported'))
            compat[property] = true;
        else if (checkIs(check, 'unsupported'))
            compat[property] = false;
    }
    const maxTokens = checks['maxTokens'];
    if (maxTokens?.status === 'supported' && typeof maxTokens.error === 'string') {
        compat['maxTokensField'] = maxTokens.error;
    }
    if (Object.keys(compat).length > 0)
        patch.compat = compat;
    return patch;
}
