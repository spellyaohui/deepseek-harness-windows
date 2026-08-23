import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type CpaLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'settings.cpa': CpaLocaleKey;
    }
}
export type CpaProviderCardProps = PropsRuntime<'settings.models.card'> & {
    cpaT: (key: CpaLocaleKey) => string;
    cardName: 'CPA / CLIProxyAPI';
};
export declare const inject: string[];
export declare function apply(ctx: ClientContext): void;
