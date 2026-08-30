import type { CapabilityCheck, CapabilityCompatValue, CapabilityPatchSource, CapabilityStatus, ModelCapabilityPatch } from '../capability-contract.ts';
import { capabilityPatchFromChecks } from '../capability-contract.ts';
export type { CapabilityCheck, CapabilityCompatValue, CapabilityPatchSource, CapabilityStatus, ModelCapabilityPatch };
export { capabilityPatchFromChecks };
/** Classify a bounded HTTP attempt without turning transient failures into facts. */
export declare function classifyCapabilityOutcome(outcome: {
    status?: number;
    aborted?: boolean;
}): CapabilityStatus;
/**
 * Apply capability fields to a draft row without rebuilding or losing hidden
 * model fields. The source is explicit so later callers cannot silently use
 * this helper for a different precedence rule.
 */
export declare function applyCapabilityPatch<T extends Record<string, unknown>>(model: T, patch: ModelCapabilityPatch, options: {
    overwriteExisting: boolean;
    source: CapabilityPatchSource;
}): T;
