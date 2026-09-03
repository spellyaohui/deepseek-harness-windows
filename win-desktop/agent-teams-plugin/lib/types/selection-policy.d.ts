export type RoleReasoningMode = 'target-default' | 'route-aware' | 'explicit';
export interface MemberRolePolicy {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
    reasoningMode: RoleReasoningMode;
}
export declare function validateMemberRolePolicy(input: {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
    reasoningMode?: unknown;
}): asserts input is MemberRolePolicy;
export interface MemberSelectionCandidate {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** The frozen model-policy fields used to seed a numbered role member. */
export interface MemberRoleTemplate {
    name: string;
    role?: string;
    provider: string;
    model: string;
    reasoningMode: RoleReasoningMode;
    reasoningEffort?: string;
    fallback?: {
        provider: string;
        model: string;
    };
}
export type MemberRoleTemplateMatch = {
    kind: 'matched';
    template: MemberRoleTemplate;
} | {
    kind: 'none';
} | {
    kind: 'ambiguous';
    templates: readonly MemberRoleTemplate[];
};
/**
 * Find the frozen base-role policy for a newly named member.
 *
 * Matching is deliberately provider/model neutral. The exact unnumbered name
 * wins first; a role description is only a fallback. Ambiguous descriptions
 * are reported to the caller so it can require an explicit route instead of
 * choosing an arbitrary model.
 */
export declare function findMemberRoleTemplate(input: {
    memberName: string;
    role?: string;
    members: readonly MemberRoleTemplate[];
}): MemberRoleTemplateMatch;
export declare function selectMemberCandidate(input: {
    captain: MemberSelectionCandidate;
    role: MemberRolePolicy;
}): MemberSelectionCandidate;
