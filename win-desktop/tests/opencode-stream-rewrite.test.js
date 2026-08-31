import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rewriteDesktopConsoleSource,
  rewriteOpenCodeKimiToolSchemas,
  rewriteOpenCodeMissingFinishReason,
  rewriteOpenCodeGoSessionAffinity,
} from '../src/win-hide-console-rewrite.js'

const source = readFileSync(
  new URL('../node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js', import.meta.url),
  'utf8',
)
const responsesSource = readFileSync(
  new URL('../node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js', import.meta.url),
  'utf8',
)
const url = 'file:///x/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js'

test('recovers complete OpenCode tool streams that omit finish_reason', () => {
  const direct = rewriteOpenCodeMissingFinishReason(source)
  assert.notEqual(direct, source)
  const rewritten = rewriteDesktopConsoleSource(source, url)
  assert.match(rewritten, /model\.provider === "opencode-go"/)
  assert.match(rewritten, /output\.stopReason = output\.content\.some/)
  assert.match(rewritten, /"toolUse"/)
  assert.doesNotMatch(rewritten, /if \(!hasFinishReason\) \{\s*throw new Error\("Stream ended without finish_reason"\);\s*\}/)
  assert.equal(rewriteDesktopConsoleSource(rewritten, url), rewritten)
})

test('normalizes OpenCode Go Kimi tool schemas before Pi serializes the request', () => {
  const rewritten = rewriteOpenCodeKimiToolSchemas(source)

  assert.notEqual(rewritten, source)
  assert.match(rewritten, /function normalizeOpenCodeKimiToolSchema\(schema\)/)
  assert.match(rewritten, /model\.provider === "opencode-go"/)
  assert.match(rewritten, /model\.id\.toLowerCase\(\)\.includes\("kimi"\)/)
  assert.match(rewritten, /return \{ \$ref: schema\.\$ref \}/)
  assert.match(rewritten, /Array\.isArray\(normalized\.items\)/)
  assert.match(rewritten, /convertTools\(activeTools, compat, model\)/)
  assert.match(rewritten, /convertTools\(deferredTools, compat, model\)/)
  assert.equal(rewriteOpenCodeKimiToolSchemas(rewritten), rewritten)
})

test('adds OpenCode Go session affinity even when prompt-cache retention is disabled', () => {
  const rewritten = rewriteOpenCodeGoSessionAffinity(source)

  assert.notEqual(rewritten, source)
  assert.match(rewritten, /compat\.sendSessionAffinityHeaders \|\| model\.provider === "opencode-go"/)
  assert.match(rewritten, /headers\["x-opencode-session"\] = sessionId/)
  assert.match(rewritten, /const clientSessionId = model\.provider === "opencode-go" \? options\?\.sessionId : cacheSessionId/)
  assert.match(rewritten, /createClient\(model, context, apiKey, options\?\.headers, options\?\.fetch, clientSessionId, compat\)/)
  assert.equal(rewriteOpenCodeGoSessionAffinity(rewritten), rewritten)
})

test('adds the same session affinity to the OpenAI Responses route used by Muse Spark', () => {
  const rewritten = rewriteOpenCodeGoSessionAffinity(responsesSource)

  assert.notEqual(rewritten, responsesSource)
  assert.match(rewritten, /model\.provider === "opencode-go"/)
  assert.match(rewritten, /headers\["x-opencode-session"\] = sessionId/)
  assert.match(rewritten, /const clientSessionId = model\.provider === "opencode-go" \? options\?\.sessionId : cacheSessionId/)
  assert.match(rewritten, /createClient\(model, context, apiKey, options\?\.headers, options\?\.fetch, clientSessionId\)/)
  assert.equal(rewriteOpenCodeGoSessionAffinity(rewritten), rewritten)
})

test('loader applies the OpenCode stream compatibility rewrite to the real module', () => {
  const hook = new URL('../src/win-hide-console.mjs', import.meta.url).href
  const fixture = fileURLToPath(new URL('./fixtures/import-opencode-stream-under-guard.mjs', import.meta.url))
  const result = spawnSync(process.execPath, ['--import', hook, fixture], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    windowsHide: true,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /opencode-stream-loader-ok/)
})

test('loader removes Kimi-incompatible tool fields from the actual Pi payload', () => {
  const hook = new URL('../src/win-hide-console.mjs', import.meta.url).href
  const fixture = fileURLToPath(new URL('./fixtures/capture-opencode-kimi-payload-under-guard.mjs', import.meta.url))
  const result = spawnSync(process.execPath, ['--import', hook, fixture], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    windowsHide: true,
  })

  assert.equal(result.status, 0, result.stderr)
  const payload = JSON.parse(result.stdout)
  const parameters = payload.tools[0].function.parameters
  assert.equal('strict' in payload.tools[0].function, false)
  assert.deepEqual(parameters.properties.target, { $ref: '#/$defs/target' })
  assert.deepEqual(parameters.properties.choices.items, { type: 'string' })
})

test('loader sends OpenCode Go session affinity and leaves generic providers unchanged', () => {
  const hook = new URL('../src/win-hide-console.mjs', import.meta.url).href
  const fixture = fileURLToPath(new URL('./fixtures/capture-opencode-session-headers-under-guard.mjs', import.meta.url))
  const result = spawnSync(process.execPath, ['--import', hook, fixture], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    windowsHide: true,
  })

  assert.equal(result.status, 0, result.stderr)
  const requests = JSON.parse(result.stdout)
  assert.equal(requests.length, 3)
  assert.deepEqual(requests.map(({ provider, session }) => ({ provider, session })), [
    { provider: 'opencode-go', session: 'harness-session-k3' },
    { provider: 'opencode-go', session: 'harness-session-muse' },
    { provider: 'openai', session: null },
  ])
})
