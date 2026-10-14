import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import yaml from 'js-yaml'
import { generateAgentTeamsPatch, buildDshEnvironment } from '../src/dsh-service.js'
import { readDesktopProfileLayer } from '../src/desktop-profile-layer.js'

const wrapper = fileURLToPath(new URL('..', import.meta.url))
const filename = fileURLToPath(import.meta.url)
const hook = new URL('../src/win-hide-console.mjs', import.meta.url).href
if (process.argv.includes('--fixture')) {
  const { boot, loadProfileDirectory, readProfilePatches } = await import('@deepseek-ai/dsh-app-boot')
  const { default: ConfigEditor } = await import('@deepseek-ai/dsh-config-editor')
  const home = process.env.DSH_HOME
  const dir = join(home, 'profiles', 'web')
  const profileContext = { name: 'web', dir, home, patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: join(wrapper, 'package.json'), overlays: [] }
  for (let restart = 0; restart < 2; restart++) {
    const loaded = loadProfileDirectory('dsh', dir, profileContext.installAnchor)
    const ctx = await boot('dsh', join(dir, 'cordis.yml'), readProfilePatches('dsh', profileContext, loaded), async ctx => {
      ctx.provide('profileContext', profileContext)
      ctx.loader.internal = { import: async () => ({ apply() {} }) }
      await ctx.plugin(ConfigEditor)
    })
    try {
      const entries = ctx.configEditor.entries().filter(entry => entry.options.id === 'superpowers')
      assert.equal(entries.length, 1)
      assert.equal(entries[0].options.disabled, true)
      assert.deepEqual(entries[0].options.config, { userOverride: 'preserved' })
    } finally { await ctx.fiber.dispose() }
  }
  console.log('user disable and override survive restart')
} else {
  test('static and generated defaults mount exactly one bundled skill plugin and keep the ownership whitelist', t => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-superpowers-patch-'))
    t.after(() => rmSync(home, { recursive: true, force: true }))
    const patch = generateAgentTeamsPatch({ getSettings: () => ({}), getUserDataPath: () => home })
    for (const path of [patch, fileURLToPath(new URL('../config/agent-teams.patch.yml', import.meta.url))]) {
      const document = yaml.load(readFileSync(path, 'utf8'))
      assert.deepEqual(document[0].insert.filter(entry => entry.id === 'superpowers'),
        [{ id: 'superpowers', name: '@deepseek-ai/dsh-superpowers' }])
      assert.equal(readDesktopProfileLayer(join(home, 'web'), path).length, 1)
      assert.deepEqual(readDesktopProfileLayer(join(home, 'headless'), path), [])
      for (const replacement of [{ id: 'unknown', name: '@deepseek-ai/dsh-superpowers' }, document[0].insert[0]]) {
        const bad = structuredClone(document)
        bad[0].insert[bad[0].insert.length - 1] = replacement
        const badPath = join(home, 'bad.yml')
        writeFileSync(badPath, yaml.dump(bad))
        assert.throws(() => readDesktopProfileLayer(join(home, 'web'), badPath), /only the owned/u)
      }
    }
  })
  test('official composition respects a disabled skill plugin and user override after restart', t => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-superpowers-disabled-'))
    t.after(() => rmSync(home, { recursive: true, force: true }))
    const dir = join(home, 'profiles', 'web')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }))
    writeFileSync(join(dir, 'cordis.yml'), '[]\n')
    const patchPath = join(dir, 'cordis.patch.yml')
    const userPatch = yaml.dump([{ id: 'superpowers', disabled: true, config: { userOverride: 'preserved' } }])
    writeFileSync(patchPath, userPatch)
    const desktop = generateAgentTeamsPatch({ getSettings: () => ({}), getUserDataPath: () => home })
    const env = buildDshEnvironment({ ...process.env, DSH_HOME: home, HOME: home, USERPROFILE: home, DSH_TELEMETRY_DISABLED: '1' }, desktop)
    for (const key of Object.keys(env)) if (/(API_KEY|TOKEN|SECRET|PASSWORD)$/iu.test(key)) delete env[key]
    const result = spawnSync(process.execPath, ['--import', hook, filename, '--fixture'], {
      cwd: wrapper, env, encoding: 'utf8', timeout: 30_000, windowsHide: true })
    assert.equal(result.status, 0, result.stderr || result.error?.message)
    assert.match(result.stdout, /user disable and override survive restart/u)
    assert.equal(readFileSync(patchPath, 'utf8'), userPatch)
  })
}
