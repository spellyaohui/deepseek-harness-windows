import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import type { CapabilityProbeRequest } from './types/capability-probe-service.d.ts';
import type { ModelCapabilityProbeResult } from './types/capability-contract.d.ts';
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertRemoteNamespace$6d6f64656c2d6361706162696c6974696573 {
        probe: (request: CapabilityProbeRequest, signal?: AbortSignal) => Promise<RemoteResult<ModelCapabilityProbeResult>>;
    }
    interface TypertRemoteMap {
        'model-capabilities/probe': (request: CapabilityProbeRequest, signal?: AbortSignal) => Promise<RemoteResult<ModelCapabilityProbeResult>>;
    }
    interface TypertRemoteNamespaceMap {
        'model-capabilities': TypertRemoteNamespace$6d6f64656c2d6361706162696c6974696573;
    }
}
/** Client-selected descriptor for the Host capability probe service. */
export declare const TYPERT_REMOTE: TypertRemoteContribution;
export default TYPERT_REMOTE;
