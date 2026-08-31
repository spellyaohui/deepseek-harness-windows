import type { SettingsDescribeValue, SettingsNamespaceView, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client';
import type { SettingsDescribeFace, SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { AgentTeamsSettings, DelegationMode } from '../settings.ts';
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
export type SettingsWritePlan = {
    ok: true;
    ops: readonly SettingsPathOpView[];
};
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
export interface SettingsApi {
    readonly settings: {
        mutate(ns: string, ops: SettingsPathOpView[], expectedRevision: number | undefined): Promise<RemoteResult<SettingsNamespaceView>>;
        describe(): Promise<RemoteResult<SettingsDescribeValue>>;
    };
}
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
export declare function runAgentTeamsSettingsAction(writer: AgentTeamsSettingsWriter, ops: readonly SettingsPathOpView[], publish: (state: SettingsWriteView) => void): Promise<SettingsWriteState>;
export {};
