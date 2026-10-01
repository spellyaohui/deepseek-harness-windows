import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import yaml from 'js-yaml'
import { generateAgentTeamsPatch, buildDshArgs, buildDshEnvironment } from '../src/dsh-service.js'
import { readDesktopProfileLayer, rewriteDesktopProfileLayer } from '../src/desktop-profile-layer.js'

const wrapperRoot = fileURLToPath(new URL('..', import.meta.url))
const hook = new URL('../src/win-hide-console.mjs', import.meta.url).href
const fixtureFile = fileURLToPath(import.meta.url)

if (process.argv.includes('--fixture')) {
  // Real Loader, ConfigEditor, SettingsForms and AgentTeams schema; only the
  // plugin lifecycle is inert, so the gate starts no server, Team or network.
  const { boot, loadProfileDirectory, readProfilePatches } = await import('@deepseek-ai/dsh-app-boot')
  const { default: ConfigEditor } = await import('@deepseek-ai/dsh-config-editor')
  const { default: SettingsForms } = await import('@deepseek-ai/dsh-settings')
  const { Config } = await import('@nanmicoder/dsh-agent-teams')
  const home = process.env.DSH_HOME
  const profileDir = join(home, 'profiles', 'web')
  const patchPath = join(profileDir, 'cordis.patch.yml')
  const desktopPatch = process.env.DSH_DESKTOP_STARTUP_PATCH
  const args = buildDshArgs('unused-entry', { platform: 'win32', agentTeamsPatch: desktopPatch })
  const overlays = args.includes(desktopPatch) ? yaml.load(readFileSync(desktopPatch, 'utf8')) : []
  const profileContext = { name: 'web', dir: profileDir, patchPath, home, installAnchor: join(wrapperRoot, 'package.json'), overlays }
  const open = async () => {
    const loaded = loadProfileDirectory('dsh', profileDir, profileContext.installAnchor)
    return boot('dsh', join(profileDir, 'cordis.yml'), readProfilePatches('dsh', profileContext, loaded), async ctx => {
      ctx.provide('profileContext', profileContext)
      ctx.loader.internal = { import: async name => name === '@nanmicoder/dsh-agent-teams' ? { name: 'agent-teams', Config, apply() {} } : { apply() {} } }
      await ctx.plugin(ConfigEditor)
      await ctx.plugin(SettingsForms)
    })
  }
  let ctx = await open()
  try {
    const descriptor = () => ctx.settings.describe().find(row => row.ns === 'agent-teams')
    const original = descriptor()
    assert.ok(original, 'AgentTeams settings must mount')
    assert.equal(original.value.delegationMode, 'teams')
    await ctx.settings.replace('agent-teams', { delegationMode: 'native' }, original.revision)
    assert.equal(descriptor().value.delegationMode, 'native')
    const stored = readFileSync(patchPath, 'utf8')
    assert.match(stored, /delegationMode: native/)
    assert.deepEqual(yaml.load(stored).find(row => row.id === 'unrelated-user-row').config, { retain: 'fixture-only-value' })
    const entry = ctx.configEditor.entries().find(row => row.options.id === 'agent-teams')
    assert.equal(entry.options.config.memberProvider, 'spawn')
    assert.equal(entry.options.config.profiles['software-delivery'].members.length, 4)
    await assert.rejects(ctx.settings.replace('agent-teams', { delegationMode: 'teams' }, original.revision), /changed since it was read/)
    assert.equal(readFileSync(patchPath, 'utf8'), stored)
    await ctx.fiber.dispose()
    ctx = await open()
    assert.equal(descriptor().value.delegationMode, 'native', 'saved mode must survive restart')
    await ctx.settings.replace('agent-teams', { delegationMode: 'teams' }, descriptor().revision)
    assert.equal(descriptor().value.delegationMode, 'teams')
    const finalEntry = ctx.configEditor.entries().find(row => row.options.id === 'agent-teams')
    const explicitOverride = { id: 'agent-teams', name: finalEntry.options.name, config: { ...finalEntry.options.config, delegationMode: 'native' } }
    await ctx.fiber.dispose()
    writeFileSync(join(home, 'cordis.patch.yml'), yaml.dump([explicitOverride]))
    ctx = await open()
    assert.equal(descriptor().value.delegationMode, 'native')
    const beforeRefusal = readFileSync(patchPath, 'utf8')
    await assert.rejects(ctx.settings.replace('agent-teams', { delegationMode: 'teams' }, descriptor().revision), /overridden by a home patch or command-line overlay/)
    assert.equal(readFileSync(patchPath, 'utf8'), beforeRefusal)
    await ctx.fiber.dispose()
    unlinkSync(join(home, 'cordis.patch.yml'))
    overlays.push(explicitOverride)
    ctx = await open()
    assert.equal(descriptor().value.delegationMode, 'native')
    await assert.rejects(ctx.settings.replace('agent-teams', { delegationMode: 'teams' }, descriptor().revision), /overridden by a home patch or command-line overlay/)
    assert.equal(readFileSync(patchPath, 'utf8'), beforeRefusal)
    console.log(JSON.stringify({ save: true, restart: true, revisionGuard: true, retainedProfiles: true, homeAndCliGuard: true }))
  } finally {
    await ctx.fiber.dispose()
  }
} else {
  test('desktop AgentTeams settings save and survive restart through the official profile editor', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-team-settings-save-'))
    try {
      const profileDir = join(home, 'profiles', 'web')
      mkdirSync(profileDir, { recursive: true })
      writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }))
      writeFileSync(join(profileDir, 'cordis.patch.yml'), yaml.dump([{ id: 'unrelated-user-row', config: { retain: 'fixture-only-value' } }]))
      writeFileSync(join(profileDir, 'cordis.yml'), '[]\n')
      const desktopPatch = generateAgentTeamsPatch({ getSettings: () => ({}), getUserDataPath: () => home })
      const env = buildDshEnvironment({ ...process.env, DSH_HOME: home, HOME: home, USERPROFILE: home, DSH_TELEMETRY_DISABLED: '1' }, desktopPatch)
      for (const key of Object.keys(env)) if (/(API_KEY|TOKEN|SECRET|PASSWORD)$/i.test(key)) delete env[key]
      const result = spawnSync(process.execPath, ['--import', hook, fixtureFile, '--fixture'], { cwd: wrapperRoot, env, encoding: 'utf8', timeout: 30000, windowsHide: true })
      assert.equal(result.status, 0, result.stderr || result.error?.message)
      assert.deepEqual(JSON.parse(result.stdout.trim()), { save: true, restart: true, revisionGuard: true, retainedProfiles: true, homeAndCliGuard: true })
    } finally {
      // Only the exact directory returned by mkdtempSync is ours.
      assert.equal(dirname(home), resolve(tmpdir()))
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('desktop profile seam is scoped, idempotent and refuses upstream drift', () => {
    const url = import.meta.resolve('@deepseek-ai/dsh-app-boot')
    const source = readFileSync(fileURLToPath(url), 'utf8')
    const rewritten = rewriteDesktopProfileLayer(source, url)
    assert.notEqual(rewritten, source)
    assert.equal(rewriteDesktopProfileLayer(rewritten, url), rewritten)
    assert.equal(rewriteDesktopProfileLayer(source, 'file:///unrelated/index.js'), source)
    assert.throws(() => rewriteDesktopProfileLayer('', url), /composition drift/)
    assert.throws(() => rewriteDesktopProfileLayer(source + source, url), /composition drift/)
  })

  test('desktop defaults only load the exact owned insertions for Web', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-layer-'))
    try {
      const path = generateAgentTeamsPatch({ getSettings: () => ({}), getUserDataPath: () => home })
      assert.deepEqual(readDesktopProfileLayer(join(home, 'headless'), path), [])
      assert.equal(readDesktopProfileLayer(join(home, 'web'), path).length, 1)
      assert.throws(() => readDesktopProfileLayer(join(home, 'web'), 'relative.yml'), /absolute/)
      const original = yaml.load(readFileSync(path, 'utf8'))
      const foreign = structuredClone(original)
      foreign[0].insert[0] = { name: undefined }
      writeFileSync(path, yaml.dump(foreign))
      assert.throws(() => readDesktopProfileLayer(join(home, 'web'), path), /owned desktop/)
      writeFileSync(path, yaml.dump([...original, { id: 'agent-teams', config: { delegationMode: 'native' } }]))
      assert.throws(() => readDesktopProfileLayer(join(home, 'web'), path), /owned desktop/)
    } finally {
      assert.equal(dirname(home), resolve(tmpdir()))
      rmSync(home, { recursive: true, force: true })
    }
  })
}
