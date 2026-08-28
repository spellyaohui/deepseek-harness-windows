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
export declare function selectMemberCandidate(input: {
    captain: MemberSelectionCandidate;
    role: MemberRolePolicy;
}): MemberSelectionCandidate;
