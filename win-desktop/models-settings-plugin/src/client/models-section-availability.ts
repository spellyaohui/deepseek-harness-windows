import type { ModelCapabilityProbeRemote } from '../remote.ts'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

const REQUIRED_DEPENDENCIES = [
  'controller',
  'useSnapshot',
  'api',
  'schema',
  't',
  'renderSlot',
  'normalizeProviderProfile',
] as const

type RequiredDependency = typeof REQUIRED_DEPENDENCIES[number]
type WithPresentDependencies<T extends Partial<Record<RequiredDependency, unknown>>> = T & {
  [Key in RequiredDependency]-?: Exclude<T[Key], undefined>
}

/**
 * The capability probe is intentionally not a page dependency: its Remote can
 * mount after the settings slot renders, and model editing must still work.
 */
export function modelsSectionDependenciesReady<
  T extends Partial<Record<RequiredDependency, unknown>>,
>(value: T): value is WithPresentDependencies<T> {
  return REQUIRED_DEPENDENCIES.every(key => value[key] !== undefined)
}

/**
 * Keep the slot injection stable while resolving the asynchronously mounted
 * Remote at the moment the user actually starts a probe.
 */
export function createLateBoundCapabilityRemote(
  resolve: () => ModelCapabilityProbeRemote | undefined,
  unavailableMessage: () => string,
): ModelCapabilityProbeRemote {
  return {
    async probe(request, signal) {
      const remote = resolve()
      if (remote === undefined) throw new Error(unavailableMessage())
      return remote.probe(request, signal)
    },
  }
}

/** Resolve the optional namespace service without Cordis property injection. */
export function resolveCapabilityRemote(
  ctx: Pick<ClientContext, 'get'>,
): ModelCapabilityProbeRemote | undefined {
  return ctx.get('remote.model-capabilities') as ModelCapabilityProbeRemote | undefined
}
