import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/client/index.ts', import.meta.url), 'utf8')
const section = readFileSync(new URL('../src/client/ModelsSection.tsx', import.meta.url), 'utf8')

test('Models section owns and renders the provider-card extension slot', () => {
  assert.match(source, /'settings\.models\.card'/)
  assert.match(source, /children:[\s\S]*settings\.models\.card/)
  assert.match(section, /renderSlot\('settings\.models\.card'/)
})
