import type { CpaDraft, CpaModelCandidate, CpaModelProfile, CpaProviderProfile } from './types.ts';
/** Convert selected discovery candidates to the exact pi-ai model profile. */
export declare function buildCpaModels(candidates: readonly CpaModelCandidate[]): CpaModelProfile[];
/** Assemble the stable redacted CPA provider route. */
export declare function buildCpaProfile(draft: CpaDraft): CpaProviderProfile;
