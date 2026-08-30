import type { CapabilityCheck, CapabilityCompatValue, CapabilityPatchSource, CapabilityStatus, ModelCapabilityPatch } from '../capability-contract.ts';
export type { CapabilityCheck, CapabilityCompatValue, CapabilityPatchSource, CapabilityStatus, ModelCapabilityPatch };
/** Classify a bounded HTTP attempt without turning transient failures into facts. */
export declare function classifyCapabilityOutcome(outcome: {
    status?: number;
    aborted?: boolean;
}): CapabilityStatus;
/** Convert successful/explicitly unsupported checks into the canonical pi-ai patch. */
export declare function capabilityPatchFromChecks(checks: Readonly<Record<string, CapabilityCheck>>): ModelCapabilityPatch;
/**
 * Apply capability fields to a draft row without rebuilding or losing hidden
 * model fields. The source is explicit so later callers cannot silently use
 * this helper for a different precedence rule.
 */
export declare function applyCapabilityPatch<T extends Record<string, unknown>>(model: T, patch: ModelCapabilityPatch, options: {
    overwriteExisting: boolean;
    source: CapabilityPatchSource;
}): T;
