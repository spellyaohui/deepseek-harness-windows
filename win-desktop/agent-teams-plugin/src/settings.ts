import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SettingsNamespace, SettingsScope } from '@deepseek-ai/dsh-settings'

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
  base: Partial<AgentTeamsSettings>,
): AgentTeamsSettingsRuntime {
  const baseSettings = normalizeAgentTeamsSettings(base)
  let current = baseSettings
  let attachment = 0
  ctx.inject(['settings'], (settingsCtx) => {
    const currentAttachment = ++attachment
    const scope: SettingsScope<AgentTeamsSettings> = settingsCtx.settings.register(
      AGENT_TEAMS_SETTINGS_NAMESPACE,
      AgentTeamsSettingsSchema,
      { base: baseSettings, applies: 'live' },
    )
    current = normalizeAgentTeamsSettings(scope.get())
    settingsCtx.effect(() => {
      const unwatch = scope.watch((next) => {
        if (currentAttachment === attachment) {
          current = normalizeAgentTeamsSettings(next)
        }
      })
      return () => {
        unwatch()
        if (currentAttachment === attachment) {
          attachment += 1
          current = baseSettings
        }
      }
    }, 'agent-teams: settings watch')
  })
  return {
    get: () => current,
  }
}
