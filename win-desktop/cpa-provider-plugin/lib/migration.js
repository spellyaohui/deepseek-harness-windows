import { deepEqualJson } from '@deepseek-ai/dsh-settings';
import { normalizeCpaProviderProfile } from "./profile.js";
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Build the one path-scoped write needed to upgrade a legacy persisted CPA profile. */
export function cpaProfileMigration(descriptor) {
    if (descriptor.ns !== 'llm-pi-ai' || !isRecord(descriptor.user))
        return undefined;
    const providers = descriptor.user['providers'];
    if (!isRecord(providers))
        return undefined;
    const current = providers['cpa'];
    if (!isRecord(current))
        return undefined;
    const normalized = normalizeCpaProviderProfile(current);
    if (deepEqualJson(current, normalized))
        return undefined;
    return {
        expectedRevision: descriptor.revision,
        ops: [{ op: 'set', path: ['providers', 'cpa'], value: normalized }],
    };
}
