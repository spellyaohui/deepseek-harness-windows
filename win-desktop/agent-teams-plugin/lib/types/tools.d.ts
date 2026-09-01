/**
 * The `agent_teams_*` model-facing tools.
 *
 * The captain (the agent that created the team) orchestrates: members are
 * continuable subagents it spawns and wakes. Members share the same tools and
 * drive their own task state, mirroring the Claude Code AgentTeams flow:
 * create team → add members → create tasks with dependencies → claim/assign →
 * work → report → status → delete.
 * @module dsh-agent-teams/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { type TaskKind } from './types.ts';
import { type TeamState, type TeamTask } from './types.ts';
import type { RoleReasoningMode } from './selection-policy.ts';
import type { AgentTeamsSettingsRuntime } from './settings.ts';
import type { DelegationPolicyRuntime } from './routing-policy.ts';
/** Resolved plugin config consumed by the tools. */
export interface ToolsConfig {
    /** State directory name under the captain's workspace. */
    stateDir: string;
    /** Member subagent provider name. */
    memberProvider: string;
    /** Prompt injected into member personas and assignments. */
    executionPrompt?: string;
    /** Plugin fallback route. */
    fallback?: import('./profiles.ts').TeamModelFallbackConfig;
    /** Member delegation depth cap. */
    memberMaxDepth?: number;
    /** Team size cap (members). */
    maxMembers: number;
    /** Live AgentTeams settings runtime retained for non-routing settings. */
    settings: AgentTeamsSettingsRuntime;
    /** Durable Team/Native policy installed into captains and member children. */
    delegationPolicy?: DelegationPolicyRuntime;
    /** Named team profiles from the active DSH profile. */
    profiles: Record<string, import('./profiles.ts').TeamProfileConfig>;
    /** Synchronous test-only observation of profile initialization persistence calls. */
    testObserver?: {
        onInitializeProfileTeamPersistence?: (operation: 'createTeamDir' | 'writeTeam') => void;
    };
}
/** Browser/UI mutations allowed while a plan is waiting for approval. */
export type StagedPlanMutation = {
    action: 'update_member';
    memberName: string;
    role?: string | null;
    provider: string;
    model: string;
    reasoningMode?: RoleReasoningMode;
    reasoningEffort?: string | null;
    executionPrompt?: string | null;
} | {
    action: 'update_task';
    taskId: string;
    subject?: string;
    description?: string | null;
    assignee?: string | null;
    dependencies?: string[];
    kind?: TaskKind;
    round?: number | null;
    objective?: string | null;
    inScope?: string[] | null;
    outOfScope?: string[] | null;
    acceptance?: string[] | null;
    verify?: string[] | null;
    deliverables?: string[] | null;
    nonGoals?: string[] | null;
    reviewedTaskId?: string | null;
    sourceTaskId?: string | null;
    sourceFindingIds?: string[] | null;
    coverageOf?: string[] | null;
} | {
    action: 'add_task';
    subject: string;
    description?: string | null;
    assignee?: string | null;
    dependencies?: string[];
    kind?: TaskKind;
    round?: number | null;
    objective?: string | null;
    inScope?: string[] | null;
    outOfScope?: string[] | null;
    acceptance?: string[] | null;
    verify?: string[] | null;
    deliverables?: string[] | null;
    nonGoals?: string[] | null;
    reviewedTaskId?: string | null;
    sourceTaskId?: string | null;
    sourceFindingIds?: string[] | null;
    coverageOf?: string[] | null;
} | {
    action: 'remove_task';
    taskId: string;
} | {
    action: 'remove_member';
    memberName: string;
};
export type StagedPlanUpdateOptions = {
    origin: 'captain';
    submitForReview: boolean;
} | {
    origin: 'web';
    expectedPlanRevision: number;
};
export type ApprovalEvidence = {
    source: 'web';
    token: string;
    expectedPlanRevision: number;
} | {
    source: 'chat';
    eventSeq: number;
    evidenceId: string;
    expectedPlanRevision: number;
};
export interface PreparedWebApproval {
    token: string;
    receiptId: string;
    expiresAt: number;
    planRevision: number;
}
export interface ApprovedTeamResult {
    teamId: string;
    members: number;
    tasks: number;
    planRevision: number;
    approvalSource: 'web' | 'chat';
    approvalEvidenceId: string;
}
/** Runtime bridge shared by model-facing tools and the Web staging surface. */
export interface AgentTeamsRuntime {
    updateStagedPlan(captain: Agent, teamId: string, mutation: StagedPlanMutation, options: StagedPlanUpdateOptions, signal?: AbortSignal): Promise<TeamState>;
    updateStagedPlanBatch(captain: Agent, teamId: string, mutations: readonly StagedPlanMutation[], options: StagedPlanUpdateOptions, signal?: AbortSignal): Promise<TeamState>;
    prepareWebApproval(captain: Agent, teamId: string, expectedPlanRevision: number): Promise<PreparedWebApproval>;
    approveStagedTeam(captain: Agent, teamId: string, evidence: ApprovalEvidence, signal?: AbortSignal): Promise<ApprovedTeamResult>;
    continueStagedPlanning(captain: Agent, teamId: string): Promise<{
        teamId: string;
        alreadyWaiting: boolean;
    }>;
    discardStagedTeam(captain: Agent, teamId: string): Promise<{
        teamId: string;
    }>;
}
export declare function haltTeamWork(input: {
    ctx: Context;
    stateRoot: string;
    teamId: string;
    captain: Agent;
    signal?: AbortSignal;
}): Promise<{
    teamName: string;
    cancelledTasks: number;
    alreadyHalted: boolean;
}>;
export declare function steerCaptainReport(captain: Pick<Agent, 'steer'>, from: string, content: string): boolean;
/** Context queued after the human rejects a staged plan. */
export declare function stagedPlanDiscardContext(teamName: string): string;
/** Model-facing continuation that turns the review UI back into a conversation. */
export declare function stagedPlanFeedbackContext(teamName: string): string;
/**
 * Register every `agent_teams_*` tool into the shared tools registry.
 * @param ctx - the plugin context (injects `tools`).
 * @param config - resolved tool config.
 */
export declare function registerAgentTeamsTools(ctx: Context, config: ToolsConfig): AgentTeamsRuntime;
export declare function applyQualityFollowUp(team: TeamState, closed: TeamTask): {
    created: TeamTask[];
    escalated: boolean;
};
