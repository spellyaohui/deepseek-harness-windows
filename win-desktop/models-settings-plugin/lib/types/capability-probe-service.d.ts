import type { ModelCapabilityProbeResult } from './capability-contract.ts';
export interface CapabilityProbeRequest {
    modelId: string;
    protocol: string;
    baseURL: string;
    credentialRef?: string;
    apiKey?: string;
    candidate?: Record<string, unknown>;
    signal?: AbortSignal;
}
export interface ProbeHttpResponse {
    status: number;
    ok: boolean;
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
    body?: unknown;
}
export type ProbeFetch = (url: string, init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
}) => Promise<ProbeHttpResponse>;
export interface CapabilityProbeDependencies {
    fetch?: ProbeFetch;
    resolveCredential?: (reference: string) => Promise<string | undefined> | string | undefined;
}
/** Execute the bounded, provider-neutral capability matrix for one model. */
export declare function probeModelCapabilities(request: CapabilityProbeRequest, dependencies?: CapabilityProbeDependencies): Promise<ModelCapabilityProbeResult>;
