import { CpaProviderCard } from "./CpaProviderCard.js";
import { en, zh } from "./locales.js";
const NS = 'settings.cpa';
const CARD_NAME = 'CPA / CLIProxyAPI';
export const inject = ['slots', 'locale'];
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'cpa-provider: locale');
    const cpaT = ctx.locale.bind(NS);
    ctx.slots.inject('settings.models.card', () => ctx.slots.register({
        name: 'settings.models.card',
        id: 'cpa',
        order: -100,
        inject: () => ({ cpaT, cardName: CARD_NAME }),
    }, CpaProviderCard));
}
