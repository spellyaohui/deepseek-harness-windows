import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import yaml from 'js-yaml'
import { generateAgentTeamsPatch } from '../src/dsh-service.js'
import { BUILTIN_AGENT_TEAMS_PROFILES } from '../src/agent-teams-profile-store.js'
import { buildHostModelCatalog } from '../agent-teams-plugin/lib/host-model-catalog.js'

const wrapperRoot = fileURLToPath(new URL('..', import.meta.url))
const pluginRoot = join(wrapperRoot, 'node_modules', '@nanmicoder', 'dsh-agent-teams')
const desktopPluginRoot = join(wrapperRoot, 'desktop-settings-plugin')
const agentTeamsSourceRoot = join(wrapperRoot, 'agent-teams-plugin', 'src')
const consoleHideImport = new URL('../src/win-hide-console.mjs', import.meta.url).href

function readText(...segments) {
  return readFileSync(join(...segments), 'utf8')
}

test('AgentTeams global settings expose delegation mode only', () => {
  const settingsSource = readText(agentTeamsSourceRoot, 'settings.ts')
  const indexSource = readText(agentTeamsSourceRoot, 'index.ts')
  assert.doesNotMatch(settingsSource, /memberLlmProvider|memberModel|memberReasoningMode|memberReasoningEffort|migrationVersion|LegacyDesktopAgentTeamsSettings|normalizeLegacyDesktop|createLegacyDesktop|AGENT_TEAMS_MIGRATION_VERSION/)
  assert.doesNotMatch(indexSource, /memberLlmProvider|memberModel|memberReasoningMode|memberReasoningEffort|legacyDesktopSettings|migration-status|confirmAgentTeamsMigration|applyConfirmedAgentTeamsMigration|removeLegacyAgentTeamsSettings|AGENT_TEAMS_MIGRATION_VERSION|normalizeLegacyDesktop/)
})

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
        profiles: BUILTIN_AGENT_TEAMS_PROFILES,
      },
    })

    const metadata = JSON.parse(readText(pluginRoot, 'package.json'))
    assert.equal(metadata.name, '@nanmicoder/dsh-agent-teams')
    assert.equal(metadata.version, '0.1.14-desktop.12')
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
      exports: ['Config', 'apply', 'inject', 'name', 'usageSectionText'],
    })
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

test('runtime patch injects supplied profiles without corrupting YAML', () => {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-agent-teams-profile-yaml-'))
  const protocol = 'colon: # hash "quote" and newline\nnext line'
  try {
    const patchPath = generateAgentTeamsPatch({
      getSettings: () => ({}),
      getProfiles: () => ({
        schemaVersion: 2,
        profiles: {
          'software-delivery': {
            taskPlanning: 'captain',
            protocol,
            members: [{ name: 'analyst', role: '分析', reasoning_mode: 'target-default' }],
          },
          custom: {
            members: [{ name: 'reviewer', role: '评审', reasoning_mode: 'target-default' }],
          },
        },
        builtInNames: ['software-delivery'],
      }),
      getUserDataPath: () => userData,
    })
    const patch = yaml.load(readFileSync(patchPath, 'utf8'))
    const entries = patch.flatMap((item) => item.insert ?? [])
    const agentTeams = entries.find((entry) => entry.id === 'agent-teams')
    assert.equal(agentTeams.config.profiles['software-delivery'].protocol, protocol)
    assert.deepEqual(agentTeams.config.profiles['software-delivery'].members, [{ name: 'analyst', role: '分析', reasoning_mode: 'target-default' }])
    assert.deepEqual(agentTeams.config.profiles.custom, {
      members: [{ name: 'reviewer', role: '评审', reasoning_mode: 'target-default' }],
    })
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

test('runtime patch falls back to the safe built-in map for malformed profile snapshots', () => {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-agent-teams-profile-fallback-'))
  try {
    const patchPath = generateAgentTeamsPatch({
      getSettings: () => ({}),
      getProfiles: () => ({ profiles: { broken: [] }, builtInNames: [] }),
      getUserDataPath: () => userData,
    })
    const patch = yaml.load(readFileSync(patchPath, 'utf8'))
    const agentTeams = patch.flatMap((item) => item.insert ?? [])
      .find((entry) => entry.id === 'agent-teams')
    assert.deepEqual(agentTeams.config.profiles, BUILTIN_AGENT_TEAMS_PROFILES)
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
})

test('runtime patch rejects an unversioned custom profile snapshot', () => {
  const userData = mkdtempSync(join(tmpdir(), 'dsh-agent-teams-profile-unversioned-'))
  try {
    const patchPath = generateAgentTeamsPatch({
      getSettings: () => ({}),
      getProfiles: () => ({
        profiles: {
          custom: {
            members: [{ name: 'old', role: '旧配置' }],
          },
        },
        builtInNames: [],
      }),
      getUserDataPath: () => userData,
    })
    const patch = yaml.load(readFileSync(patchPath, 'utf8'))
    const agentTeams = patch.flatMap((item) => item.insert ?? [])
      .find((entry) => entry.id === 'agent-teams')
    assert.deepEqual(agentTeams.config.profiles, BUILTIN_AGENT_TEAMS_PROFILES)
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
