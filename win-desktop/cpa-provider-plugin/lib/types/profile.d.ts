import type { CpaDraft, CpaModelCandidate, CpaModelProfile, CpaProviderProfile } from './types.ts';
/** Merge a fresh listing with configured rows the endpoint temporarily omitted. */
export declare function mergeCpaCandidates(configured: readonly CpaModelCandidate[], discovered: readonly CpaModelCandidate[]): CpaModelCandidate[];
/** Convert selected discovery candidates to the exact pi-ai model profile. */
export declare function buildCpaModels(candidates: readonly CpaModelCandidate[]): CpaModelProfile[];
/** Assemble the stable redacted CPA provider route. */
export declare function buildCpaProfile(draft: CpaDraft): CpaProviderProfile;
