import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'

export type DelegationMode = 'teams' | 'native'
export type MemberReasoningMode = 'target-default' | 'route-aware' | 'explicit'

export interface AgentTeamsSettings {
  delegationMode: DelegationMode
  memberLlmProvider: string
  memberModel: string
  memberReasoningMode: MemberReasoningMode
  memberReasoningEffort: string
  migrationVersion: number
}

export interface LegacyDesktopAgentTeamsSettings {
  provider?: string
  model?: string
  reasoningEffort?: string
}

export const AGENT_TEAMS_SETTINGS_NAMESPACE = settingsNamespace('agent-teams')
export const AGENT_TEAMS_MIGRATION_VERSION = 1

export const DEFAULT_AGENT_TEAMS_SETTINGS: AgentTeamsSettings = {
  delegationMode: 'teams',
  memberLlmProvider: '',
  memberModel: '',
  memberReasoningMode: 'target-default',
  memberReasoningEffort: '',
  migrationVersion: 0,
}

export const AgentTeamsSettingsSchema: z<AgentTeamsSettings> = z.object({
  delegationMode: z.union(['teams', 'native']).default('teams'),
  memberLlmProvider: z.string().default(''),
  memberModel: z.string().default(''),
  memberReasoningMode: z.union(['target-default', 'route-aware', 'explicit']).default('target-default'),
  memberReasoningEffort: z.string().default(''),
  migrationVersion: z.natural().default(0),
})

export function normalizeAgentTeamsSettings(input: Partial<AgentTeamsSettings>): AgentTeamsSettings {
  return {
    delegationMode: input.delegationMode ?? 'teams',
    memberLlmProvider: input.memberLlmProvider?.trim() ?? '',
    memberModel: input.memberModel?.trim() ?? '',
    memberReasoningMode: input.memberReasoningMode ?? 'target-default',
    memberReasoningEffort: input.memberReasoningEffort?.trim() ?? '',
    migrationVersion: input.migrationVersion ?? 0,
  }
}

export function validateAgentTeamsSettings(value: AgentTeamsSettings): void {
  if (value.memberLlmProvider !== '' && value.memberModel === '') {
    throw new Error('memberLlmProvider requires memberModel')
  }
  if (value.memberReasoningMode === 'explicit' && value.memberReasoningEffort === '') {
    throw new Error('explicit memberReasoningMode requires memberReasoningEffort')
  }
  if (value.memberReasoningMode !== 'explicit' && value.memberReasoningEffort !== '') {
    throw new Error('memberReasoningEffort is valid only in explicit mode')
  }
}

export interface AgentTeamsSettingsRuntime {
  get(): AgentTeamsSettings
  migrationStatus(): { migrationVersion: number; complete: boolean }
}

export function createAgentTeamsSettingsRuntime(
  ctx: Context,
  base: Partial<AgentTeamsSettings>,
  legacy: LegacyDesktopAgentTeamsSettings | undefined,
): AgentTeamsSettingsRuntime {
  let current = normalizeAgentTeamsSettings(base)
  ctx.inject(['settings'], (settingsCtx) => {
    const scope: SettingsScope<AgentTeamsSettings> = settingsCtx.settings.register(
      AGENT_TEAMS_SETTINGS_NAMESPACE,
      AgentTeamsSettingsSchema,
      { base: current, applies: 'live', validate: validateAgentTeamsSettings },
    )
    current = normalizeAgentTeamsSettings(scope.get())
    ctx.effect(() => scope?.watch((next) => {
      current = normalizeAgentTeamsSettings(next)
    }) ?? (() => undefined), 'agent-teams: settings watch')
    if (legacy !== undefined && current.migrationVersion < AGENT_TEAMS_MIGRATION_VERSION) {
      const effort = legacy.reasoningEffort?.trim() ?? ''
      void scope.update({
        memberLlmProvider: legacy.provider?.trim() ?? '',
        memberModel: legacy.model?.trim() ?? '',
        memberReasoningMode: effort === '' ? 'target-default' : 'explicit',
        memberReasoningEffort: effort,
        migrationVersion: AGENT_TEAMS_MIGRATION_VERSION,
      }).then(() => {
        current = normalizeAgentTeamsSettings(scope.get())
      }).catch((error: unknown) => {
        ctx.logger.warn(`agent-teams: legacy settings migration failed: ${String(error)}`)
      })
    }
  })
  return {
    get: () => current,
    migrationStatus: () => ({
      migrationVersion: current.migrationVersion,
      complete: current.migrationVersion >= AGENT_TEAMS_MIGRATION_VERSION,
    }),
  }
}
