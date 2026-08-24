import type { CpaModelCandidate } from '../types.ts';
export type CpaCapacityField = 'contextWindow' | 'maxTokens';
export interface CpaCapacityDraft {
    contextWindow: string;
    maxTokens: string;
}
export type CpaCapacityDrafts = ReadonlyMap<string, CpaCapacityDraft>;
export type CpaCapacityResult = {
    ok: true;
    models: CpaModelCandidate[];
} | {
    ok: false;
    modelId: string;
    field: CpaCapacityField;
};
export declare function capacityDraftsFromModels(models: readonly CpaModelCandidate[]): Map<string, CpaCapacityDraft>;
export declare function mergeCapacityDrafts(current: CpaCapacityDrafts, discovered: readonly CpaModelCandidate[]): Map<string, CpaCapacityDraft>;
export declare function applyCapacityDrafts(models: readonly CpaModelCandidate[], drafts: CpaCapacityDrafts): CpaCapacityResult;
