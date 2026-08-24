/** Provider-specific profile normalization owned by an adapter plugin. */
export type ProviderProfileDraft = Record<string, unknown>

export interface ProviderProfileNormalizationPayload {
  provider: string
  value: ProviderProfileDraft
  failure?: string
}

export type ProviderProfileNormalization =
  | { ok: true; value: ProviderProfileDraft }
  | { ok: false; message: string }

export type ProviderProfileNormalizer = (
  provider: string,
  value: ProviderProfileDraft,
) => ProviderProfileNormalization

declare module '@deepseek-ai/cordis' {
  interface Events {
    'settings.models/normalize-provider-profile'(
      payload: ProviderProfileNormalizationPayload,
      next: () => ProviderProfileNormalizationPayload,
    ): ProviderProfileNormalizationPayload
  }
}

export function normalizeProviderProfile(
  provider: string,
  value: ProviderProfileDraft,
  normalize?: ProviderProfileNormalizer,
): ProviderProfileNormalization {
  return normalize?.(provider, value) ?? { ok: true, value }
}
