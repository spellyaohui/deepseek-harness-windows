import type { ModelsSettingsState } from '@deepseek-ai/dsh-client-ui-settings-models/client';
import type { CpaModelCandidate } from '../types.ts';
export interface CpaSettingsView {
    status: ModelsSettingsState['status'];
    writable: boolean;
    revision: number | undefined;
    baseURL: string;
    models: CpaModelCandidate[];
    credentialConfigured: boolean;
}
/** Project the redacted shared Models snapshot into CPA card state. */
export declare function cpaSettingsView(state: ModelsSettingsState): CpaSettingsView;
