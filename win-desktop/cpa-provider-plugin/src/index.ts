import type { Context } from '@deepseek-ai/cordis'
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings'

import { cpaProfileMigration } from './migration.ts'

export const name = 'cpa-provider'

const LLM_PI_AI_SETTINGS = 'llm-pi-ai' as SettingsNamespace

/** CPA delegates all model traffic to the existing llm-pi-ai adapter. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], async (settingsCtx) => {
    // Yield once so llm-pi-ai can register its namespace when both consumers
    // attach to an already-running settings service during profile startup.
    await Promise.resolve()
    try {
      const descriptor = settingsCtx.settings.describe()
        .find(entry => String(entry.ns) === LLM_PI_AI_SETTINGS)
      if (descriptor === undefined) {
        ctx.logger.warn('cpa-provider: llm-pi-ai settings namespace is unavailable; legacy profile migration skipped')
        return
      }
      const migration = cpaProfileMigration(descriptor)
      if (migration === undefined) return
      await settingsCtx.settings.mutate(LLM_PI_AI_SETTINGS, migration.ops, migration.expectedRevision)
      ctx.logger.info('cpa-provider: upgraded the persisted CPA profile with current input capabilities')
    } catch (error) {
      ctx.logger.warn(`cpa-provider: legacy profile migration failed: ${String(error)}`)
    }
  })
}
