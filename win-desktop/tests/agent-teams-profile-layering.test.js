import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import yaml from 'js-yaml'
import { generateAgentTeamsPatch, buildDshEnvironment } from '../src/dsh-service.js'
import { BUILTIN_AGENT_TEAMS_PROFILES } from '../src/agent-teams-profile-store.js'

const wrapperRoot = fileURLToPath(new URL('..', import.meta.url))
const hook = new URL('../src/win-hide-console.mjs', import.meta.url).href
const fixtureFile = fileURLToPath(import.meta.url)

function routedProfiles(generation) {
  const profiles = structuredClone(BUILTIN_AGENT_TEAMS_PROFILES)
  profiles['software-delivery'].members = profiles['software-delivery'].members.map(member => ({
    ...member,
    provider: `${generation}-provider`,
    model: `${generation}-${member.name}-model`,
    reasoning_mode: 'explicit',
    reasoning_effort: 'high',
  }))
  return profiles
}

function effectiveProfiles(generation) {
  const profiles = routedProfiles(generation)
  // SettingsForms materializes schema defaults; routes and prompts stay exact.
  profiles['software-delivery'].tasks = []
  profiles['software-delivery'].reviewPolicy = { requiredReviewers: [] }
  return profiles
}

function writeDesktopDefaults(home, generation) {
  return generateAgentTeamsPatch({
    getSettings: () => ({ agentTeamsProfiles: { schemaVersion: 2, profiles: routedProfiles(generation) } }),
    getUserDataPath: () => home,
  })
}

if (process.argv.includes('--fixture')) {
  // This mounts the actual official composition, ConfigEditor and SettingsForms.
  // Lifecycle is inert: no child, server, installed user profile or network.
  const { boot, loadProfileDirectory, readProfilePatches } = await import('@deepseek-ai/dsh-app-boot')
  const { default: ConfigEditor } = await import('@deepseek-ai/dsh-config-editor')
  const { default: SettingsForms } = await import('@deepseek-ai/dsh-settings')
  const { Config } = await import('@nanmicoder/dsh-agent-teams')
  const home = process.env.DSH_HOME
  const profileDir = join(home, 'profiles', 'web')
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const profileContext = {
    name: 'web', dir: profileDir, patchPath, home,
    installAnchor: join(wrapperRoot, 'package.json'), overlays: [],
  }
  const open = async () => {
    const loaded = loadProfileDirectory('dsh', profileDir, profileContext.installAnchor)
    return boot('dsh', join(profileDir, 'cordis.yml'), readProfilePatches('dsh', profileContext, loaded), async ctx => {
      ctx.provide('profileContext', profileContext)
      ctx.loader.internal = { import: async name => name === '@nanmicoder/dsh-agent-teams'
        ? { name: 'agent-teams', Config, apply() {} } : { apply() {} } }
      await ctx.plugin(ConfigEditor)
      await ctx.plugin(SettingsForms)
    })
  }
  let ctx = await open()
  const modeOnly = process.argv.includes('--mode-only')
  const existingOverride = process.argv.includes('--existing-override')
  const descriptor = () => ctx.settings.describe().find(row => row.ns === 'agent-teams')
  const config = () => ctx.configEditor.entries().find(row => row.options.id === 'agent-teams').options.config
  try {
    const initialProfiles = routedProfiles(existingOverride ? 'user' : 'first')
    assert.deepEqual(config().profiles, initialProfiles)
    assert.deepEqual(descriptor().value.profiles, effectiveProfiles(existingOverride ? 'user' : 'first'),
      'the editor must read the same effective Profiles that runtime Team creation uses')
    const temporaryMember = { provider: 'temporary-provider', model: 'temporary-model', reasoningMode: 'explicit', reasoningEffort: 'high' }
    const ops = [{ op: 'set', path: ['delegationMode'], value: 'native' }]
    if (!modeOnly) ops.push({ op: 'set', path: ['temporaryMember'], value: temporaryMember })
    await ctx.settings.mutate('agent-teams', ops, descriptor().revision)
    const stored = yaml.load(readFileSync(patchPath, 'utf8'))
    assert.deepEqual(stored.find(row => row.id === 'unrelated-row').config, { retain: 'user-value' })
    const saved = stored.find(row => row.id === 'agent-teams').config
    assert.equal(saved.delegationMode, 'native')
    if (!modeOnly) assert.deepEqual(saved.temporaryMember, temporaryMember)
    assert.deepEqual(saved.profiles, initialProfiles,
      'saving unrelated preferences preserves effective Profiles through official whole-config persistence')
    if (existingOverride) assert.equal(saved.memberMaxDepth, 2)
    const firstRevision = descriptor().revision
    await ctx.settings.mutate('agent-teams', [{ op: 'set', path: ['profiles'], value: effectiveProfiles('second') }], firstRevision)
    assert.deepEqual(descriptor().value.profiles, effectiveProfiles('second'), 'Profile Save updates the effective editor value')
    assert.deepEqual(config().profiles, effectiveProfiles('second'), 'Profile Save updates the next-Team source without a desktop cache write')
    await assert.rejects(ctx.settings.mutate('agent-teams', [{ op: 'set', path: ['profiles'], value: routedProfiles('stale') }], firstRevision),
      /changed since it was read/, 'an old Profile draft cannot overwrite a later accepted save')
    await ctx.fiber.dispose()
    // The old desktop defaults are retained as an import source, never rewritten
    // to pretend that two independent durable writes were atomic.
    ctx = await open()
    assert.deepEqual(config().profiles, effectiveProfiles('second'), 'the saved effective Profile survives restart over the old desktop defaults')
    assert.equal(descriptor().value.delegationMode, 'native')
    if (!modeOnly) assert.deepEqual(descriptor().value.temporaryMember, temporaryMember)
    console.log(JSON.stringify({ officialSave: true, profileRefresh: true, settingsRestart: true }))
  } finally {
    await ctx.fiber.dispose()
  }
} else {
  for (const { modeOnly, existingOverride } of [
    { modeOnly: true, existingOverride: false },
    { modeOnly: false, existingOverride: false },
    { modeOnly: false, existingOverride: true },
  ]) {
    test(`AgentTeams ${existingOverride ? 'save preserves intentional user Profile overrides' : `${modeOnly ? 'mode save' : 'mode and temporary save'} preserves official Profile edits over old desktop defaults`}`, () => {
      const home = mkdtempSync(join(tmpdir(), 'dsh-team-profile-layering-'))
      try {
        const profileDir = join(home, 'profiles', 'web')
        mkdirSync(profileDir, { recursive: true })
        writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }))
        writeFileSync(join(profileDir, 'cordis.yml'), '[]\n')
        writeFileSync(join(profileDir, 'cordis.patch.yml'), yaml.dump([
          { id: 'unrelated-row', config: { retain: 'user-value' } },
          ...(existingOverride ? [{ id: 'agent-teams', config: { profiles: routedProfiles('user'), memberMaxDepth: 2 } }] : []),
        ]))
        const desktopPatch = writeDesktopDefaults(home, 'first')
        const env = buildDshEnvironment({ ...process.env, DSH_HOME: home, HOME: home, USERPROFILE: home, DSH_TELEMETRY_DISABLED: '1' }, desktopPatch)
        for (const key of Object.keys(env)) if (/(API_KEY|TOKEN|SECRET|PASSWORD)$/i.test(key)) delete env[key]
        const result = spawnSync(process.execPath, ['--import', hook, fixtureFile, '--fixture', ...(modeOnly ? ['--mode-only'] : []), ...(existingOverride ? ['--existing-override'] : [])], {
          cwd: wrapperRoot, env, encoding: 'utf8', timeout: 30_000, windowsHide: true,
        })
        assert.equal(result.status, 0, result.stderr || result.error?.message)
        assert.deepEqual(JSON.parse(result.stdout.trim()), { officialSave: true, profileRefresh: true, settingsRestart: true })
      } finally {
        assert.equal(dirname(home), resolve(tmpdir()))
        rmSync(home, { recursive: true, force: true })
      }
    })
  }
}
