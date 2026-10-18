import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import test from 'node:test'
import yaml from 'js-yaml'
import { createServer } from 'node:http'
import { apply as mountPiAi } from '@deepseek-ai/dsh-llm-pi-ai'
import { materializeModelInput } from '../models-settings-plugin/lib/client/model-input.js'

registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'electron') return { url: 'data:text/javascript,export const app = { getPath: () => "isolated-fixture" }', shortCircuit: true }
  return next(specifier, context)
} })
const { generateAgentTeamsPatch } = await import('../src/dsh-service.js')
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8')

test('desktop startup no longer mounts a CPA plugin while retaining ordinary native model ownership', () => {
  let generated
  generateAgentTeamsPatch({ getSettings: () => ({}), getUserDataPath: () => 'isolated-fixture', makeDir() {}, writeFile(_path, value) { generated = value } })
  for (const patch of [generated, read('config/agent-teams.patch.yml')]) {
    assert.equal(yaml.load(patch)[0].insert.some(row => row.id === 'cpa-provider'), false)
  }
  const packageJson = JSON.parse(read('package.json'))
  assert.equal(packageJson.dependencies['@deepseek-ai/dsh-cpa-provider'], undefined)
  const lock = JSON.parse(read('package-lock.json'))
  assert.equal(lock.packages[''].dependencies['@deepseek-ai/dsh-cpa-provider'], undefined)
  assert.equal(lock.packages['node_modules/@deepseek-ai/dsh-cpa-provider'], undefined)
  for (const path of ['cpa-provider-plugin/package.json', 'models-settings-plugin/src/client/ModelReasoningLevels.tsx', 'models-settings-plugin/src/client/model-reasoning.ts', 'models-settings-plugin/src/client/provider-profile.ts']) {
    assert.equal(existsSync(new URL('../' + path, import.meta.url)), false, path)
  }
  for (const path of ['src/desktop-profile-layer.js', 'scripts/sync-local-plugin-artifacts.mjs', 'scripts/prepare-clean-build.ps1', 'scripts/verify-upstream-regressions.mjs']) {
    assert.doesNotMatch(read(path), /dsh-cpa-provider|cpa-provider-plugin|id: ['"]cpa-provider['"]/)
  }
  assert.doesNotMatch(read('models-settings-plugin/lib/client.js'), /normalize-provider-profile|DEFAULT_REASONING_EFFORTS|toggleReasoningLevel/)

})

// CPA now uses the same native route and request adapter as any third-party provider.
test('native cpa route preserves credentials, raw capacities, Off and custom wire mappings through real request assembly', async t => {
  const calls = []
  const discoveryCalls = []
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      discoveryCalls.push({ path: request.url, authorization: request.headers.authorization })
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: 'found', name: 'Discovered model' }] }))
      return
    }
    let text = ''
    for await (const chunk of request) text += chunk
    calls.push({ path: request.url, authorization: request.headers.authorization, body: JSON.parse(text) })
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end('data: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'manual', choices: [{ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: null }] }) + '\n\ndata: ' + JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', created: 1, model: 'manual', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const models = [
    { id: 'mapped', reasoningEfforts: { off: null, high: 'xhigh' } },
    { id: 'disabled', reasoningEfforts: false },
    { id: 'undeclared' },
  ].map(row => materializeModelInput({ ...row, contextWindow: 234567, maxTokens: 12345 }))
  const raw = { cpa: { api: 'openai-completions', baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKeyEnv: 'CPA_API_KEY', models } }
  const before = structuredClone(raw)
  let adapter
  let directory
  let discover
  mountPiAi({
    fiber: { entry: { options: { id: 'llm-pi-ai' } } }, inject() {}, on() {},
    get: name => name === 'credentials' ? { resolve: async ref => { assert.equal(ref, 'CPA_API_KEY'); return { value: 'fixture-key' } } } : undefined,
    logger: { warn() {}, error() {} },
    llm: { registerConfigurableProviders: rows => { directory = rows; return { replace() {} } }, registerModelDiscovery: (_ns, handler) => { discover = handler }, registerAdapter: (_routes, value) => { adapter = value; return { replace() {} } } },
  }, { providers: { get: () => raw } })
  assert.equal(directory.filter(row => row.provider === 'cpa').length, 1)
  assert.deepEqual(directory.find(row => row.provider === 'cpa').settingsPath, ['providers', 'cpa'])
  assert.deepEqual(await discover({ provider: 'cpa', api: raw.cpa.api, baseURL: raw.cpa.baseURL }), [{ id: 'found', name: 'Discovered model' }])
  assert.deepEqual(discoveryCalls, [{ path: '/v1/models', authorization: 'Bearer fixture-key' }])
  const mapped = await adapter.resolveModel('cpa', 'mapped')
  assert.equal(mapped.context.contextWindow, 234567)
  assert.equal(mapped.defaultMaxTokens, 12345)
  assert.deepEqual(mapped.inputModalities, ['text'])
  assert.deepEqual(mapped.reasoning.efforts.map(row => row.id), ['off', 'high'])
  for (const [model, reasoningEffort, wire] of [['mapped', 'high', 'xhigh'], ['mapped', 'off', undefined], ['disabled', undefined, undefined], ['undeclared', undefined, undefined]]) {
    for await (const chunk of adapter.stream({ provider: 'cpa', model, reasoningEffort, maxTokens: 777,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'offline fixture' }] }] })) {
      if (chunk.type === 'error') assert.fail(JSON.stringify(chunk))
    }
    const request = calls.at(-1)
    assert.equal(request.path, '/v1/chat/completions')
    assert.equal(request.authorization, 'Bearer fixture-key')
    assert.equal(request.body.model, model)
    assert.equal(request.body.reasoning_effort, wire)
    assert.equal(request.body.max_completion_tokens ?? request.body.max_tokens, 777)
  }
  assert.equal(calls.length, 4)
  assert.deepEqual(raw, before, 'startup/catalog/stream must not rewrite saved declarations or credentials')
  assert.equal(Object.hasOwn(raw.cpa.models[2], 'reasoningEfforts'), false)
  assert.equal(raw.cpa.models[1].reasoningEfforts, false)
})

test('native Provider SettingsForms saves preserve cpa declarations across CAS, invalid edits and restart', async t => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { boot, loadProfileDirectory, readProfilePatches } = await import('@deepseek-ai/dsh-app-boot')
  const { default: ConfigEditor } = await import('@deepseek-ai/dsh-config-editor')
  const { default: SettingsForms } = await import('@deepseek-ai/dsh-settings')
  const { default: Llm } = await import('@deepseek-ai/dsh-llm')
  const piAi = await import('@deepseek-ai/dsh-llm-pi-ai')
  const home = mkdtempSync(join(tmpdir(), 'dsh-native-provider-'))
  const dir = join(home, 'profiles', 'web')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, dsh: { profile: { bundles: [] } } }))
  const configPath = join(dir, 'cordis.yml')
  const patchPath = join(dir, 'cordis.patch.yml')
  const original = { api: 'openai-responses', baseURL: 'https://example.invalid/v1', apiKeyEnv: 'CPA_API_KEY', models: [
    { id: 'mapped', input: ['text', 'image'], contextWindow: 234567, maxTokens: 12345, reasoningEfforts: { off: null, high: 'custom-high' } },
    { id: 'disabled', reasoningEfforts: false }, { id: 'inherited' },
  ] }
  writeFileSync(configPath, '[]\n')
  writeFileSync(patchPath, yaml.dump([{ insert: [{ id: 'llm-pi-ai', name: '@deepseek-ai/dsh-llm-pi-ai', config: { providers: { cpa: original } } }] }]))
  const { fileURLToPath } = await import('node:url')
  const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
  const profile = { name: 'web', dir, patchPath, home, installAnchor, overlays: [] }
  const open = async () => {
    const loaded = loadProfileDirectory('dsh', dir, installAnchor)
    return boot('dsh', configPath, readProfilePatches('dsh', profile, loaded), async ctx => {
      ctx.provide('profileContext', profile)
      ctx.loader.internal = { import: async name => { assert.equal(name, '@deepseek-ai/dsh-llm-pi-ai'); return piAi } }
      await ctx.plugin(ConfigEditor)
      await ctx.plugin(SettingsForms)
      await ctx.plugin(Llm)
    })
  }
  let ctx
  t.after(async () => { await ctx?.fiber.dispose(); rmSync(home, { recursive: true, force: true }) })
  ctx = await open()
  const descriptor = () => ctx.settings.describe().find(row => row.ns === 'llm-pi-ai')
  const initial = descriptor()
  assert.ok(initial)
  const initialEffective = structuredClone(initial.value.providers.cpa)
  assert.deepEqual(initialEffective.models.map(row => row.reasoningEfforts), original.models.map(row => row.reasoningEfforts))
  assert.equal(Object.hasOwn(initialEffective.models[2], 'reasoningEfforts'), false)
  // Cancelling a draft never submits a mutation.
  const cancelled = structuredClone(initial.value.providers.cpa)
  cancelled.models[0].reasoningEfforts.high = 'cancelled'
  assert.deepEqual(descriptor().value.providers.cpa, initialEffective)
  const revised = { ...structuredClone(original), api: 'openai-completions', baseURL: 'https://new.invalid/v1' }
  await ctx.settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', 'cpa'], value: revised }], initial.revision)
  assert.deepEqual(descriptor().value.providers.cpa, { ...initialEffective, api: revised.api, baseURL: revised.baseURL })
  const saved = readFileSync(patchPath, 'utf8')
  assert.deepEqual(yaml.load(saved).find(row => row.id === 'llm-pi-ai').config.providers.cpa, revised)
  await assert.rejects(ctx.settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', 'cpa', 'api'], value: 'openai-responses' }], initial.revision))
  assert.equal(readFileSync(patchPath, 'utf8'), saved)
  for (const bad of [{ id: 'bad', reasoningEfforts: { high: null } }, { id: 'bad', input: ['audio'] }]) {
    await assert.rejects(ctx.settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', 'cpa', 'models'], value: [bad] }], descriptor().revision))
    assert.equal(readFileSync(patchPath, 'utf8'), saved)
  }
  await ctx.fiber.dispose()
  ctx = await open()
  assert.deepEqual(descriptor().value.providers.cpa, { ...initialEffective, api: revised.api, baseURL: revised.baseURL })
  assert.deepEqual((await ctx.llm.resolveModelInfo('cpa', 'mapped')).reasoning.efforts.map(row => row.id), ['off', 'high'])
  const added = { api: 'openai-responses', baseURL: 'https://added.invalid/v1', apiKeyEnv: 'NEW_PROVIDER_KEY', models: [materializeModelInput({ id: 'new-model' })] }
  await ctx.settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', 'new-provider'], value: added }], descriptor().revision)
  const afterAdd = readFileSync(patchPath, 'utf8')
  assert.deepEqual(yaml.load(afterAdd).find(row => row.id === 'llm-pi-ai').config.providers.cpa, revised)
  assert.deepEqual(yaml.load(afterAdd).find(row => row.id === 'llm-pi-ai').config.providers['new-provider'], added)
  for (const layer of ['home', 'cli']) {
    const override = [{ id: 'llm-pi-ai', config: { providers: { cpa: { ...revised, baseURL: 'https://override.invalid/v1' }, 'new-provider': added } } }]
    if (layer === 'home') writeFileSync(join(home, 'cordis.patch.yml'), yaml.dump(override))
    else profile.overlays.push(...override)
    await assert.rejects(ctx.settings.mutate('llm-pi-ai', [{ op: 'set', path: ['providers', 'cpa', 'baseURL'], value: 'https://rejected.invalid/v1' }]), /overridden by a home patch or command-line overlay/)
    assert.equal(readFileSync(patchPath, 'utf8'), afterAdd)
    if (layer === 'home') rmSync(join(home, 'cordis.patch.yml'))
    else profile.overlays.length = 0
  }
})

test('native catalog reasoning inherits only on absence and stays disabled with false', async () => {
  for (const reasoningEfforts of [undefined, false]) {
    const model = { id: 'gpt-5', ...(reasoningEfforts === undefined ? {} : { reasoningEfforts }) }
    const original = structuredClone(model)
    let adapter
    mountPiAi({
      fiber: { entry: { options: { id: 'llm-pi-ai' } } }, inject() {}, on() {}, get() {},
      logger: { warn() {}, error() {} },
      llm: {
        registerConfigurableProviders: () => ({ replace() {} }), registerModelDiscovery() {},
        registerAdapter: (_routes, value) => { adapter = value; return { replace() {} } },
      },
    }, { providers: { get: () => ({ openai: { api: 'openai-completions', baseURL: 'https://example.invalid/v1', apiKeyEnv: 'FIXTURE_KEY', models: [model] } }) } })
    const resolved = await adapter.resolveModel('openai', model.id)
    assert.equal(resolved.reasoning !== undefined, reasoningEfforts === undefined)
    assert.deepEqual(model, original, 'catalog resolution must not rewrite absence or false')
  }
})
