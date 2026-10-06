import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import yaml from 'js-yaml'
import { encryptBackup, decryptBackup, exportConfiguration, importConfiguration, validateEncryptedBackup } from '../desktop-settings-plugin/lib/backup.js'
import { BUILTIN_AGENT_TEAMS_PROFILES } from '../src/agent-teams-profile-store.js'

const wrapperRoot = fileURLToPath(new URL('..', import.meta.url))
const password = 'test-only-backup-password'
const profiles = structuredClone(BUILTIN_AGENT_TEAMS_PROFILES)
for (const member of profiles['software-delivery'].members) Object.assign(member, {
  provider: 'workbuddy', model: 'hy3', reasoning_mode: 'explicit', reasoning_effort: 'high',
  executionPrompt: `  ${member.name} 中文职责\n保留空白  `,
})
const provider = { apiKeyEnv: 'BACKUP_TEST_KEY', api: 'openai-completions', baseURL: 'https://example.invalid/v1', models: [
  { id: 'hy3', name: '测试模型', contextWindow: 128000, maxTokens: 32000, input: ['text', 'image'], reasoningEfforts: { high: 'high', max: 'xhigh' } },
] }
const entries = [
  { id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: { workbuddy: provider } } },
  { id: 'agent-teams', name: '@nanmicoder/dsh-agent-teams', config: { profiles, temporaryMember: { provider: 'workbuddy', model: 'hy3', reasoningMode: 'explicit', reasoningEffort: 'max' } } },
  { id: 'subagent', name: '@deepseek-ai/dsh-subagent', config: { maxDepth: 3 } },
  { id: 'subagent-model-selection-settings', name: '@deepseek-ai/dsh-tool-subagent/model-selection-settings', config: { enabled: true, allowedModels: [{ provider: 'workbuddy', model: 'hy3' }] } },
  { id: 'unrelated', name: 'test-unrelated', config: { secret: 'not-exported' } },
]

if (process.argv.includes('--fixture')) {
  const { boot, loadProfileDirectory, readProfilePatches } = await import('@deepseek-ai/dsh-app-boot')
  const { default: ConfigEditor } = await import('@deepseek-ai/dsh-config-editor')
  const { default: SettingsForms } = await import('@deepseek-ai/dsh-settings')
  const { default: LocalCredentials } = await import('@deepseek-ai/dsh-credentials-local')
  const { default: Subagent } = await import('@deepseek-ai/dsh-subagent')
  const { default: ModelSelection } = await import('@deepseek-ai/dsh-tool-subagent/model-selection-settings')
  const { Config: piConfig } = await import('@deepseek-ai/dsh-llm-pi-ai')
  const { Config: teamConfig } = await import('@nanmicoder/dsh-agent-teams')
  const configs = new Map([
    ['@deepseek-ai/dsh-llm-pi-ai', piConfig], ['@nanmicoder/dsh-agent-teams', teamConfig],
    ['@deepseek-ai/dsh-subagent', Subagent.Config], ['@deepseek-ai/dsh-tool-subagent/model-selection-settings', ModelSelection.Config],
  ])
  const home = process.env.DSH_HOME
  const make = async name => {
    const dir = join(home, name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }))
    writeFileSync(join(dir, 'cordis.yml'), '[]\n')
    writeFileSync(join(dir, 'cordis.patch.yml'), yaml.dump([{ insert: entries }]))
    const profile = { name, dir, patchPath: join(dir, 'cordis.patch.yml'), home, installAnchor: join(wrapperRoot, 'package.json'), overlays: [] }
    const open = () => boot('dsh', join(dir, 'cordis.yml'), readProfilePatches('dsh', profile, loadProfileDirectory('dsh', dir, profile.installAnchor)), async ctx => {
      ctx.provide('profileContext', profile)
      ctx.loader.internal = { import: async owner => ({ name: owner, Config: configs.get(owner), apply() {} }) }
      await ctx.plugin(ConfigEditor)
      await ctx.plugin(SettingsForms)
      await ctx.plugin(LocalCredentials, { path: join(dir, 'keys.yaml'), watch: false })
    })
    return { ctx: await open(), open, profile }
  }
  const source = await make('source'), target = await make('target')
  const view = (ctx, ns) => ctx.settings.describe().find(row => row.ns === ns)
  try {
    await source.ctx.credentials.set('BACKUP_TEST_KEY', 'fixture-api-secret')
    await source.ctx.credentials.modifyRecord('llm-pi-ai/workbuddy', async () => ({ kind: 'api-key', key: 'fixture-record-secret' }))
    await source.ctx.credentials.modifyRecord('llm-pi-ai/catalog-native', async () => ({ kind: 'api-key', key: 'fixture-native-secret' }))
    await source.ctx.credentials.modifyRecord('account/login', async () => ({ kind: 'grant', payload: { token: 'never-export-login' } }))
    const encrypted = await exportConfiguration(source.ctx, password)
    assert(!encrypted.includes('fixture-api-secret'))
    const decoded = await decryptBackup(encrypted, password)
    assert.equal(decoded.refs.BACKUP_TEST_KEY, 'fixture-api-secret')
    assert.equal(decoded.records['llm-pi-ai/workbuddy'].key, 'fixture-record-secret')
    assert.equal(decoded.records['llm-pi-ai/catalog-native'].key, 'fixture-native-secret')
    assert(!JSON.stringify(decoded).includes('never-export-login'))
    assert(!JSON.stringify(decoded).includes('not-exported'))
    const changed = view(target.ctx, 'agent-teams')
    await target.ctx.settings.mutate('agent-teams', [{ op: 'set', path: [], value: { ...changed.value, profiles: {}, temporaryMember: { reasoningMode: 'target-default' } } }], changed.revision)
    await target.ctx.credentials.set('BACKUP_TEST_KEY', 'old-target-secret')
    const settingsValues = ctx => ctx.settings.describe().map(({ ns, value }) => ({ ns, value }))
    const unchanged = settingsValues(target.ctx)
    await assert.rejects(importConfiguration(target.ctx, encrypted, 'wrong-test-password'), /密码错误/)
    assert.deepEqual(settingsValues(target.ctx), unchanged)
    assert.equal((await target.ctx.credentials.resolve('BACKUP_TEST_KEY')).value, 'old-target-secret')
    assert.deepEqual(await importConfiguration(target.ctx, encrypted, password), { restartRequired: true })
    for (const section of decoded.sections) assert.deepEqual(view(target.ctx, section.ns).value, view(source.ctx, section.ns).value)
    assert.equal((await target.ctx.credentials.resolve('BACKUP_TEST_KEY')).value, 'fixture-api-secret')
    assert.equal((await target.ctx.credentials.readRecord('llm-pi-ai/workbuddy')).key, 'fixture-record-secret')
    await target.ctx.fiber.dispose()
    target.ctx = await target.open()
    for (const section of decoded.sections) assert.deepEqual(view(target.ctx, section.ns).value, view(source.ctx, section.ns).value, 'cross-home import survives restart')
    assert.equal(view(target.ctx, 'agent-teams').value.profiles['software-delivery'].members[0].executionPrompt, '  analyst 中文职责\n保留空白  ')
    // Home/CLI override refusal must roll back previously accepted namespaces.
    const rejected = structuredClone(decoded)
    rejected.sections.find(row => row.ns === 'llm-pi-ai').value.providers.workbuddy.baseURL = 'https://changed.invalid/v1'
    rejected.sections.find(row => row.ns === 'agent-teams').value.delegationMode = 'native'
    target.profile.overlays = [{ id: 'agent-teams', config: { delegationMode: 'teams' } }]
    const beforeProvider = structuredClone(view(target.ctx, 'llm-pi-ai').value)
    await assert.rejects(importConfiguration(target.ctx, await encryptBackup(rejected, password), password), /已恢复原配置/)
    assert.deepEqual(view(target.ctx, 'llm-pi-ai').value, beforeProvider)
    // A late credential-store failure restores both earlier keys and config.
    const keyFailure = structuredClone(decoded)
    keyFailure.sections.find(row => row.ns === 'llm-pi-ai').value.providers.extra = { ...provider, apiKeyEnv: 'FAIL_TEST_KEY' }
    keyFailure.refs.FAIL_TEST_KEY = 'fixture-failing-secret'
    await target.ctx.credentials.set('BACKUP_TEST_KEY', 'before-failed-import')
    const originalSet = target.ctx.credentials.set.bind(target.ctx.credentials)
    target.ctx.credentials.set = async (ref, value) => {
      if (ref === 'FAIL_TEST_KEY') throw new Error('provider failure contains fixture-failing-secret')
      return originalSet(ref, value)
    }
    try {
      await assert.rejects(importConfiguration(target.ctx, await encryptBackup(keyFailure, password), password), error => /已恢复原配置/.test(error.message) && !error.message.includes('fixture-failing-secret'))
      assert.equal((await target.ctx.credentials.resolve('BACKUP_TEST_KEY')).value, 'before-failed-import')
      assert.deepEqual(view(target.ctx, 'llm-pi-ai').value, beforeProvider)
    } finally {
      target.ctx.credentials.set = originalSet
      await originalSet('BACKUP_TEST_KEY', 'fixture-api-secret')
    }
    assert.equal((await target.ctx.credentials.resolve('BACKUP_TEST_KEY')).value, 'fixture-api-secret')
    target.profile.overlays = []
    // Schema validation still rejects malformed model declarations.
    rejected.sections.find(row => row.ns === 'llm-pi-ai').value.providers.workbuddy.models[0].input = ['invalid']
    await assert.rejects(importConfiguration(target.ctx, await encryptBackup(rejected, password), password), /已恢复原配置/)
    assert.deepEqual(view(target.ctx, 'llm-pi-ai').value, beforeProvider)
    console.log('PASS actual ConfigEditor + SettingsForms + Credentials: portable secrets, prompts, temporary/native/team policies, restart, overlay and malformed-config rollback')
  } finally { await source.ctx.fiber.dispose(); await target.ctx.fiber.dispose() }
} else {
  test('backup ownership, package identity and official UI primitives stay aligned', () => {
    const manifest = JSON.parse(readFileSync(new URL('../desktop-settings-plugin/package.json', import.meta.url), 'utf8'))
    const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))
    assert.equal(manifest.version, '0.1.5')
    assert.equal(manifest.exports['./backup'], './lib/backup.js')
    const mainIPC = readFileSync(new URL('../src/settings-window.js', import.meta.url), 'utf8')
    assert.match(mainIPC, /from '@deepseek-ai\/dsh-desktop-settings\/backup'/)
    assert.doesNotMatch(mainIPC, /from '\.\.\/desktop-settings-plugin\//)
    assert.equal(lock.packages['node_modules/@deepseek-ai/dsh-desktop-settings'].version, manifest.version)
    const client = readFileSync(new URL('../desktop-settings-plugin/lib/client.js', import.meta.url), 'utf8')
    assert.match(client, /Switch, Button, Input.*require\('@deepseek-ai\/dsh-client-ui-primitives'\)/)
    assert.match(client, /配置导入成功。请退出并重新启动程序/)
    assert.match(client, /variant: 'outline', size: 'sm'/)
  })
  test('backup Host route requires real Connection authentication and trusted Host/Origin', async () => {
    const { Context } = await import('@deepseek-ai/cordis')
    const { apply: installConnection } = await import('@deepseek-ai/dsh-client-connection')
    const plugin = await import('../desktop-settings-plugin/lib/index.js')
    const ctx = new Context(), routes = new Map()
    let reads = 0, record
    ctx.provide('settings', { describe() { reads++; return [] } })
    ctx.provide('configEditor', { entries() { return [] } })
    ctx.provide('credentials', { async modifyRecord(_key, update) { record = await update(record) ?? record; return record } })
    ctx.provide('webServer', { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } })
    await installConnection(ctx, {})
    const path = '/plugins/dsh-desktop-settings/backup'
    const server = createServer((req, res) => {
      if (req.url.startsWith('/?token=')) { ctx.connection.authorizeIndex(req, res); return }
      const route = routes.get(req.url)
      if (!route) { res.writeHead(404); res.end(); return }
      void route.handler(req, res)
    })
    const fiber = ctx.plugin(plugin)
    await fiber.inertia
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}`
    try {
      assert(routes.has(path))
      const unauthorized = await fetch(base + path, { method: 'POST', body: '{}' })
      assert.equal(unauthorized.status, 401); await unauthorized.arrayBuffer()
      assert.equal(reads, 0)
      const exchange = await fetch(ctx.connection.authenticatedUrl(base), { redirect: 'manual' })
      const cookie = exchange.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
      for (const hostile of [{ origin: 'https://untrusted.invalid' }, { host: 'untrusted.invalid' }, { 'sec-fetch-site': 'cross-site' }]) {
        const status = await new Promise((resolveRequest, reject) => {
          const call = request(base + path, { method: 'POST', headers: { cookie, ...hostile } }, response => {
            response.resume(); response.on('end', () => resolveRequest(response.statusCode))
          })
          call.on('error', reject); call.end('{}')
        })
        assert.equal(status, 403)
      }
      assert.equal(reads, 0)
      const authorized = await fetch(base + path, { method: 'POST', headers: { cookie, origin: base }, body: JSON.stringify({ action: 'export', password }) })
      assert.equal(authorized.status, 400)
      assert.equal(authorized.headers.get('cache-control'), 'no-store')
      assert.deepEqual(await authorized.json(), { error: '配置服务尚未就绪' })
      assert.equal(reads, 1)
      await fiber.dispose(); assert(!routes.has(path))
    } finally {
      await ctx.fiber.dispose(); server.closeAllConnections()
      await new Promise(resolveServer => server.close(resolveServer))
    }
  })
  test('encrypted backup rejects wrong password, tampering, unsupported versions and executable JSON', async () => {
    const doc = { version: 1, text: '中文密钥 fixture-secret', sections: [] }
    const one = await encryptBackup(doc, password), two = await encryptBackup(doc, password)
    assert.notEqual(one, two)
    assert(!one.includes('fixture-secret'))
    assert.deepEqual(await decryptBackup(one, password), doc)
    await assert.rejects(decryptBackup(one, 'wrong-test-password'), /密码错误/)
    const tampered = JSON.parse(one); tampered.tag = Buffer.alloc(16).toString('base64')
    await assert.rejects(decryptBackup(JSON.stringify(tampered), password), /密码错误/)
    assert.throws(() => validateEncryptedBackup(JSON.stringify({ ...tampered, version: 2 })), /版本/)
    assert.throws(() => validateEncryptedBackup('x'.repeat(6_000_001)), /过大/)
    await assert.rejects(encryptBackup({ __jsExpr: 'process.env' }, password), /不允许/)
    await assert.rejects(encryptBackup(JSON.parse('{"__proto__":{"polluted":true}}'), password), /不允许/)
    assert.equal({}.polluted, undefined)
  })
  test('configuration backup uses actual official save, credential store and cross-home restart', () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-backup-'))
    try {
      const env = { ...process.env, DSH_HOME: home, HOME: home, USERPROFILE: home, DSH_TELEMETRY_DISABLED: '1' }
      delete env.NODE_OPTIONS
      for (const key of Object.keys(env)) if (/(API_KEY|TOKEN|SECRET|PASSWORD)$/i.test(key)) delete env[key]
      const result = spawnSync(process.execPath, ['--import', new URL('../src/win-hide-console.mjs', import.meta.url).href, fileURLToPath(import.meta.url), '--fixture'], { cwd: wrapperRoot, env, encoding: 'utf8', windowsHide: true, timeout: 60000 })
      assert.equal(result.status, 0, result.stderr || result.error?.message)
      assert.match(result.stdout, /PASS actual ConfigEditor/)
    } finally {
      assert.equal(dirname(home), resolve(tmpdir()))
      rmSync(home, { recursive: true, force: true })
    }
  })
}
