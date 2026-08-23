import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import yaml from 'js-yaml'
import { generateAgentTeamsPatch } from '../src/dsh-service.js'
import { buildHostModelCatalog } from '../agent-teams-plugin/lib/index.js'

const wrapperRoot = fileURLToPath(new URL('..', import.meta.url))
const pluginRoot = join(wrapperRoot, 'node_modules', '@nanmicoder', 'dsh-agent-teams')
const desktopPluginRoot = join(wrapperRoot, 'desktop-settings-plugin')
const consoleHideImport = new URL('../src/win-hide-console.mjs', import.meta.url).href

function readText(...segments) {
  return readFileSync(join(...segments), 'utf8')
}

test('installed AgentTeams fork remains runnable through the desktop patch and console-hide loader', () => {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-agent-teams-integration-'))
  try {
    const patchPath = generateAgentTeamsPatch({
      getSettings: () => ({
        agentTeamsMemberProvider: 'openai-compatible',
        agentTeamsMemberModel: 'example-model',
        agentTeamsMemberReasoningEffort: 'high',
      }),
      getUserDataPath: () => userData,
    })
    const patch = yaml.load(readFileSync(patchPath, 'utf8'))
    const entries = patch.flatMap((item) => item.insert ?? [])
    const agentTeams = entries.find((entry) => entry.id === 'agent-teams')
    assert.deepEqual(agentTeams, {
      id: 'agent-teams',
      name: '@nanmicoder/dsh-agent-teams',
      config: {
        stateDir: '.agent-teams',
        memberProvider: 'spawn',
        legacyDesktopSettings: {
          provider: 'openai-compatible',
          model: 'example-model',
          reasoningEffort: 'high',
        },
      },
    })

    const metadata = JSON.parse(readText(pluginRoot, 'package.json'))
    assert.equal(metadata.name, '@nanmicoder/dsh-agent-teams')
    assert.equal(metadata.version, '0.1.13-desktop.1')
    assert.equal(metadata.exports['./client'].default, './lib/client.js')

    const imported = spawnSync(process.execPath, [
      '--import', consoleHideImport,
      '--input-type=module',
      '--eval', "const plugin = await import('@nanmicoder/dsh-agent-teams'); console.log(JSON.stringify({ name: plugin.name, exports: Object.keys(plugin).sort() }))",
    ], {
      cwd: wrapperRoot,
      encoding: 'utf8',
    })
    assert.equal(imported.status, 0, imported.stderr)
    assert.deepEqual(JSON.parse(imported.stdout), {
      name: 'agent-teams',
      exports: ['Config', 'apply', 'inject', 'name'],
    })
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

test('built AgentTeams artifacts register the subagent settings section and policy marker', () => {
  const clientBundle = readText(pluginRoot, 'lib', 'client.js')
  const policyBundle = readText(pluginRoot, 'lib', 'routing-policy.js')
  assert.match(clientBundle, /name:\s*['\"]settings\.section['\"][\s\S]*?id:\s*['\"]agent-teams['\"]/)
  assert.match(policyBundle, /AgentTeams delegation policy:/)
})

test('desktop settings bundle registers only the desktop settings section', () => {
  const clientBundle = readText(desktopPluginRoot, 'lib', 'client.js')
  const ids = [...clientBundle.matchAll(/name:\s*['\"]settings\.section['\"],[\s\S]{0,160}?id:\s*['\"]([^'\"]+)['\"]/g)]
    .map((match) => match[1])
  assert.deepEqual(ids, ['desktop'])
})

test('AgentTeams shared catalog preserves CPA models and reasoning efforts', async () => {
  const result = await buildHostModelCatalog({
    listProviders: () => [{ id: 'cpa' }],
    listModels: async (provider) => {
      assert.equal(provider, 'cpa')
      return [{ id: 'gpt-5.6-sol', name: 'gpt-5.6-sol' }]
    },
    resolveModelInfo: async (provider, model) => {
      assert.equal(provider, 'cpa')
      assert.equal(model, 'gpt-5.6-sol')
      return {
        reasoning: {
          efforts: [
            { id: 'off', name: 'Off' },
            { id: 'low', name: 'Low' },
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
            { id: 'xhigh', name: 'Xhigh' },
            { id: 'max', name: 'Max' },
          ],
          defaultEffort: 'high',
        },
      }
    },
  })

  assert.deepEqual(result, {
    models: [{
      provider: 'cpa',
      id: 'gpt-5.6-sol',
      name: 'gpt-5.6-sol',
      efforts: [
        { id: 'off', name: 'Off' },
        { id: 'low', name: 'Low' },
        { id: 'medium', name: 'Medium' },
        { id: 'high', name: 'High' },
        { id: 'xhigh', name: 'Xhigh' },
        { id: 'max', name: 'Max' },
      ],
      defaultEffort: 'high',
    }],
    failures: [],
  })
})
