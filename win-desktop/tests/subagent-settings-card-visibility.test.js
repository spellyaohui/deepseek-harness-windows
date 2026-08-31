import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import {
  rewriteDesktopClientBundle,
  rewriteDesktopClientModuleHostSource,
  rewriteDesktopConsoleSource,
} from '../src/win-hide-console-rewrite.js'

const require = createRequire(import.meta.url)
const SETTINGS_PLUGIN_ID = '@deepseek-ai/dsh-client-ui-settings-plugins'
const SETTINGS_CLIENT_PATH = require.resolve(`${SETTINGS_PLUGIN_ID}/client`)
const CLIENT_MODULES_PATH = require.resolve('@deepseek-ai/dsh-client-modules')
const SUBAGENT_KEY = 'key: SUBAGENT_MODEL_SELECTION_NS,'
const HIDDEN_KEY = 'key: "__windows_hidden_subagent",'

const settingsClientSource = readFileSync(SETTINGS_CLIENT_PATH, 'utf8')
const clientModulesSource = readFileSync(CLIENT_MODULES_PATH, 'utf8')

function occurrences(source, marker) {
  return source.split(marker).length - 1
}

test('official Subagent card key is hidden without moving source-map offsets', () => {
  assert.equal(Buffer.byteLength(SUBAGENT_KEY), Buffer.byteLength(HIDDEN_KEY))
  assert.equal(occurrences(settingsClientSource, SUBAGENT_KEY), 1)
  const rewritten = rewriteDesktopClientBundle(SETTINGS_PLUGIN_ID, Buffer.from(settingsClientSource))
  const text = rewritten.toString('utf8')
  assert.equal(occurrences(text, SUBAGENT_KEY), 0)
  assert.equal(occurrences(text, HIDDEN_KEY), 1)
  assert.equal(Buffer.byteLength(text), Buffer.byteLength(settingsClientSource))
  assert.equal(text.split('\n').length, settingsClientSource.split('\n').length)
  for (const key of ['key: SHELL_NS,', 'key: AGENT_LOOP_NS,', 'key: WEB_SEARCH_NS,']) {
    assert.equal(occurrences(text, key), 1)
  }
  assert.deepEqual(rewriteDesktopClientBundle(SETTINGS_PLUGIN_ID, rewritten), rewritten)
})

test('non-target client bundles are returned by identity', () => {
  const bundle = Buffer.from(settingsClientSource)
  assert.equal(rewriteDesktopClientBundle('@fixture/other-client', bundle), bundle)
})

test('missing and duplicate Subagent card anchors fail closed', () => {
  assert.throws(
    () => rewriteDesktopClientBundle(
      SETTINGS_PLUGIN_ID,
      Buffer.from(settingsClientSource.replace(SUBAGENT_KEY, 'key: DRIFTED_SUBAGENT_KEY,')),
    ),
    /Subagent settings card rewrite anchor drift/,
  )
  assert.throws(
    () => rewriteDesktopClientBundle(
      SETTINGS_PLUGIN_ID,
      Buffer.from(settingsClientSource.replace(SUBAGENT_KEY, `${SUBAGENT_KEY}\n${SUBAGENT_KEY}`)),
    ),
    /Subagent settings card rewrite anchor drift/,
  )
})

test('official client-modules Host snapshots rewrite initial and HMR bundle reads', () => {
  const rewritten = rewriteDesktopClientModuleHostSource(clientModulesSource)
  assert.match(rewritten, /function rewriteDesktopClientBundle\(id, bundle\)/)
  assert.match(rewritten, /rewriteDesktopClientBundle\(pkgName, readFileSync\(clientPath\)\)/)
  assert.match(rewritten, /rewriteDesktopClientBundle\(id, readFileSync\(record\.meta\.clientPath\)\)/)
  assert.equal(rewriteDesktopClientModuleHostSource(rewritten), rewritten)
  assert.equal(
    rewriteDesktopConsoleSource(clientModulesSource, pathToFileURL(CLIENT_MODULES_PATH).href),
    rewritten,
  )
  assert.equal(
    rewriteDesktopConsoleSource(
      clientModulesSource,
      'file:///fixture/@deepseek-ai/dsh-client-modules/lib/invariant.js',
    ),
    clientModulesSource,
  )
})
