import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export type DelegationMode = 'teams' | 'native';
export type MemberReasoningMode = 'target-default' | 'route-aware' | 'explicit';
export interface AgentTeamsSettings {
    delegationMode: DelegationMode;
    memberLlmProvider: string;
    memberModel: string;
    memberReasoningMode: MemberReasoningMode;
    memberReasoningEffort: string;
    migrationVersion: number;
}
export interface LegacyDesktopAgentTeamsSettings {
    provider?: string;
    model?: string;
    reasoningEffort?: string;
}
export declare const AGENT_TEAMS_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
export declare const AGENT_TEAMS_MIGRATION_VERSION = 1;
export declare const DEFAULT_AGENT_TEAMS_SETTINGS: AgentTeamsSettings;
export declare const AgentTeamsSettingsSchema: z<AgentTeamsSettings>;
export declare function normalizeAgentTeamsSettings(input: Partial<AgentTeamsSettings>): AgentTeamsSettings;
export declare function normalizeLegacyDesktopAgentTeamsSettings(input: LegacyDesktopAgentTeamsSettings | undefined): LegacyDesktopAgentTeamsSettings | undefined;
export declare function normalizeMemberModelOverride(value: string | undefined): string | undefined;
export declare function validateAgentTeamsSettings(value: AgentTeamsSettings): void;
export interface AgentTeamsSettingsRuntime {
    get(): AgentTeamsSettings;
    migrationStatus(): {
        migrationVersion: number;
        complete: boolean;
    };
}
export declare function createAgentTeamsSettingsRuntime(ctx: Context, base: Partial<AgentTeamsSettings>, legacy: LegacyDesktopAgentTeamsSettings | undefined): AgentTeamsSettingsRuntime;
