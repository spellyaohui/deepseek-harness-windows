import type { Context } from '@deepseek-ai/cordis';
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
export declare function apply(ctx: Context): void;
export {};
