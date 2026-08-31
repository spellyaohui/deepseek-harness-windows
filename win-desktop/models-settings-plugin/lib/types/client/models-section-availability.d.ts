import type { ModelCapabilityProbeRemote } from '../remote.ts';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
declare const REQUIRED_DEPENDENCIES: readonly ["controller", "useSnapshot", "api", "schema", "t", "renderSlot", "normalizeProviderProfile"];
type RequiredDependency = typeof REQUIRED_DEPENDENCIES[number];
type WithPresentDependencies<T extends Partial<Record<RequiredDependency, unknown>>> = T & {
    [Key in RequiredDependency]-?: Exclude<T[Key], undefined>;
};
/**
 * The capability probe is intentionally not a page dependency: its Remote can
 * mount after the settings slot renders, and model editing must still work.
 */
export declare function modelsSectionDependenciesReady<T extends Partial<Record<RequiredDependency, unknown>>>(value: T): value is WithPresentDependencies<T>;
/**
 * Keep the slot injection stable while resolving the asynchronously mounted
 * Remote at the moment the user actually starts a probe.
 */
export declare function createLateBoundCapabilityRemote(resolve: () => ModelCapabilityProbeRemote | undefined, unavailableMessage: () => string): ModelCapabilityProbeRemote;
/** Resolve the optional namespace service without Cordis property injection. */
export declare function resolveCapabilityRemote(ctx: Pick<ClientContext, 'get'>): ModelCapabilityProbeRemote | undefined;
export {};
