import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'
import { validateMemberRolePolicy, type MemberRolePolicy } from './selection-policy.ts'

export type DelegationMode = 'teams' | 'native'

export interface AgentTeamsSettings {
  delegationMode: DelegationMode
  /** Only Team-mode native subagent compatibility calls use this policy. */
  temporaryMember?: MemberRolePolicy
}

// Alpha.2 validates the namespace at the SettingsProvider boundary and no
// longer exports the rc.2 settingsNamespace constructor.
export const AGENT_TEAMS_SETTINGS_NAMESPACE = 'agent-teams' as SettingsNamespace

export const DEFAULT_AGENT_TEAMS_SETTINGS: AgentTeamsSettings = {
  delegationMode: 'teams',
}

export function normalizeTemporaryMember(input: MemberRolePolicy): MemberRolePolicy {
  validateMemberRolePolicy(input)
  return {
    reasoningMode: input.reasoningMode,
    ...(input.provider?.trim() ? { provider: input.provider.trim(), model: input.model!.trim() } : {}),
    ...(input.reasoningMode === 'explicit' ? { reasoningEffort: input.reasoningEffort!.trim() } : {}),
  }
}

// Optional objects have an implicit {} default in Schemastery. Absence must
// stay absent so existing Profile role-inheritance behavior is unchanged.
// The form schema crosses JSON into the browser. Declarative branches preserve
// policy validation there without a transform callback's module-local closure.
export const TemporaryMemberSchema = z.union([
  z.object({
    provider: z.const(undefined), model: z.const(undefined),
    reasoningMode: z.union(['target-default', 'route-aware']).required(),
    reasoningEffort: z.const(undefined),
  }),
  z.object({
    provider: z.string().pattern(/\S/u).required(),
    model: z.string().pattern(/\S/u).required(),
    reasoningMode: z.union(['target-default', 'route-aware']).required(),
    reasoningEffort: z.const(undefined),
  }),
  z.object({
    provider: z.string().pattern(/\S/u).required(),
    model: z.string().pattern(/\S/u).required(),
    reasoningMode: z.const('explicit').required(),
    reasoningEffort: z.string().pattern(/\S/u).required(),
  }),
  z.const(undefined),
]) as z<MemberRolePolicy | undefined>

export const AgentTeamsSettingsSchema: z<AgentTeamsSettings> = z.object({
  delegationMode: z.union(['teams', 'native']).default('teams'),
  temporaryMember: TemporaryMemberSchema,
})

export function normalizeAgentTeamsSettings(input: Partial<AgentTeamsSettings>): AgentTeamsSettings {
  return {
    delegationMode: input.delegationMode ?? 'teams',
    ...(input.temporaryMember === undefined ? {} : { temporaryMember: normalizeTemporaryMember(input.temporaryMember) }),
  }
}

export interface AgentTeamsSettingsRuntime {
  get(): AgentTeamsSettings
}

export function createAgentTeamsSettingsRuntime(
  ctx: Context,
  delegationMode: Volatile<DelegationMode> | undefined,
  temporaryMember?: Volatile<MemberRolePolicy | undefined>,
): AgentTeamsSettingsRuntime {
  ctx.inject(['settings'], (settingsCtx) => {
    // The v0.1.7 settings service projects volatile Config fields itself.
    // Keep the bespoke Team/Native page as the only AgentTeams editor.
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
  return {
    get: () => normalizeAgentTeamsSettings({ delegationMode: delegationMode?.get(), temporaryMember: temporaryMember?.get() }),
  }
}
