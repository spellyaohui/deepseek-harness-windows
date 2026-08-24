import { normalizeCpaProviderProfile } from "../profile.js";
export function apply(ctx) {
    ctx.on('settings.models/normalize-provider-profile', (payload, next) => {
        if (payload.provider !== 'cpa')
            return next();
        try {
            payload.value = normalizeCpaProviderProfile(payload.value);
            return next();
        }
        catch (error) {
            payload.failure = error instanceof Error ? error.message : String(error);
            return payload;
        }
    });
}
