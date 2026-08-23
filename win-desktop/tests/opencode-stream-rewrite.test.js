import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rewriteDesktopConsoleSource, rewriteOpenCodeMissingFinishReason } from '../src/win-hide-console-rewrite.js'

const source = readFileSync(
  new URL('../node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js', import.meta.url),
  'utf8',
)
const url = 'file:///x/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js'

test('recovers complete OpenCode tool streams that omit finish_reason', () => {
  const direct = rewriteOpenCodeMissingFinishReason(source)
  assert.notEqual(direct, source)
  const rewritten = rewriteDesktopConsoleSource(source, url)
  assert.match(rewritten, /model\.provider === "opencode-go"/)
  assert.match(rewritten, /output\.stopReason = blocks\.some/)
  assert.match(rewritten, /"toolUse"/)
  assert.doesNotMatch(rewritten, /if \(!hasFinishReason\) \{\s*throw new Error\("Stream ended without finish_reason"\);\s*\}/)
  assert.equal(rewriteDesktopConsoleSource(rewritten, url), rewritten)
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
