import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const editor = readFileSync(new URL('../src/client/ModelListEditor.tsx', import.meta.url), 'utf8')
const providerEditor = readFileSync(new URL('../src/client/ProviderEditor.tsx', import.meta.url), 'utf8')
const modelsSection = readFileSync(new URL('../src/client/ModelsSection.tsx', import.meta.url), 'utf8')
const locales = readFileSync(new URL('../src/client/locales.ts', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/client/ModelsSection.module.css', import.meta.url), 'utf8')

test('model editor exposes draft-only per-model capability probing controls', () => {
  assert.match(editor, /applyCapabilityProbeResult/)
  assert.match(editor, /modelCapabilities/)
  assert.match(editor, /AbortController/)
  assert.match(editor, /probeSelected|selected.*model/i)
  assert.match(editor, /overwriteExisting/)
  assert.match(editor, /probeCancel|cancelProbe/i)
  assert.match(editor, /onChange\(/)
  assert.doesNotMatch(editor, /api\.settings\.mutate/)
})

test('provider and section pass the mounted Remote probe without provider-specific branches', () => {
  assert.match(providerEditor, /modelCapabilities/)
  assert.match(editor, /modelCapabilities\.probe/)
  assert.match(modelsSection, /modelCapabilities|probeRemote/)
  assert.doesNotMatch(editor, /woyaopro|opencode|commandcode|cpa/i)
  assert.doesNotMatch(providerEditor, /woyaopro|opencode|commandcode|cpa/i)
})

test('capability UI has localized labels and recognizable status styles', () => {
  for (const key of [
    'capabilityTitle',
    'capabilitySelectAll',
    'capabilityProbe',
    'capabilityCancel',
    'capabilityOverwrite',
    'capabilitySupported',
    'capabilityUnsupported',
    'capabilityInconclusive',
    'capabilityNotApplicable',
  ]) assert.match(locales, new RegExp(`${key}:`))
  assert.match(styles, /capabilityProbe|capabilityStatus|capabilitySelection/)
})
