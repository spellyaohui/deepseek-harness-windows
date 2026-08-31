import z from '@deepseek-ai/schemastery';
// Alpha.2 validates the namespace at the SettingsProvider boundary and no
// longer exports the rc.2 settingsNamespace constructor.
export const AGENT_TEAMS_SETTINGS_NAMESPACE = 'agent-teams';
export const DEFAULT_AGENT_TEAMS_SETTINGS = {
    delegationMode: 'teams',
};
export const AgentTeamsSettingsSchema = z.object({
    delegationMode: z.union(['teams', 'native']).default('teams'),
});
export function normalizeAgentTeamsSettings(input) {
    return {
        delegationMode: input.delegationMode ?? 'teams',
    };
}
export function createAgentTeamsSettingsRuntime(ctx, base) {
    const baseSettings = normalizeAgentTeamsSettings(base);
    let current = baseSettings;
    let attachment = 0;
    ctx.inject(['settings'], (settingsCtx) => {
        const currentAttachment = ++attachment;
        const scope = settingsCtx.settings.register(AGENT_TEAMS_SETTINGS_NAMESPACE, AgentTeamsSettingsSchema, { base: baseSettings, applies: 'live' });
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
    });
    return {
        get: () => current,
    };
}
