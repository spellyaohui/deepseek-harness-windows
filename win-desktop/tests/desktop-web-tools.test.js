import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import Web from '@deepseek-ai/dsh-web'
import { createScope } from '@deepseek-ai/dsh-scope'
import { buildDshEnvironment } from '../src/dsh-service.js'

const require = createRequire(import.meta.url)
const toolUrl = pathToFileURL(require.resolve('@deepseek-ai/dsh-tool-web')).href
const officialSource = readFileSync(new URL(toolUrl), 'utf8')
const storeUrl = new URL('../src/desktop-settings.js', import.meta.url)

async function storeAt(directory) {
  // Execute the real store; substitute only Electron's userData boundary.
  const source = readFileSync(storeUrl, 'utf8')
    .replace("import * as electron from 'electron'", `const electron = { app: { getPath: () => ${JSON.stringify(directory)} } }`)
    .replace("'./agent-teams-profile-store.js'", JSON.stringify(new URL('../src/agent-teams-profile-store.js', import.meta.url).href))
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`)
}

test('real settings store defaults on, persists opt-out, and retains unrelated data across restart', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-web-settings-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const store = await storeAt(directory)
  assert.equal(store.getDesktopSettings().builtinWebToolsEnabled, true)
  store.setDesktopSettings({ closeBehavior: 'tray', unrelated: { value: 'keep' } })
  store.setDesktopSettings({ builtinWebToolsEnabled: false })
  const reopened = await storeAt(directory)
  assert.equal(reopened.getDesktopSettings().builtinWebToolsEnabled, false)
  assert.equal(reopened.getDesktopSettings().closeBehavior, 'tray')
  assert.deepEqual(reopened.getDesktopSettings().unrelated, { value: 'keep' })
  reopened.setDesktopSettings({ builtinWebToolsEnabled: true })
  assert.equal((await storeAt(directory)).getDesktopSettings().builtinWebToolsEnabled, true)
})

test('old settings and malformed enablement use the compatible enabled default', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-web-settings-old-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  for (const document of [{ closeBehavior: 'tray' }, { builtinWebToolsEnabled: 'false', keep: 9 }]) {
    writeFileSync(join(directory, 'desktop-settings.json'), JSON.stringify(document))
    const store = await storeAt(directory)
    assert.equal(store.getDesktopSettings().builtinWebToolsEnabled, true)
    if (document.keep) assert.equal(store.getDesktopSettings().keep, 9)
  }
})

test('invalid IPC values and write failures cannot change the committed preference', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-web-settings-failure-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const store = await storeAt(directory)
  store.setDesktopSettings({ builtinWebToolsEnabled: false })
  const before = readFileSync(join(directory, 'desktop-settings.json'), 'utf8')
  for (const invalid of [null, 0, 1, '', 'false', {}, []]) {
    assert.throws(() => store.setDesktopSettings({ builtinWebToolsEnabled: invalid }), /boolean/)
    assert.equal(readFileSync(join(directory, 'desktop-settings.json'), 'utf8'), before)
  }
  rmSync(join(directory, 'desktop-settings.json'))
  mkdirSync(join(directory, 'desktop-settings.json'))
  assert.throws(() => store.setDesktopSettings({ builtinWebToolsEnabled: true }))
  assert.equal(store.getDesktopSettings().builtinWebToolsEnabled, false)
})

test('desktop launch snapshots the setting and overrides inherited process flags', () => {
  assert.equal(buildDshEnvironment({}, '/desktop.yml', {}).DSH_DESKTOP_BUILTIN_WEB_TOOLS, '1')
  assert.equal(buildDshEnvironment({ DSH_DESKTOP_BUILTIN_WEB_TOOLS: '1' }, '/desktop.yml', { builtinWebToolsEnabled: false }).DSH_DESKTOP_BUILTIN_WEB_TOOLS, '0')
  assert.equal(buildDshEnvironment({ DSH_DESKTOP_BUILTIN_WEB_TOOLS: '0' }, '/desktop.yml', { builtinWebToolsEnabled: true }).DSH_DESKTOP_BUILTIN_WEB_TOOLS, '1')
})

test('package-specific rewrite is idempotent, preserves other packages, and rejects upstream drift', async () => {
  const { rewriteDesktopWebToolsSource } = await import('../src/desktop-web-tools.js')
  const rewritten = rewriteDesktopWebToolsSource(officialSource, toolUrl)
  assert.notEqual(rewritten, officialSource)
  assert.equal(rewriteDesktopWebToolsSource(rewritten, toolUrl), rewritten)
  for (const url of ['file:///custom/tool-web/lib/index.js', 'file:///node_modules/@other/tool-web/lib/index.js', 'file:///node_modules/@deepseek-ai/dsh-web/lib/index.js']) {
    assert.equal(rewriteDesktopWebToolsSource(officialSource, url), officialSource)
  }
  assert.throws(() => rewriteDesktopWebToolsSource(officialSource.replace('function apply(ctx, config) {', 'function changed(ctx, config) {'), toolUrl), /drift/)
})

test('production preload loader applies the opt-out at the installed package boundary', async () => {
  const { load } = await import('../src/win-hide-console-loader.mjs')
  const result = await load(toolUrl, {}, async () => ({ format: 'module', source: Buffer.from(officialSource) }))
  assert.equal(result.shortCircuit, true)
  assert.match(result.source, /DSH_DESKTOP_BUILTIN_WEB_TOOLS/)
  assert.equal((await load('file:///custom/tool-web/index.js', {}, async () => ({ format: 'module', source: officialSource }))).source, officialSource)
})

test('actual loader removes only official web tools and guidance from host, preset and child scopes', async t => {
  const { rewriteDesktopWebToolsSource } = await import('../src/desktop-web-tools.js')
  const previous = process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS
  const hook = registerHooks({ load(url, context, nextLoad) {
    const result = nextLoad(url, context)
    if (url !== toolUrl) return result
    return { ...result, source: rewriteDesktopWebToolsSource(String(result.source), url) }
  } })
  t.after(() => { hook.deregister(); if (previous === undefined) delete process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS; else process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS = previous })
  const ToolWeb = await import(toolUrl)
  for (const enabled of [false, true]) {
    process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS = enabled ? '1' : '0'
    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt, {})
      await ctx.plugin(Tools, { mode: 'native' })
      await ctx.plugin(Web, {})
      const controller = ctx.inject(['tools', 'web', 'systemPrompt'], async runtime => {
        runtime.web.registerFetchProvider({ id: 'offline', available: () => true, async fetch(request) { return { url: request.url, statusCode: 200, body: { kind: 'text', content: 'service retained' }, truncated: false } } })
        runtime.tools.register(defineContentToolFixture({ name: 'independent_tool', description: 'Independent tool', parameters: {}, async execute() { return [{ type: 'text', text: 'ok' }] } }))
        const scopes = []
        for (const name of ['standard', 'cordis', 'team-member']) {
          const key = {}
          const scope = createScope(runtime, key)
          scopes.push(scope)
          await scope.ctx.plugin(ToolWeb, { search: true, fetch: true })
          const expected = enabled ? ['independent_tool', 'web_fetch', 'web_search'] : ['independent_tool']
          assert.deepEqual(runtime.tools.schemas(key).map(tool => tool.name).sort(), expected, name)
          const prompt = await runtime.systemPrompt.assemble({ scope: key })
          assert.deepEqual(prompt.tools.map(tool => tool.name).sort(), expected, name)
          if (!enabled) assert.equal(prompt.sections.some(section => /web_search|web_fetch/.test(section.text)), false)
        }
        // Host and late-mounted tool instances use the same exact package boundary.
        const host = runtime.plugin(ToolWeb, { search: true, fetch: true })
        await host
        assert.equal(runtime.tools.schemas().some(tool => tool.name === 'web_search'), enabled)
        assert.equal((await runtime.web.fetch({ url: 'https://offline.invalid/' })).body.content, 'service retained')
        const independent = await runtime.tools.execute({ callId: 'independent-1', name: 'independent_tool', arguments: {}, signal: new AbortController().signal })
        assert.equal(independent.isError, false)
        if (!enabled) {
          const removed = await runtime.tools.execute({ callId: 'web-1', name: 'web_fetch', arguments: { url: 'https://offline.invalid/' }, signal: new AbortController().signal })
          assert.equal(removed.isError, true)
          assert.equal(removed.error.info.code, 'UNKNOWN_TOOL')
          // An independent registration with the same name is also untouched:
          // the feature has no global tool-name filter or execution denial.
          runtime.tools.register(defineContentToolFixture({ name: 'web_fetch', description: 'Independent provider', parameters: {}, async execute() { return [{ type: 'text', text: 'independent provider retained' }] } }))
          const other = await runtime.tools.execute({ callId: 'other-web-1', name: 'web_fetch', arguments: {}, signal: new AbortController().signal })
          assert.equal(other.isError, false)
          assert.equal(other.content[0].text, 'independent provider retained')
        }
        await host.dispose()
        for (const scope of scopes) await scope.dispose()
        if (enabled) {
          const explicitOff = runtime.plugin(ToolWeb, { search: false, fetch: false })
          await explicitOff
          assert.deepEqual(runtime.tools.schemas().map(tool => tool.name), ['independent_tool'])
        }
      })
      await controller
    } finally { await ctx.fiber.dispose() }
  }
})
