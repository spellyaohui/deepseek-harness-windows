export function validateMemberRolePolicy(input) {
    if (input.reasoningMode !== 'target-default'
        && input.reasoningMode !== 'route-aware'
        && input.reasoningMode !== 'explicit') {
        throw new Error('member reasoning mode must be target-default, route-aware, or explicit');
    }
    const provider = optionalNonBlank(input.provider);
    const model = optionalNonBlank(input.model);
    const effort = optionalNonBlank(input.reasoningEffort);
    if ((provider === undefined) !== (model === undefined)) {
        throw new Error('an explicit member LLM provider requires an explicit member model');
    }
    if (input.reasoningMode !== 'explicit' && effort !== undefined) {
        throw new Error('reasoning effort is only valid in explicit member policy mode');
    }
    if (input.reasoningMode === 'explicit' && (provider === undefined || model === undefined || effort === undefined)) {
        throw new Error('explicit member policy requires provider, model, and reasoning effort');
    }
}
function optionalNonBlank(value) {
    const normalized = value?.trim();
    return normalized === '' ? undefined : normalized;
}
export function selectMemberCandidate(input) {
    validateMemberRolePolicy(input.role);
    const provider = optionalNonBlank(input.role.provider);
    const model = optionalNonBlank(input.role.model);
    const effort = optionalNonBlank(input.role.reasoningEffort);
    const targetProvider = provider ?? input.captain.provider;
    const targetModel = model ?? input.captain.model;
    const sameRoute = targetProvider === input.captain.provider && targetModel === input.captain.model;
    const reasoningEffort = input.role.reasoningMode === 'explicit'
        ? effort
        : input.role.reasoningMode === 'route-aware' && sameRoute
            ? input.captain.reasoningEffort
            : undefined;
    return {
        provider: targetProvider,
        model: targetModel,
        ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    };
}
