const REQUIRED_DEPENDENCIES = [
    'controller',
    'useSnapshot',
    'api',
    'schema',
    't',
    'renderSlot',
    'normalizeProviderProfile',
];
/**
 * The capability probe is intentionally not a page dependency: its Remote can
 * mount after the settings slot renders, and model editing must still work.
 */
export function modelsSectionDependenciesReady(value) {
    return REQUIRED_DEPENDENCIES.every(key => value[key] !== undefined);
}
/**
 * Keep the slot injection stable while resolving the asynchronously mounted
 * Remote at the moment the user actually starts a probe.
 */
export function createLateBoundCapabilityRemote(resolve, unavailableMessage) {
    return {
        async probe(request, signal) {
            const remote = resolve();
            if (remote === undefined)
                throw new Error(unavailableMessage());
            return remote.probe(request, signal);
        },
    };
}
/** Resolve the optional namespace service without Cordis property injection. */
export function resolveCapabilityRemote(ctx) {
    return ctx.get('remote.model-capabilities');
}
