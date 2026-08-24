import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('CPA browser plugin registers a dedicated Models card', () => {
  const source = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  const card = readFileSync(new URL('../src/client/CpaProviderCard.tsx', import.meta.url), 'utf8')
  const locales = readFileSync(new URL('../src/client/locales.ts', import.meta.url), 'utf8')
  assert.match(source, /name:\s*'settings\.models\.card'/)
  assert.match(source, /id:\s*'cpa'/)
  assert.match(source, /CPA \/ CLIProxyAPI/)
  assert.match(card, /applyCapacityDrafts/)
  assert.match(card, /inputMode="numeric"/)
  assert.match(card, /contextWindow/)
  assert.match(card, /maxTokens/)
  assert.match(locales, /modelContextWindow/)
  assert.match(locales, /modelMaxTokens/)
  assert.match(locales, /capacityInvalid/)
})
