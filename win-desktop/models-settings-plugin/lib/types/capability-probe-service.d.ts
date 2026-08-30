import type { ModelCapabilityProbeResult } from './capability-contract.ts';
import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
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
export interface CapabilityProbeHandlerDependencies extends CapabilityProbeDependencies {
    resolveCredential?: (reference: string) => Promise<string | undefined> | string | undefined;
}
/** Execute the bounded, provider-neutral capability matrix for one model. */
export declare function probeModelCapabilities(request: CapabilityProbeRequest, dependencies?: CapabilityProbeDependencies): Promise<ModelCapabilityProbeResult>;
/** Build the Host handler so credential lookup stays injectable and testable. */
export declare function createCapabilityProbeHandler(dependencies?: CapabilityProbeHandlerDependencies): (request: CapabilityProbeRequest, signal?: AbortSignal) => Promise<ModelCapabilityProbeResult>;
/** Host service exposing the one provider-neutral probe method to the Models page. */
export declare class ModelCapabilityProbeService extends TypertRemoteService {
    static inject: string[];
    constructor(ctx: Context);
    probe(request: CapabilityProbeRequest, signal: AbortSignal): Promise<ModelCapabilityProbeResult>;
}
