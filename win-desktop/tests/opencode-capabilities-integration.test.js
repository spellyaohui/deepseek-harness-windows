import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import yaml from 'js-yaml'
import { generateAgentTeamsPatch } from '../src/dsh-service.js'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('Models settings mount the local OpenCode capability validation action through a narrow IPC bridge', () => {
  const packageJson = JSON.parse(read('package.json'))
  const patch = yaml.load(read('config/agent-teams.patch.yml')).flatMap(entry => entry.insert ?? [])
  const pluginRoot = new URL('../opencode-capabilities-plugin/', import.meta.url)

  assert.equal(packageJson.version, '0.1.1-rc.20')
  assert.equal(packageJson.dependencies['@deepseek-ai/dsh-opencode-capabilities'], 'file:opencode-capabilities-plugin')
  assert.equal(existsSync(pluginRoot), true)
  assert.equal(JSON.parse(read('opencode-capabilities-plugin/package.json')).version, '0.1.1')
  assert.deepEqual(patch.find(entry => entry.id === 'opencode-capabilities'), {
    id: 'opencode-capabilities',
    name: '@deepseek-ai/dsh-opencode-capabilities',
  })

  let generatedPatch
  generateAgentTeamsPatch({
    getSettings: () => ({}),
    getUserDataPath: () => 'unused',
    makeDir: () => {},
    writeFile: (_path, content) => { generatedPatch = content },
  })
  const generated = yaml.load(generatedPatch).flatMap(entry => entry.insert ?? [])
  assert.deepEqual(generated.find(entry => entry.id === 'opencode-capabilities'), {
    id: 'opencode-capabilities',
    name: '@deepseek-ai/dsh-opencode-capabilities',
  })

  const client = read('opencode-capabilities-plugin/lib/client.js')
  assert.match(client, /settings\.models\.card/)
  assert.match(client, /validateOpencodeCapabilities/)
  assert.match(client, /重启/)
  assert.doesNotMatch(client, /settings\.section/)

  const preload = read('src/preload.cjs')
  assert.match(preload, /validateOpencodeCapabilities/)
  assert.match(preload, /opencode-capabilities:validate/)

  const ipc = read('src/settings-window.js')
  assert.match(ipc, /opencode-capabilities:validate/)
  assert.match(ipc, /validateOpencodeCatalog/)
  assert.doesNotMatch(ipc, /settings\.yaml/)
  assert.doesNotMatch(ipc, /credentials/)
})

test('OpenCode capability browser entry uses the loader factory return contract', () => {
  const client = read('opencode-capabilities-plugin/lib/client.js')
  let definition
  const context = {
    window: {
      __ModuleLoader__: {
        load: (entry) => { definition = entry },
      },
    },
  }

  vm.runInNewContext(client, context)
  const plugin = definition.factory((name) => {
    if (name === 'react') return {
      createElement: () => null,
      useEffect: () => {},
      useState: () => [false, () => {}],
    }
    throw new Error(`Unexpected dependency: ${name}`)
  })

  assert.deepEqual(Array.from(plugin.inject), ['slots'])
  assert.equal(typeof plugin.apply, 'function')
})
