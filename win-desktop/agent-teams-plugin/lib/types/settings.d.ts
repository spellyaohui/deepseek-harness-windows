import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export type DelegationMode = 'teams' | 'native';
export interface AgentTeamsSettings {
    delegationMode: DelegationMode;
}
export declare const AGENT_TEAMS_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
export declare const DEFAULT_AGENT_TEAMS_SETTINGS: AgentTeamsSettings;
export declare const AgentTeamsSettingsSchema: z<AgentTeamsSettings>;
export declare function normalizeAgentTeamsSettings(input: Partial<AgentTeamsSettings>): AgentTeamsSettings;
export interface AgentTeamsSettingsRuntime {
    get(): AgentTeamsSettings;
}
export declare function createAgentTeamsSettingsRuntime(ctx: Context, base: Partial<AgentTeamsSettings>): AgentTeamsSettingsRuntime;
