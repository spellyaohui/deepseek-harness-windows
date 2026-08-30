import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import type { CapabilityProbeRequest } from './capability-probe-service.ts'
import type { ModelCapabilityProbeResult } from './capability-contract.ts'

function plainRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('model capability Remote expects a plain object')
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`model capability Remote field ${field} must be a non-empty string`)
  }
  return value
}

function strictKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`model capability Remote field ${key} is not allowed`)
  }
}

/** Small strict codecs keep the client bundle free of a second schema runtime. */
const capabilityProbeRequestSchema = {
  parse(value: unknown): CapabilityProbeRequest {
    const record = plainRecord(value)
    strictKeys(record, new Set(['modelId', 'protocol', 'baseURL', 'credentialRef', 'apiKey', 'candidate']))
    const candidate = record['candidate']
    if (candidate !== undefined) plainRecord(candidate)
    return {
      modelId: requiredString(record['modelId'], 'modelId'),
      protocol: requiredString(record['protocol'], 'protocol'),
      baseURL: requiredString(record['baseURL'], 'baseURL'),
      ...record['credentialRef'] === undefined ? {} : { credentialRef: requiredString(record['credentialRef'], 'credentialRef') },
      ...record['apiKey'] === undefined ? {} : { apiKey: requiredString(record['apiKey'], 'apiKey') },
      ...candidate === undefined ? {} : { candidate: candidate as Record<string, unknown> },
    }
  },
}

const capabilityProbeResultSchema = {
  parse(value: unknown): ModelCapabilityProbeResult {
    const record = plainRecord(value)
    strictKeys(record, new Set(['modelId', 'protocol', 'checks', 'patch']))
    return {
      modelId: requiredString(record['modelId'], 'modelId'),
      protocol: requiredString(record['protocol'], 'protocol'),
      checks: plainRecord(record['checks']) as ModelCapabilityProbeResult['checks'],
      patch: plainRecord(record['patch']) as ModelCapabilityProbeResult['patch'],
    }
  },
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespace$6d6f64656c2d6361706162696c6974696573 {
    probe: (request: CapabilityProbeRequest, signal?: AbortSignal) => Promise<RemoteResult<ModelCapabilityProbeResult>>
  }

  interface TypertRemoteMap {
    'model-capabilities/probe': (
      request: CapabilityProbeRequest,
      signal?: AbortSignal,
    ) => Promise<RemoteResult<ModelCapabilityProbeResult>>
  }

  interface TypertRemoteNamespaceMap {
    'model-capabilities': TypertRemoteNamespace$6d6f64656c2d6361706162696c6974696573
  }
}

/** Client-selected descriptor for the Host capability probe service. */
export const TYPERT_REMOTE = {
  package: '@deepseek-ai/dsh-client-ui-settings-models',
  descriptors: [{
    id: '@deepseek-ai/dsh-client-ui-settings-models#model-capabilities/probe',
    service: 'modelCapabilityProbe',
    namespace: 'model-capabilities',
    method: 'probe',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'request',
      wire: 'request',
      source: 'json',
      codec: {
        mode: 'strict',
        typeSymbol: '@deepseek-ai/dsh-client-ui-settings-models#CapabilityProbeRequest',
        schema: capabilityProbeRequestSchema,
      },
    }],
    cancellation: { parameter: 'signal' },
    result: {
      mode: 'strict',
      typeSymbol: '@deepseek-ai/dsh-client-ui-settings-models#ModelCapabilityProbeResult',
      schema: capabilityProbeResultSchema,
    },
    sourceLocation: {
      file: 'win-desktop/models-settings-plugin/src/capability-probe-service.ts',
      line: 1,
      column: 1,
    },
  }],
} as unknown as TypertRemoteContribution

export default TYPERT_REMOTE
