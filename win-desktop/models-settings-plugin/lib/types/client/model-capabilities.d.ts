import type { CapabilityCheck, CapabilityCompatValue, CapabilityPatchSource, CapabilityStatus, ModelCapabilityPatch, ModelCapabilityProbeResult } from '../capability-contract.ts';
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
/**
 * Apply one completed probe to every matching draft row without writing
 * settings. Duplicate ids are deliberately all updated: the parent save gate
 * still rejects duplicates, but a user who is correcting a duplicate should
 * not see one visually identical row behave differently from the other.
 */
export declare function applyCapabilityProbeResult<T extends Record<string, unknown>>(models: readonly T[], result: ModelCapabilityProbeResult, overwriteExisting: boolean): T[];
/** Collapse the matrix into one cautious row-level status for the editor. */
export declare function capabilityResultStatus(result: ModelCapabilityProbeResult): CapabilityStatus;
