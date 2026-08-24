export function normalizeProviderProfile(provider, value, normalize) {
    return normalize?.(provider, value) ?? { ok: true, value };
}
