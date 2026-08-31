import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AgentTeamsSettings } from '../settings.ts';
import { type AgentTeamsSettingsWriter } from './settings-write.ts';
import type { AGENT_TEAMS_LOCALE_NAMESPACE } from './locales.ts';
export interface AgentTeamsSettingsSectionInjected {
    settings: SettingsScope<AgentTeamsSettings>;
    writer: AgentTeamsSettingsWriter;
}
export type AgentTeamsSettingsSectionProps = PropsRuntime<'settings.section'> & PropsLocale<typeof AGENT_TEAMS_LOCALE_NAMESPACE> & AgentTeamsSettingsSectionInjected;
export declare function AgentTeamsSettingsSection({ settings, writer, t, }: AgentTeamsSettingsSectionProps): import("react").JSX.Element;
