import { deepEqualJson } from '@deepseek-ai/dsh-util-values'

import { normalizeCpaProviderProfile } from './profile.ts'

type UnknownRecord = Record<string, unknown>

export interface SettingsDescriptorLike {
  ns: string
  revision: number
  user?: unknown
}

export interface CpaProfileMigration {
  expectedRevision: number
  ops: readonly [{
    op: 'set'
    path: readonly ['providers', 'cpa']
    value: UnknownRecord
  }]
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasCurrentCpaDefaultInput(value: unknown): boolean {
  return Array.isArray(value)
    && value.length === 2
    && value.includes('text')
    && value.includes('image')
}

function materializeLegacyModelInputs(value: UnknownRecord): UnknownRecord {
  const rawModels = value['models']
  if (!Array.isArray(rawModels)) return value
  return {
    ...value,
    models: rawModels.map((rawModel) => {
      if (!isRecord(rawModel)) return rawModel
      const input = rawModel['input']
      // Only the legacy absence/empty shape is safe to materialize. Explicit
      // values, including malformed ones, must survive for normal validation.
      if (input !== undefined && (!Array.isArray(input) || input.length > 0)) return rawModel
      return { ...rawModel, input: ['text', 'image'] }
    }),
  }
}

/** Build the one path-scoped write needed to upgrade a legacy persisted CPA profile. */
export function cpaProfileMigration(descriptor: SettingsDescriptorLike): CpaProfileMigration | undefined {
  if (descriptor.ns !== 'llm-pi-ai' || !isRecord(descriptor.user)) return undefined
  const providers = descriptor.user['providers']
  if (!isRecord(providers)) return undefined
  const current = providers['cpa']
  if (!isRecord(current)) return undefined

  const hadCurrentDefaultInput = hasCurrentCpaDefaultInput(current['defaultInput'])
  const normalizedProfile = normalizeCpaProviderProfile(current)
  const normalized = hadCurrentDefaultInput
    ? normalizedProfile
    : materializeLegacyModelInputs(normalizedProfile)
  if (deepEqualJson(current, normalized)) return undefined
  return {
    expectedRevision: descriptor.revision,
    ops: [{ op: 'set', path: ['providers', 'cpa'], value: normalized }],
  }
}
