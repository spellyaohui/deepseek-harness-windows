import type { CpaReasoningEfforts } from './types.ts';
/** Normalize historical desktop values before validating them against a model. */
export declare function normalizeLegacyEffort(value: string): string;
/** Return the ordered Harness-id to CPA-wire effort map for one exact model id. */
export declare function reasoningEffortsForModel(modelId: string): CpaReasoningEfforts;
