import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
interface ProviderProfileNormalizationPayload {
    provider: string;
    value: Record<string, unknown>;
    failure?: string;
}
declare module '@deepseek-ai/cordis' {
    interface Events {
        'settings.models/normalize-provider-profile'(payload: ProviderProfileNormalizationPayload, next: () => ProviderProfileNormalizationPayload): ProviderProfileNormalizationPayload;
    }
}
export declare function apply(ctx: ClientContext): void;
export {};
