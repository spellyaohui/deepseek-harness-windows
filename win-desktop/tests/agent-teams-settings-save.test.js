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
  let clientCtx
  try {
    const descriptor = () => ctx.settings.describe().find(row => row.ns === 'agent-teams')
    const original = descriptor()
    assert.ok(original, 'AgentTeams settings must mount')
    assert.equal(original.value.delegationMode, 'teams')
    const temporaryMember = { provider: 'fixture-provider', model: 'fixture-model', reasoningMode: 'explicit', reasoningEffort: 'high' }
    // Exercise the same serialized schema mirror as the Web settings page,
    // rather than a mock acceptView that unconditionally accepts Host values.
    const cordis = await import('@deepseek-ai/cordis')
    // The official controller and schema decoder remain real; this fixture
    // supplies only the React-free observable transport (the production store
    // engine's Zustand/Immer development dependencies are not installed here).
    const store = { createSnapshotStore(initial) {
      let snapshot = initial
      const listeners = new Set()
      const publish = next => { snapshot = next; for (const listener of listeners) listener() }
      return {
        getSnapshot: () => snapshot,
        subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
        set: publish,
        update: change => { const next = structuredClone(snapshot); change(next); publish(next) },
      }
    } }
    const clientDependencies = { '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-store': store }
    let clientModule
    globalThis.window = { __ModuleLoader__: { load: ({ factory }) => {
      clientModule = factory(name => {
        assert.ok(Object.hasOwn(clientDependencies, name), `unexpected client dependency: ${name}`)
        return clientDependencies[name]
      })
    } } }
    try { await import('@deepseek-ai/dsh-client-ui-settings/client') } finally { delete globalThis.window }
    const wire = value => JSON.parse(JSON.stringify(value))
    const describeWire = () => wire({ writable: true, hasDocument: true, namespaces: ctx.settings.describe() })
    const openClient = () => {
      const current = new cordis.Context()
      current.provide('remote', {
        $host: { isLoopback: true }, $on: () => () => {},
        settings: {
          describe: async () => ({ ok: true, value: describeWire() }),
          mutate: async (ns, ops, revision) => {
            await ctx.settings.mutate(ns, wire(ops), revision)
            return { ok: true, value: wire(descriptor()) }
          },
        },
      })
      clientModule.apply(current)
      return current
    }
    clientCtx = openClient()
    const form = clientCtx.configForms.get('agent-teams')
    await clientCtx.configForms.describe().load()
    assert.equal(form.getSnapshot().status, 'ready')
    assert.equal(form.getSnapshot().value.temporaryMember, undefined)
    const { createAgentTeamsSettingsWriter, planTemporaryMemberChange } = await import('../agent-teams-plugin/lib/client/settings-write.js')
    const writer = createAgentTeamsSettingsWriter({ api: clientCtx.remote, scope: form, describe: clientCtx.configForms.describe() })
    const result = await writer.write(planTemporaryMemberChange(temporaryMember).ops)
    assert.equal(result.status, 'ready')
    assert.deepEqual(descriptor().value.temporaryMember, temporaryMember, 'Host accepts the whole temporary policy')
    assert.deepEqual(yaml.load(readFileSync(patchPath, 'utf8')).find(row => row.id === 'agent-teams').config.temporaryMember, temporaryMember,
      'successful save persists the whole route and explicit effort')
    assert.equal(clientCtx.settingsSchema.validate(clientCtx.settingsSchema.rehydrate(wire(descriptor().schema)), wire(descriptor().value)), undefined,
      'the JSON-transferred Host schema must validate its own saved temporary policy in the official browser decoder')
    assert.deepEqual(form.getSnapshot().value.temporaryMember, temporaryMember,
      'the real Web ConfigForm must retain the chosen temporary route after a successful save')
    await clientCtx.configForms.describe().load()
    assert.deepEqual(form.getSnapshot().value.temporaryMember, temporaryMember,
      'reloading the Host description cannot revert a saved route to follow captain')
    for (const policy of [
      { provider: 'fixture-provider', model: 'fixture-model', reasoningMode: 'route-aware' },
      { provider: 'fixture-provider', model: 'fixture-model', reasoningMode: 'target-default' },
      { reasoningMode: 'target-default' },
      temporaryMember,
    ]) {
      assert.equal((await writer.write(planTemporaryMemberChange(policy).ops)).status, 'ready')
      assert.deepEqual(form.getSnapshot().value.temporaryMember, policy,
        `${policy.reasoningMode} keeps its complete saved route without a stale explicit effort`)
      await clientCtx.configForms.describe().load()
      assert.deepEqual(form.getSnapshot().value.temporaryMember, policy,
        `${policy.reasoningMode} survives a fresh Host description`)
    }
    await clientCtx.fiber.dispose()
    clientCtx = undefined
    // The independent Host replace/restart checks retain their original fence.
    const savedRevision = descriptor().revision
    const beforeStaleMutation = readFileSync(patchPath, 'utf8')
    await assert.rejects(ctx.settings.mutate('agent-teams', planTemporaryMemberChange({ reasoningMode: 'target-default' }).ops, original.revision),
      /changed since it was read/)
    assert.equal(readFileSync(patchPath, 'utf8'), beforeStaleMutation, 'a stale temporary mutation cannot overwrite the saved route')
    await ctx.settings.replace('agent-teams', { delegationMode: 'native', temporaryMember }, savedRevision)
    assert.equal(descriptor().value.delegationMode, 'native')
    assert.deepEqual(descriptor().value.temporaryMember, temporaryMember)
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
    assert.deepEqual(descriptor().value.temporaryMember, temporaryMember, 'the complete temporary route and effort survive restart')
    clientCtx = openClient()
    const restartedForm = clientCtx.configForms.get('agent-teams')
    await clientCtx.configForms.describe().load()
    assert.equal(restartedForm.getSnapshot().status, 'ready', 'a fresh browser must decode the saved temporary policy after restart')
    assert.deepEqual(restartedForm.getSnapshot().value.temporaryMember, temporaryMember)
    await clientCtx.fiber.dispose()
    clientCtx = undefined
    await assert.rejects(ctx.settings.replace('agent-teams', {
      delegationMode: 'native', temporaryMember: { provider: 'fixture-provider', reasoningMode: 'explicit' },
    }, descriptor().revision))
    assert.equal(readFileSync(patchPath, 'utf8'), stored, 'invalid temporary defaults do not partially overwrite saved settings')
    for (const policy of [
      { reasoningMode: 'unknown' },
      { reasoningMode: 'explicit', provider: 'fixture-provider' },
      { reasoningMode: 'explicit', model: 'fixture-model', reasoningEffort: 'high' },
      { reasoningMode: 'explicit', provider: 'fixture-provider', model: 'fixture-model' },
      { reasoningMode: 'target-default', provider: 'fixture-provider' },
      { reasoningMode: 'route-aware', model: 'fixture-model' },
      { reasoningMode: 'target-default', provider: 'fixture-provider', model: 'fixture-model', reasoningEffort: 'high' },
      { reasoningMode: 'route-aware', provider: 'fixture-provider', model: 'fixture-model', reasoningEffort: 'high' },
      { ...temporaryMember, provider: ' \t ' },
      { ...temporaryMember, model: ' \n ' },
      { ...temporaryMember, reasoningEffort: ' ' },
      { ...temporaryMember, reasoningEffort: '' },
    ]) {
      await assert.rejects(ctx.settings.mutate('agent-teams', [{ op: 'set', path: ['temporaryMember'], value: policy }], descriptor().revision),
        `the Host must reject an invalid complete temporary policy: ${JSON.stringify(policy)}`)
      assert.equal(readFileSync(patchPath, 'utf8'), stored, 'a refused policy leaves the profile file unchanged')
      assert.deepEqual(descriptor().value.temporaryMember, temporaryMember, 'a refused policy leaves the live route unchanged')
    }
    await ctx.settings.replace('agent-teams', { delegationMode: 'teams', temporaryMember }, descriptor().revision)
    assert.equal(descriptor().value.delegationMode, 'teams')
    const finalEntry = ctx.configEditor.entries().find(row => row.options.id === 'agent-teams')
    const explicitOverride = { id: 'agent-teams', name: finalEntry.options.name, config: { ...finalEntry.options.config, delegationMode: 'native' } }
    await ctx.fiber.dispose()
    writeFileSync(join(home, 'cordis.patch.yml'), yaml.dump([explicitOverride]))
    ctx = await open()
    assert.equal(descriptor().value.delegationMode, 'native')
    const beforeRefusal = readFileSync(patchPath, 'utf8')
    await assert.rejects(ctx.settings.replace('agent-teams', { delegationMode: 'teams' }, descriptor().revision), /overridden by a home patch or command-line overlay/)
    await assert.rejects(ctx.settings.mutate('agent-teams', planTemporaryMemberChange({ reasoningMode: 'target-default' }).ops, descriptor().revision),
      /overridden by a home patch or command-line overlay/)
    assert.equal(readFileSync(patchPath, 'utf8'), beforeRefusal)
    await ctx.fiber.dispose()
    unlinkSync(join(home, 'cordis.patch.yml'))
    overlays.push(explicitOverride)
    ctx = await open()
    assert.equal(descriptor().value.delegationMode, 'native')
    await assert.rejects(ctx.settings.replace('agent-teams', { delegationMode: 'teams' }, descriptor().revision), /overridden by a home patch or command-line overlay/)
    await assert.rejects(ctx.settings.mutate('agent-teams', planTemporaryMemberChange({ reasoningMode: 'target-default' }).ops, descriptor().revision),
      /overridden by a home patch or command-line overlay/)
    assert.equal(readFileSync(patchPath, 'utf8'), beforeRefusal)
    console.log(JSON.stringify({ save: true, restart: true, revisionGuard: true, retainedProfiles: true, homeAndCliGuard: true }))
  } finally {
    await clientCtx?.fiber.dispose()
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
