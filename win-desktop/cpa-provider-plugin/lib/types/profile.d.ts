import type { CpaDraft, CpaModelCandidate, CpaModelProfile, CpaProviderProfile } from './types.ts';
type UnknownRecord = Record<string, unknown>;
/** Merge a fresh listing with configured rows the endpoint temporarily omitted. */
export declare function mergeCpaCandidates(configured: readonly CpaModelCandidate[], discovered: readonly CpaModelCandidate[]): CpaModelCandidate[];
/** Convert selected discovery candidates to the exact pi-ai model profile. */
export declare function buildCpaModels(candidates: readonly CpaModelCandidate[]): CpaModelProfile[];
/** Assemble the stable redacted CPA provider route. */
export declare function buildCpaProfile(draft: CpaDraft): CpaProviderProfile;
/**
 * Normalize a CPA profile edited through Harness's native provider editor.
 * Provider-specific facts stay here so the generic Models fork remains
 * provider-neutral. Unknown fields and raw capacity numbers are preserved.
 */
export declare function normalizeCpaProviderProfile(value: UnknownRecord): UnknownRecord;
export {};
