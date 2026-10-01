import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import AgentPresets, { livePresetMounts } from '@deepseek-ai/dsh-agent-preset-registry'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Web from '@deepseek-ai/dsh-web'
import { rewriteDesktopWebToolsSource } from '../src/desktop-web-tools.js'

const require = createRequire(import.meta.url)
const toolUrl = pathToFileURL(require.resolve('@deepseek-ai/dsh-tool-web')).href

test('web opt-out keeps Loader-mounted presets usable when a user separately disables the web service', async t => {
  const previous = process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      const result = nextResolve(specifier, context)
      // A desktop restart loads a fresh module with its startup flag. Give
      // each flag its own ESM cache key while retaining the real Loader tree.
      if (result.url === toolUrl) return { ...result, url: `${toolUrl}?desktopWebStartup=${process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS}` }
      return result
    },
    load(url, context, nextLoad) {
      const result = nextLoad(url, context)
      if (!url.startsWith(`${toolUrl}?desktopWebStartup=`)) return result
      return { ...result, source: rewriteDesktopWebToolsSource(String(result.source), toolUrl) }
    }
  })
  t.after(() => {
    hook.deregister()
    if (previous === undefined) delete process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS
    else process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS = previous
  })
  for (const { enabled, webService } of [
    { enabled: true, webService: true },
    { enabled: false, webService: true },
    { enabled: false, webService: false },
    { enabled: true, webService: false }
  ]) {
    process.env.DSH_DESKTOP_BUILTIN_WEB_TOOLS = enabled ? '1' : '0'
    // Finish this startup snapshot's module job through Node's public loader
    // before Cordis's internal-loader adapter reads the same cached namespace.
    // A missing namespace is an import failure, not a pending plugin fiber.
    const startupToolWeb = await import(toolUrl)
    assert.equal(typeof startupToolWeb.apply, 'function')
    const ctx = new Context()
    try {
      await ctx.plugin(Loader)
      await ctx.plugin(SessionProjections)
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(Tools, { mode: 'native' })
      if (webService) await ctx.plugin(Web)
      await ctx.plugin(AgentPresets, { default: 'standard' })
      let entered = false
      const controller = ctx.inject(['agentPresets', 'loader', 'tools', 'systemPrompt'], async runtime => {
        entered = true
        // The real registry mounts this through a Loader EntryTree and audits
        // its plugin fibers, as the native Agent preset settings page does.
        const unregister = []
        try {
          for (const id of ['standard', 'ptc', 'cordis', 'minimal']) {
            unregister.push(await runtime.agentPresets.register({
              id,
              // Isolate the shared row causing the three native presets to
              // fail. Minimal has no web-tool row and remains a control.
              plugins: id === 'minimal' ? [] : [{ id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } }]
            }))
          }
          // Mirror the Host's settlement before the native roster read. The
          // preset trees are separate from the Host Loader tree, so await both.
          await runtime.loader.await()
          const mounts = livePresetMounts(ctx.root.fiber)
          assert.equal(mounts.length, 4, 'every registered preset must retain its Loader tree')
          await Promise.all(mounts.map(mount => mount.tree.await()))
          const roster = await runtime.agentPresets.list()
          assert.equal(roster.length, 4)
          for (const preset of roster) {
            const diagnostic = `${preset.id}, enabled=${enabled}, webService=${webService}: ${preset.broken}`
            if (enabled && !webService && preset.id !== 'minimal') {
              assert.match(preset.broken, /tool-web.*waiting for web/, diagnostic)
            } else {
              assert.equal(preset.broken, undefined, diagnostic)
            }
          }
          for (const mount of mounts) {
            const visible = runtime.tools.schemas(mount.key).map(tool => tool.name).sort()
            const expected = enabled && webService && mount.presetId !== 'minimal' ? ['web_fetch', 'web_search'] : []
            assert.deepEqual(visible, expected, mount.presetId)
            if (!enabled) {
              const prompt = await runtime.systemPrompt.assemble({ scope: mount.key })
              assert.equal(prompt.sections.some(section => /web_search|web_fetch/.test(section.text)), false)
            }
          }
          assert.equal(ctx.get('web') !== undefined, webService, 'the separate web service preference is preserved')
        } finally { for (const dispose of unregister.reverse()) await dispose() }
      })
      await controller
      assert.equal(entered, true, `required services must activate: ${Object.keys(controller.inject).filter(name => ctx.get(name) === undefined).join(', ')}`)
    } finally { await ctx.fiber.dispose() }
  }
})
