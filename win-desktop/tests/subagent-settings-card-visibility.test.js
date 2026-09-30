import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { rewriteDesktopConsoleSource } from '../src/win-hide-console-rewrite.js'

const require = createRequire(import.meta.url)
const CLIENT_MODULES_PATH = require.resolve('@deepseek-ai/dsh-client-modules')
const clientModulesSource = readFileSync(CLIENT_MODULES_PATH, 'utf8')

test('Native settings keep official initial and HMR client-module snapshots unmodified', () => {
  assert.equal(
    rewriteDesktopConsoleSource(clientModulesSource, pathToFileURL(CLIENT_MODULES_PATH).href),
    clientModulesSource,
  )
})

test('Native and AgentTeams client settings remain separately available', () => {
  for (const name of [
    '@deepseek-ai/dsh-client-ui-settings-subagent',
    '@nanmicoder/dsh-agent-teams',
  ]) {
    const clientPath = require.resolve(`${name}/client`)
    const source = readFileSync(clientPath, 'utf8')
    assert.ok(source.length > 0, `${name} must include its settings client`)
    assert.equal(rewriteDesktopConsoleSource(source, pathToFileURL(clientPath).href), source)
    if (name === '@nanmicoder/dsh-agent-teams') {
      assert.match(source, /['"]settings\.title['"]:\s*['"]AgentTeams 团队['"]/)
      assert.match(source, /['"]settings\.title['"]:\s*['"]AgentTeams['"]/)
    }
  }
  assert.ok(require.resolve('@deepseek-ai/dsh-subagent'))
  assert.ok(require.resolve('@deepseek-ai/dsh-tool-subagent'))
})
