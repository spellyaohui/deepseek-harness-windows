import type { IApiClient, SettingsPathOpView } from '@deepseek-ai/dsh-client-connection/client';
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client';
import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { AgentTeamsSettings, DelegationMode, MemberReasoningMode } from '../settings.ts';
import type { ModelCatalogEntry } from './model-catalog.ts';
export type SettingsWriteState = {
    status: 'ready';
    error: null;
} | {
    status: 'error';
    error: string;
};
export type SettingsWriteView = {
    status: 'idle';
    ops: null;
    error: null;
} | {
    status: 'busy';
    ops: readonly SettingsPathOpView[];
    error: null;
} | {
    status: 'error';
    ops: readonly SettingsPathOpView[] | null;
    error: string;
};
export type SettingsPlanError = 'model-unavailable' | 'no-efforts' | 'no-models' | 'unsupported-effort';
export type SettingsWritePlan = {
    ok: true;
    ops: readonly SettingsPathOpView[];
} | {
    ok: false;
    error: SettingsPlanError;
};
type SettingsApi = Pick<IApiClient, 'settings'>;
type SettingsReadScope = Pick<SettingsScope<AgentTeamsSettings>, 'getSnapshot'>;
export interface AgentTeamsSettingsWriter {
    write(ops: readonly SettingsPathOpView[]): Promise<SettingsWriteState>;
}
interface WriterOptions {
    api: SettingsApi;
    scope: SettingsReadScope;
    describe: Pick<SettingsDescribeFace, 'acceptView'>;
    timeoutMs?: number;
}
export declare function createAgentTeamsSettingsWriter(options: WriterOptions): AgentTeamsSettingsWriter;
export declare function planDelegationModeChange(mode: DelegationMode): SettingsWritePlan;
export declare function planProviderChange(settings: AgentTeamsSettings, provider: string, catalog: readonly ModelCatalogEntry[]): SettingsWritePlan;
export declare function planModelChange(settings: AgentTeamsSettings, provider: string, modelId: string, catalog: readonly ModelCatalogEntry[]): SettingsWritePlan;
export declare function planReasoningModeChange(settings: AgentTeamsSettings, mode: MemberReasoningMode, model: ModelCatalogEntry | undefined): SettingsWritePlan;
export declare function planReasoningEffortChange(effort: string, model: ModelCatalogEntry | undefined): SettingsWritePlan;
export declare function runAgentTeamsSettingsAction(writer: AgentTeamsSettingsWriter, ops: readonly SettingsPathOpView[], publish: (state: SettingsWriteView) => void): Promise<SettingsWriteState>;
export {};
