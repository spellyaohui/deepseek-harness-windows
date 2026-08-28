import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { DelegationMode } from './settings.ts';
export type DelegationPolicyId = 'teams-v1' | 'native-v1';
export declare const POLICY_PREFIX = "AgentTeams delegation policy:";
export declare const NATIVE_DELEGATION_TOOLS: readonly ["subagent", "subagent_fork", "subagent_codex", "subagent_claude_code", "list_agents", "send_message", "interrupt_agent", "workflow", "ralph"];
export declare function policyMarker(policy: DelegationPolicyId): string;
/** Policy-specific activation guidance placed before the shared AgentTeams protocol. */
export declare function delegationPolicyUsagePreamble(policy: DelegationPolicyId): string;
export declare function persistedPolicy(events: readonly SessionEvent[]): DelegationPolicyId | undefined;
export declare function resolveDelegationPolicy(input: {
    events: readonly SessionEvent[];
    defaultMode: DelegationMode;
    parentPolicy?: DelegationPolicyId;
}): DelegationPolicyId;
/** Return the in-scope policy already installed before an Agent's first request. */
export declare function installedDelegationPolicy(agent: Agent): DelegationPolicyId | undefined;
/** Resolve a live Agent's durable policy, including its unpublished installation. */
export declare function liveDelegationPolicy(agent: Agent, defaultMode: DelegationMode): DelegationPolicyId;
/** Live settings and policy-specific prompt renderer shared by captains and members. */
export interface DelegationPolicyRuntime {
    defaultMode(): DelegationMode;
    order: number;
    text(policy: DelegationPolicyId): string;
}
/** Install one policy prompt and its model-visible tool restriction in an Agent scope. */
export declare function installDelegationPolicy(input: {
    agent: Agent;
    policy: DelegationPolicyId;
    order: number;
    text: string;
}): () => void;
/** Resolve and install one Agent policy before any request assembly. */
export declare function resolveAndInstallDelegationPolicy(agent: Agent, parent: Agent | undefined, runtime: DelegationPolicyRuntime): {
    policy: DelegationPolicyId;
    dispose: () => void;
};
/** Register the synchronous `agent/created` policy installer from the plugin root. */
export declare function registerDelegationPolicyLifecycle(ctx: Context, runtime: DelegationPolicyRuntime): () => void;
