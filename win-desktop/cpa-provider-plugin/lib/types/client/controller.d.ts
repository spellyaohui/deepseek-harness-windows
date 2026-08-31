import type { LlmDiscoveredModel, LlmModelDiscoveryRequest, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client';
import type { CpaDraft, CpaModelCandidate } from '../types.ts';
type RemoteResult<Value> = {
    readonly ok: true;
    readonly value: Value;
} | {
    readonly ok: false;
    readonly error: {
        readonly code: string;
        readonly message: string;
    };
};
interface CpaApi {
    readonly llm: {
        discoverModels(settingsNs: string, request: LlmModelDiscoveryRequest, signal?: AbortSignal): Promise<RemoteResult<LlmDiscoveredModel[]>>;
    };
    readonly settings: {
        mutate(ns: string, ops: SettingsPathOpView[], expectedRevision: number | undefined): Promise<RemoteResult<unknown>>;
    };
    readonly credentials: {
        set(ref: string, value: string): Promise<RemoteResult<void>>;
    };
}
export type CpaSaveResult = {
    ok: true;
} | {
    ok: false;
    stage: 'profile' | 'credential';
    message: string;
};
export interface CpaControllerOptions {
    timeoutMs?: number;
    setTimeoutFn?: typeof setTimeout;
    clearTimeoutFn?: typeof clearTimeout;
}
export declare function createCpaController(api: CpaApi, options?: CpaControllerOptions): {
    discover(draft: Pick<CpaDraft, "baseURL" | "token">): Promise<CpaModelCandidate[]>;
    save(draft: CpaDraft, expectedRevision: number, onStage?: (stage: "profile" | "credential") => void): Promise<CpaSaveResult>;
};
export {};
