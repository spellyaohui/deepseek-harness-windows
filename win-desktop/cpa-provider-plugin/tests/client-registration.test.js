import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('CPA browser plugin normalizes the native Models provider editor', () => {
  const source = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  const bundleConfig = readFileSync(new URL('../tsdown.config.ts', import.meta.url), 'utf8')
  assert.match(source, /normalize-provider-profile/)
  assert.match(source, /provider !== 'cpa'/)
  assert.match(source, /import type \{ Context \} from '@deepseek-ai\/cordis'/)
  assert.doesNotMatch(source, /dsh-client-runtime/)
  assert.doesNotMatch(packageJson, /dsh-client-runtime/)
  assert.doesNotMatch(bundleConfig, /dsh-client-runtime/)
  assert.doesNotMatch(source, /settings\.models\.card/)
  assert.doesNotMatch(source, /id:\s*'cpa'/)
})
