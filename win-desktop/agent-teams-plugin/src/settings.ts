import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'

export type DelegationMode = 'teams' | 'native'

export interface AgentTeamsSettings {
  delegationMode: DelegationMode
}

// Alpha.2 validates the namespace at the SettingsProvider boundary and no
// longer exports the rc.2 settingsNamespace constructor.
export const AGENT_TEAMS_SETTINGS_NAMESPACE = 'agent-teams' as SettingsNamespace

export const DEFAULT_AGENT_TEAMS_SETTINGS: AgentTeamsSettings = {
  delegationMode: 'teams',
}

export const AgentTeamsSettingsSchema: z<AgentTeamsSettings> = z.object({
  delegationMode: z.union(['teams', 'native']).default('teams'),
})

export function normalizeAgentTeamsSettings(input: Partial<AgentTeamsSettings>): AgentTeamsSettings {
  return {
    delegationMode: input.delegationMode ?? 'teams',
  }
}

export interface AgentTeamsSettingsRuntime {
  get(): AgentTeamsSettings
}

export function createAgentTeamsSettingsRuntime(
  ctx: Context,
  delegationMode: Volatile<DelegationMode> | undefined,
): AgentTeamsSettingsRuntime {
  ctx.inject(['settings'], (settingsCtx) => {
    // The v0.1.7 settings service projects volatile Config fields itself.
    // Keep the bespoke Team/Native page as the only AgentTeams editor.
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
  return {
    get: () => normalizeAgentTeamsSettings({ delegationMode: delegationMode?.get() }),
  }
}
