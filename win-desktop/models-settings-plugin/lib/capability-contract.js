const COMPAT_CHECKS_BY_PROTOCOL = {
    'openai-completions': [
        ['supportsDeveloperRole', 'developer'],
        ['supportsStrictMode', 'strict'],
        ['supportsStore', 'store'],
        ['supportsUsageInStreaming', 'streamingUsage'],
    ],
    'openai-responses': [
        ['supportsDeveloperRole', 'developer'],
        ['supportsStrictMode', 'strict'],
    ],
    'anthropic-messages': [],
};
function checkIs(check, status) {
    return check?.status === status;
}
/** Convert successful/explicitly unsupported checks into a patch legal for this protocol. */
export function capabilityPatchFromChecks(checks, protocol = 'openai-completions') {
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
    for (const [property, key] of COMPAT_CHECKS_BY_PROTOCOL[protocol]) {
        const check = checks[key];
        if (checkIs(check, 'supported'))
            compat[property] = true;
        else if (checkIs(check, 'unsupported'))
            compat[property] = false;
    }
    const maxTokens = checks['maxTokens'];
    // The pi-ai schema accepts maxTokensField only for OpenAI Completions.
    // Responses uses max_output_tokens, which is intentionally not configurable.
    if (protocol === 'openai-completions'
        &&
            maxTokens?.status === 'supported'
        && (maxTokens.error === 'max_tokens' || maxTokens.error === 'max_completion_tokens')) {
        compat['maxTokensField'] = maxTokens.error;
    }
    if (Object.keys(compat).length > 0)
        patch.compat = compat;
    return patch;
}
