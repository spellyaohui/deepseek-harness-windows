import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeKnownToolArgumentAliases,
  rewriteDesktopConsoleSource,
  rewriteKnownToolArgumentAliases,
} from '../src/win-hide-console-rewrite.js'

const adapterUrl = new URL('../node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js', import.meta.url)
const adapterSource = readFileSync(adapterUrl, 'utf8')
const grepSource = readFileSync(
  new URL('../node_modules/@deepseek-ai/dsh-tool-fs-search/lib/index.js', import.meta.url),
  'utf8',
)
const toolCallEndBlock = `\t\tcase "toolcall_end":
\t\t\tyield {
\t\t\t\ttype: "block-end",
\t\t\t\tindex: event.contentIndex,
\t\t\t\tblock: {
\t\t\t\t\ttype: "tool-call",
\t\t\t\t\tid: CallId(event.toolCall.id),
\t\t\t\t\tname: event.toolCall.name,
\t\t\t\t\targuments: JSON.stringify(event.toolCall.arguments)
\t\t\t\t}
\t\t\t};
\t\t\tbreak;`

test('repairs the exact grep description alias without provider or model routing', () => {
  for (const route of ['woyaopro/gemini', 'cpa/gemini', 'future-provider/future-model']) {
    const malformed = {
      description: 'pattern: 请稍后重试',
      path: 'frontend/src',
      include: '*.tsx',
      route,
    }

    assert.deepEqual(normalizeKnownToolArgumentAliases('grep', malformed), {
      pattern: '请稍后重试',
      path: 'frontend/src',
      include: '*.tsx',
      route,
    })
    assert.deepEqual(malformed, {
      description: 'pattern: 请稍后重试',
      path: 'frontend/src',
      include: '*.tsx',
      route,
    })
  }

  assert.deepEqual(normalizeKnownToolArgumentAliases('grep', {
    description: '\t pattern \t: \t登录超时\t',
  }), { pattern: '登录超时' })
})

test('leaves every ambiguous or non-target shape for strict validation', () => {
  const valid = { pattern: '登录超时', description: 'pattern: wrong', path: 'frontend/src' }
  assert.equal(normalizeKnownToolArgumentAliases('grep', valid), valid)

  for (const [toolName, args] of [
    ['find', { description: 'pattern: 登录超时' }],
    ['grep', { description: 'search for 登录超时' }],
    ['grep', { description: 'pattern:   ' }],
    ['grep', { description: 'pattern: 登录超时\npath: frontend/src' }],
    ['grep', { description: 'prefix pattern: 登录超时' }],
    ['grep', null],
    ['grep', []],
  ]) {
    assert.equal(normalizeKnownToolArgumentAliases(toolName, args), args)
  }
})

test('the upstream grep schema still requires pattern', () => {
  assert.match(grepSource, /pattern:\s*\{\s*type: "string",\s*required: true,/)
})

test('rewrites the installed pi-ai adapter once at the durable tool-call boundary', () => {
  const rewritten = rewriteKnownToolArgumentAliases(adapterSource)

  assert.notEqual(rewritten, adapterSource)
  assert.match(rewritten, /function normalizeKnownToolArgumentAliases\(toolName, args\)/)
  assert.match(rewritten, /async function\* toStreamChunks\(events, contextWindow\)/)
  assert.doesNotMatch(rewritten, /toStreamChunks\(events, contextWindow, model\)/)
  assert.match(rewritten, /JSON\.stringify\(normalizeKnownToolArgumentAliases\(event\.toolCall\.name, event\.toolCall\.arguments\)\)/)
  assert.match(rewritten, /\}\), model\.contextWindow\)\[Symbol\.asyncIterator\]\(\)/)
  assert.doesNotMatch(rewritten, /model\.contextWindow, model/)
  assert.equal(rewriteKnownToolArgumentAliases(rewritten), rewritten)

  const routed = rewriteDesktopConsoleSource(adapterSource, pathToFileURL(fileURLToPath(adapterUrl)).href)
  assert.equal(routed, rewritten)
})

test('fails closed on ambiguous or drifted durable-boundary anchors', () => {
  const duplicateBlock = `${toolCallEndBlock}\n${adapterSource}`
  assert.equal(rewriteKnownToolArgumentAliases(duplicateBlock), duplicateBlock)

  const duplicateSignature = `async function* toStreamChunks(events, contextWindow) {}\n${adapterSource}`
  assert.equal(rewriteKnownToolArgumentAliases(duplicateSignature), duplicateSignature)

  const drifted = adapterSource.replace(
    'arguments: JSON.stringify(event.toolCall.arguments)',
    'arguments: JSON.stringify(event.toolCall.arguments ?? {})',
  )
  assert.equal(rewriteKnownToolArgumentAliases(drifted), drifted)
})

test('a detached argument-line decoy cannot steal the durable-boundary rewrite', () => {
  const decoy = 'const sample = "arguments: JSON.stringify(event.toolCall.arguments)";\n'
  const rewritten = rewriteKnownToolArgumentAliases(`${decoy}${adapterSource}`)

  assert.ok(rewritten.startsWith(decoy))
  assert.match(rewritten, /JSON\.stringify\(normalizeKnownToolArgumentAliases\(event\.toolCall\.name, event\.toolCall\.arguments\)\)/)
})

test('loader can import the rewritten installed pi-ai adapter', () => {
  const hook = new URL('../src/win-hide-console.mjs', import.meta.url).href
  const result = spawnSync(process.execPath, [
    '--import', hook,
    '--input-type=module',
    '--eval', "await import('@deepseek-ai/dsh-llm-pi-ai'); console.log('grep-tool-argument-loader-ok')",
  ], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    windowsHide: true,
  })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /grep-tool-argument-loader-ok/)
})
