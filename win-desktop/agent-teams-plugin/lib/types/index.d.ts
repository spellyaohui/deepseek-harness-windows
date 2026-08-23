/**
 * AgentTeams for DeepSeek Harness.
 *
 * A host-plane plugin that registers the `agent_teams_*` tools and one usage
 * section into the global system prompt. After installation any session can
 * run multi-agent teamwork through natural language (e.g. "use AgentTeams to research X"):
 * the model creates a team (it becomes the captain), spawns members as
 * durable continuable subagents, breaks the goal into tasks with
 * dependencies, wakes members with messages, relays reports, and collects
 * results.
 *
 * Installation (bundle): `dsh plugin --profile <name> add @nanmicoder/dsh-agent-teams`
 * (or a local path). The bundle patch mounts this plugin row into the host
 * composition; the tools register into the shared `tools` registry and the
 * usage section into the global system prompt, so the plugin needs no realm.
 *
 * @module dsh-agent-teams
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type DelegationMode, type LegacyDesktopAgentTeamsSettings, type MemberReasoningMode } from './settings.ts';
interface HostModelCatalogEntry {
    provider: string;
    id: string;
    name: string;
    efforts: readonly {
        id: string;
        name: string;
    }[];
    defaultEffort?: string;
}
interface HostModelCatalogFailure {
    provider: string;
    message: string;
}
interface HostModelCatalogSource {
    listProviders(): readonly {
        id: string;
    }[];
    listModels(provider: string): Promise<readonly {
        id: string;
        name: string;
    }[]>;
    resolveModelInfo(provider: string, model: string): Promise<{
        reasoning?: {
            efforts: readonly {
                id: unknown;
                name: string;
            }[];
            defaultEffort?: unknown;
        };
    }>;
}
export declare function buildHostModelCatalog(llm: HostModelCatalogSource): Promise<{
    models: HostModelCatalogEntry[];
    failures: HostModelCatalogFailure[];
}>;
export declare const name = "agent-teams";
export declare const inject: string[];
/** Plugin configuration. */
export interface Config {
    delegationMode?: DelegationMode;
    memberLlmProvider?: string;
    /**
     * State directory name under the captain's workspace; team state lives at
     * `<workspace>/<stateDir>/<teamId>/` (default `.agent-teams`).
     */
    stateDir?: string;
    /** `ctx.subagents` provider used to spawn members; must support continuable children and personas (default `spawn`). */
    memberProvider?: string;
    /** Optional model override applied to every member. */
    memberModel?: string;
    memberReasoningMode?: MemberReasoningMode;
    memberReasoningEffort?: string;
    legacyDesktopSettings?: LegacyDesktopAgentTeamsSettings;
    /** Member delegation depth cap (default `1`; `0` forbids delegation entirely). */
    memberMaxDepth?: number;
    /** Team size cap in members (default `8`). */
    maxMembers?: number;
    /** Prompt-section order for the usage policy (default `117`, after delegation policy). */
    promptSectionOrder?: number;
    /**
     * Register the deterministic `/agent-teams` activation surfaces (the
     * closed-namespace slash command and the plain-text gesture boundary).
     * Disable to keep the natural-language trigger as the only entry point.
     */
    slashCommand?: boolean;
}
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config: Config): void;
export {};
