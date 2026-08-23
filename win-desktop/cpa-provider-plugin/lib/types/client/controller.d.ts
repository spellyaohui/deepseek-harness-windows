import type { IApiClient } from '@deepseek-ai/dsh-api-remotes/client';
import type { CpaDraft, CpaModelCandidate } from '../types.ts';
type CpaApi = Pick<IApiClient, 'llm' | 'settings' | 'credentials'>;
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
/** Create one card-scoped controller. A credential retry retains profile commit state. */
export declare function createCpaController(api: CpaApi, options?: CpaControllerOptions): {
    discover(draft: Pick<CpaDraft, "baseURL" | "token">): Promise<CpaModelCandidate[]>;
    save(draft: CpaDraft, expectedRevision: number): Promise<CpaSaveResult>;
};
export {};
