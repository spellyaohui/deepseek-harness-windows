import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const wrapperRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
const repositoryRoot = dirname(wrapperRoot)
const packageJson = require('../package.json')
const packageLock = require('../package-lock.json')

const localDependencies = {
  '@deepseek-ai/dsh-client-ui-settings-models': 'models-settings-plugin',
  '@deepseek-ai/dsh-cpa-provider': 'cpa-provider-plugin',
  '@deepseek-ai/dsh-desktop-settings': 'desktop-settings-plugin',
  '@deepseek-ai/dsh-session-markdown-export': 'session-markdown-export-plugin',
  '@nanmicoder/dsh-agent-teams': 'agent-teams-plugin',
}

const sourcePluginDirectories = [
  'models-settings-plugin',
  'cpa-provider-plugin',
  'session-markdown-export-plugin',
  'agent-teams-plugin',
]

function read(relativePath) {
  return readFileSync(join(wrapperRoot, relativePath), 'utf8')
}

function assertFile(relativePath) {
  assert.equal(existsSync(join(wrapperRoot, relativePath)), true, `${relativePath} must remain present`)
}

function assertContains(relativePath, marker) {
  assert.match(read(relativePath), marker, `${relativePath} lost a critical capability marker`)
}

test('desktop composition retains every independently owned local plugin', () => {
  for (const [dependency, directory] of Object.entries(localDependencies)) {
    const fileReference = `file:${directory}`
    assert.equal(packageJson.dependencies[dependency], fileReference, `${dependency} must use its local owner`)
    assert.equal(
      packageLock.packages[`node_modules/${dependency}`]?.resolved,
      fileReference,
      `${dependency} lockfile entry must use its local owner`,
    )

    const manifestPath = join(wrapperRoot, directory, 'package.json')
    assert.equal(existsSync(manifestPath), true, `${directory}/package.json must remain present`)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert.equal(manifest.name, dependency, `${directory} must keep its package identity`)
  }

  for (const directory of sourcePluginDirectories) {
    const manifest = JSON.parse(read(`${directory}/package.json`))
    assert.equal(typeof manifest.scripts?.build, 'string', `${directory} must keep its build gate`)
    assert.equal(typeof manifest.scripts?.test, 'string', `${directory} must keep its test gate`)
  }

  assertFile('desktop-settings-plugin/lib/client.js')
  assertFile('tests/desktop-settings-plugin.test.js')
})

test('behavioral regressions and ownership records cannot be silently deleted', () => {
  const requiredFiles = [
    '../AGENTS.md',
    '../docs/UPSTREAM_MAINTENANCE.md',
    'models-settings-plugin/UPSTREAM.md',
    'models-settings-plugin/tests/models-card-slot.test.js',
    'cpa-provider-plugin/tests/capacity.test.js',
    'cpa-provider-plugin/tests/client-registration.test.js',
    'cpa-provider-plugin/tests/profile.test.js',
    'cpa-provider-plugin/tests/reasoning.test.js',
    'agent-teams-plugin/UPSTREAM.md',
    'agent-teams-plugin/scripts/lifecycle-verify.mjs',
    'agent-teams-plugin/scripts/selection-policy-verify.mjs',
    'agent-teams-plugin/scripts/settings-verify.mjs',
    'session-markdown-export-plugin/tests/client-controller.test.js',
    'session-markdown-export-plugin/tests/content.test.js',
    'session-markdown-export-plugin/tests/http.test.js',
    'session-markdown-export-plugin/tests/render-markdown.test.js',
    'session-markdown-export-plugin/tests/session-export.test.js',
    'scripts/sync-local-plugin-artifacts.mjs',
    'tests/agent-teams-integration.test.js',
    'tests/cpa-provider-integration.test.js',
    'tests/desktop-settings.test.js',
    'tests/heal-desktop-plugins.test.js',
    'tests/model-fetcher.test.js',
    'tests/opencode-stream-rewrite.test.js',
    'tests/session-markdown-export-integration.test.js',
    'tests/fixtures/fs-escalation-runtime.mjs',
    'tests/win-hide-console.test.js',
  ]

  for (const relativePath of requiredFiles) {
    const base = relativePath.startsWith('../') ? repositoryRoot : wrapperRoot
    const normalized = relativePath.startsWith('../') ? relativePath.slice(3) : relativePath
    assert.equal(existsSync(join(base, normalized)), true, `${relativePath} must remain present`)
  }
})

test('critical integration markers retain local capability ownership', () => {
  assertContains('models-settings-plugin/src/client/ModelsSection.tsx', /settings\.models\.card/)

  assertContains('cpa-provider-plugin/src/client/index.tsx', /normalize-provider-profile/)
  assertContains('cpa-provider-plugin/src/client/index.tsx', /provider !== 'cpa'/)
  assertContains('cpa-provider-plugin/src/client/capacity.ts', /contextWindow/)
  assertContains('cpa-provider-plugin/src/client/capacity.ts', /maxTokens/)

  assertContains('agent-teams-plugin/src/host-model-catalog.ts', /buildHostModelCatalog/)
  assertContains('agent-teams-plugin/src/selection-policy.ts', /memberReasoningMode === 'explicit'/)
  assertContains('agent-teams-plugin/src/selection-policy.ts', /memberReasoningMode === 'route-aware'/)
  assertContains('agent-teams-plugin/src/scheduler.ts', /omit the assignee property entirely/)
  assertContains('agent-teams-plugin/src/tools.ts', /members cannot set assignee when claiming a task/)

  assertContains('desktop-settings-plugin/lib/client.js', /name: 'settings\.section'/)
  assertContains('desktop-settings-plugin/lib/client.js', /id: 'desktop'/)
  assertContains('session-markdown-export-plugin/src/client/index.tsx', /conversation\.session\.header\.utilities/)
  assertContains('session-markdown-export-plugin/src/http.ts', /\/api\/session\.export-markdown/)

  assertContains('src/win-hide-console-rewrite.js', /normalizeRedundantEscalationArgs/)
  assertContains('src/win-hide-console-rewrite.js', /@deepseek-ai\/dsh-tool-fs/)
  assertContains('src/win-hide-console-rewrite.js', /windowsHide/)
  assertContains('src/win-hide-console-rewrite.js', /Stream ended without finish_reason/)
  assertContains('src/model-fetcher.js', /OPENCODE_GO_PROTOCOL_PROFILES/)
  assertContains('src/model-fetcher.js', /reconcileOpencodeCatalog/)
  assertContains('scripts/sync-local-plugin-artifacts.mjs', /LOCAL_PLUGIN_ARTIFACTS/)
})

test('the complete upstream regression gate remains registered', () => {
  assert.equal(
    packageJson.scripts?.['verify:upstream'],
    'node scripts/verify-upstream-regressions.mjs',
    'package.json must retain the upstream regression command',
  )
  assertFile('scripts/verify-upstream-regressions.mjs')
  assert.equal(
    packageJson.scripts?.['sync:local-plugin-artifacts'],
    'node scripts/sync-local-plugin-artifacts.mjs',
    'package.json must retain local plugin artifact synchronization',
  )
  const runner = read('scripts/verify-upstream-regressions.mjs')
  for (const directory of [
    'models-settings-plugin',
    'cpa-provider-plugin',
    'agent-teams-plugin',
    'session-markdown-export-plugin',
  ]) {
    assert.match(runner, new RegExp(`['\"]${directory}['\"]`), `${directory} must remain in the full gate`)
  }
  assert.match(runner, /spawnSync/)
  assert.match(runner, /stdio: 'inherit'/)
  assert.match(runner, /\[upstream-regression\] START/)
  assert.match(runner, /\[upstream-regression\] PASS/)
  assert.match(runner, /\[upstream-regression\] FAIL/)
  assert.match(runner, /sync:local-plugin-artifacts/)
  assert.doesNotMatch(runner, /\b(?:install|publish|dist:win|electron-builder)\b/)
})
