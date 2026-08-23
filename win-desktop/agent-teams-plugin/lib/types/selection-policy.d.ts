import type { AgentTeamsSettings } from './settings.ts';
export interface MemberRouteInput {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
}
export interface MemberSelectionCandidate {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
export declare function selectMemberCandidate(input: {
    captain: MemberSelectionCandidate;
    settings: AgentTeamsSettings;
    explicit: MemberRouteInput;
}): MemberSelectionCandidate;
