import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
export const AGENT_TEAMS_SETTINGS_NAMESPACE = settingsNamespace('agent-teams');
export const AGENT_TEAMS_MIGRATION_VERSION = 1;
export const DEFAULT_AGENT_TEAMS_SETTINGS = {
    delegationMode: 'teams',
    memberLlmProvider: '',
    memberModel: '',
    memberReasoningMode: 'target-default',
    memberReasoningEffort: '',
    migrationVersion: 0,
};
export const AgentTeamsSettingsSchema = z.object({
    delegationMode: z.union(['teams', 'native']).default('teams'),
    memberLlmProvider: z.string().default(''),
    memberModel: z.string().default(''),
    memberReasoningMode: z.union(['target-default', 'route-aware', 'explicit']).default('target-default'),
    memberReasoningEffort: z.string().default(''),
    migrationVersion: z.natural().default(0),
});
export function normalizeAgentTeamsSettings(input) {
    return {
        delegationMode: input.delegationMode ?? 'teams',
        memberLlmProvider: input.memberLlmProvider?.trim() ?? '',
        memberModel: input.memberModel?.trim() ?? '',
        memberReasoningMode: input.memberReasoningMode ?? 'target-default',
        memberReasoningEffort: input.memberReasoningEffort?.trim() ?? '',
        migrationVersion: input.migrationVersion ?? 0,
    };
}
export function normalizeLegacyDesktopAgentTeamsSettings(input) {
    if (input === undefined)
        return undefined;
    const provider = input.provider?.trim() ?? '';
    const model = input.model?.trim() ?? '';
    const reasoningEffort = input.reasoningEffort?.trim() ?? '';
    if (provider === '' && model === '' && reasoningEffort === '')
        return undefined;
    return { provider, model, reasoningEffort };
}
export function normalizeMemberModelOverride(value) {
    const normalized = value?.trim();
    return normalized === '' ? undefined : normalized;
}
export function validateAgentTeamsSettings(value) {
    const normalized = normalizeAgentTeamsSettings(value);
    if (normalized.memberLlmProvider !== '' && normalized.memberModel === '') {
        throw new Error('memberLlmProvider requires memberModel');
    }
    if (normalized.memberReasoningMode === 'explicit' && normalized.memberReasoningEffort === '') {
        throw new Error('explicit memberReasoningMode requires memberReasoningEffort');
    }
    if (normalized.memberReasoningMode !== 'explicit' && normalized.memberReasoningEffort !== '') {
        throw new Error('memberReasoningEffort is valid only in explicit mode');
    }
}
export function createAgentTeamsSettingsRuntime(ctx, base, legacy) {
    const baseSettings = normalizeAgentTeamsSettings(base);
    let current = baseSettings;
    let attachment = 0;
    let migrationAttempted = false;
    ctx.inject(['settings'], (settingsCtx) => {
        const currentAttachment = ++attachment;
        const scope = settingsCtx.settings.register(AGENT_TEAMS_SETTINGS_NAMESPACE, AgentTeamsSettingsSchema, { base: baseSettings, applies: 'live', validate: validateAgentTeamsSettings });
        current = normalizeAgentTeamsSettings(scope.get());
        settingsCtx.effect(() => {
            const unwatch = scope.watch((next) => {
                if (currentAttachment === attachment) {
                    current = normalizeAgentTeamsSettings(next);
                }
            });
            return () => {
                unwatch();
                if (currentAttachment === attachment) {
                    attachment += 1;
                    current = baseSettings;
                }
            };
        }, 'agent-teams: settings watch');
        if (!migrationAttempted && legacy !== undefined && current.migrationVersion < AGENT_TEAMS_MIGRATION_VERSION) {
            migrationAttempted = true;
            const effort = legacy.reasoningEffort?.trim() ?? '';
            void scope.update({
                memberLlmProvider: legacy.provider?.trim() ?? '',
                memberModel: legacy.model?.trim() ?? '',
                memberReasoningMode: effort === '' ? 'target-default' : 'explicit',
                memberReasoningEffort: effort,
                migrationVersion: AGENT_TEAMS_MIGRATION_VERSION,
            }).then(() => {
                if (currentAttachment === attachment) {
                    current = normalizeAgentTeamsSettings(scope.get());
                }
            }).catch((error) => {
                ctx.logger.warn(`agent-teams: legacy settings migration failed: ${String(error)}`);
            });
        }
    });
    return {
        get: () => current,
        migrationStatus: () => ({
            migrationVersion: current.migrationVersion,
            complete: current.migrationVersion >= AGENT_TEAMS_MIGRATION_VERSION,
        }),
    };
}
