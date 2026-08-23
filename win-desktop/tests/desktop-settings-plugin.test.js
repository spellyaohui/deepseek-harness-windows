import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import yaml from 'js-yaml'
import { readFileSync as readText } from 'node:fs'

const clientSource = readFileSync(new URL('../desktop-settings-plugin/lib/client.js', import.meta.url), 'utf8')
const patchSource = readFileSync(new URL('../config/agent-teams.patch.yml', import.meta.url), 'utf8')
const serviceSource = readText(new URL('../src/dsh-service.js', import.meta.url), 'utf8')

test('desktop settings client registers a native settings section', () => {
  assert.match(clientSource, /id: 'desktop'/)
  assert.match(clientSource, /name: 'settings\.section'/)
  assert.match(clientSource, /ctx\.slots\.inject\('settings\.section'/)
  assert.match(clientSource, /window\.dshDesktop\.fetchModels|bridge\.fetchModels/)
})

test('desktop settings plugin is included in the DSH patch graph', () => {
  const entries = yaml.load(patchSource)
    .flatMap((patch) => patch.insert ?? [])
  assert.ok(entries.some((entry) => entry.name === '@deepseek-ai/dsh-desktop-settings'))
})

test('runtime-generated patch also includes the desktop settings plugin', () => {
  assert.match(serviceSource, /id: desktop-settings/)
  assert.match(serviceSource, /@deepseek-ai\/dsh-desktop-settings/)
})
