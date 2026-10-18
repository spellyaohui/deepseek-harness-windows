import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('native provider saves have no CPA normalization extension or provider-specific rules', () => {
  for (const file of ['index.ts', 'ModelsSection.tsx', 'ProviderEditor.tsx', 'CustomProviderCard.tsx', 'DeepSeekOnboardingDialog.tsx']) {
    const source = readFileSync(new URL('../src/client/' + file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /normalizeProviderProfile|ProviderProfileNormalizer|normalize-provider-profile/)
    assert.doesNotMatch(source, /CPA_API_KEY|provider === 'cpa'/)
  }
})
