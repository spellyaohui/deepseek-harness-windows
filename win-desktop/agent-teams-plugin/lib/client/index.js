import { jsx as _jsx } from "react/jsx-runtime";
import { ActivityPanel } from "./ActivityPanel.js";
import { AgentTeamsSettingsSection } from "./AgentTeamsSettingsSection.js";
import { AgentTeamsCard } from "./AgentTeamsCard.js";
import { agentTeamsCardDefinition } from "./agent-teams-card-definition.js";
import { AGENT_TEAMS_LOCALE_NAMESPACE, en, zh, } from "./locales.js";
import { openAgentTeamMember } from "./session-navigation.js";
import { createAgentTeamsSettingsWriter } from "./settings-write.js";
/** Required services: conversation nodes, slots, sessions navigation, and locale. */
export const inject = [
    'conversationEvents', 'slots', 'sessions', 'locale', 'modelDirectories', 'settingsScope', 'connection',
];
/** The replayed user message is the canonical transcript entry. */
function HiddenAgentTeamsCommand() {
    return null;
}
/**
 * Register the activity monitor in the shell's additive overlay and the
 * in-conversation team card. The card's activity button re-opens a folded
 * monitor via a window event.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(AGENT_TEAMS_LOCALE_NAMESPACE, { zh, en }), 'agent-teams: dictionaries');
    const settings = ctx.settingsScope.bind({ namespace: 'agent-teams' });
    const settingsDescribe = ctx.settingsScope.describe();
    const connection = ctx.get('connection');
    const writer = createAgentTeamsSettingsWriter({
        api: connection.api,
        scope: settings,
        describe: settingsDescribe,
    });
    const t = ctx.locale.bind(AGENT_TEAMS_LOCALE_NAMESPACE);
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'agent-teams',
        order: 30,
        locale: AGENT_TEAMS_LOCALE_NAMESPACE,
        label: () => t('settings.title'),
        inject: () => ({ settings, writer }),
    }, AgentTeamsSettingsSection));
    const openMember = (parentId, childId) => {
        void openAgentTeamMember(ctx.sessions, parentId, childId).catch((error) => {
            console.warn(`agent-teams: failed to open member transcript ${childId}: ${String(error)}`);
        });
    };
    const Panel = ({ t }) => (_jsx(ActivityPanel, { sessionsList: ctx.sessions.list, modelDirectories: ctx.modelDirectories, openMember: openMember, t: t }));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'agent-teams-activity',
        order: 80,
        label: 'AgentTeams activity',
        locale: AGENT_TEAMS_LOCALE_NAMESPACE,
    }, Panel));
    // The host command is only the slash-menu/admission surface. Its input is
    // replayed as the visible user message, so the generic result row would be
    // a duplicate placed before that message by command lifecycle ordering.
    ctx.slots.inject('conversation.chat.commandview', () => ctx.slots.register({
        name: 'conversation.chat.commandview',
        key: 'agent-teams',
    }, HiddenAgentTeamsCommand));
    ctx.conversationEvents.register(agentTeamsCardDefinition);
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'agent-teams',
        locale: AGENT_TEAMS_LOCALE_NAMESPACE,
        inject: () => ({
            openMember,
        }),
    }, AgentTeamsCard));
}
