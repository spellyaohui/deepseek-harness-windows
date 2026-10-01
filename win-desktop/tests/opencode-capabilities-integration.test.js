import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import yaml from 'js-yaml'
import { generateAgentTeamsPatch } from '../src/dsh-service.js'
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8')
test('retired OpenCode capability module is absent from dependencies, patches and IPC', () => {
  const manifest = JSON.parse(read('package.json'))
  const lock = JSON.parse(read('package-lock.json'))
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-opencode-capabilities'], undefined)
  assert.equal(lock.packages['node_modules/@deepseek-ai/dsh-opencode-capabilities'], undefined)
  let generated
  generateAgentTeamsPatch({ getSettings: () => ({}), getUserDataPath: () => 'unused', makeDir: () => {}, writeFile: (_path,content) => { generated=content } })
  for(const text of [read('config/agent-teams.patch.yml'),generated]) assert.equal(yaml.load(text).flatMap(entry => entry.insert ?? []).some(entry => entry.id === 'opencode-capabilities'), false)
  for(const file of ['src/preload.cjs','src/settings-window.js','scripts/sync-local-plugin-artifacts.mjs']) assert.doesNotMatch(read(file), /opencode-capabilities|validateOpencodeCapabilities/)
  assert.match(read('src/win-hide-console-rewrite.js'), /supportsStrictMode/)
})
