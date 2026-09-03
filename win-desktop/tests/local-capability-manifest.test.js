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
const agentTeamsPackage = require('../agent-teams-plugin/package.json')
const modelsPackage = require('../models-settings-plugin/package.json')

const localDependencies = {
  '@deepseek-ai/dsh-client-ui-settings-models': 'models-settings-plugin',
  '@deepseek-ai/dsh-cpa-provider': 'cpa-provider-plugin',
  '@deepseek-ai/dsh-desktop-settings': 'desktop-settings-plugin',
  '@deepseek-ai/dsh-opencode-capabilities': 'opencode-capabilities-plugin',
  '@deepseek-ai/dsh-session-markdown-export': 'session-markdown-export-plugin',
  '@deepseek-ai/dsh-tool-call-guidance': 'tool-call-guidance-plugin',
  '@nanmicoder/dsh-agent-teams': 'agent-teams-plugin',
}

const localVersions = {
  '@deepseek-ai/dsh-client-ui-settings-models': '0.1.2-alpha.2-desktop.1',
  '@deepseek-ai/dsh-cpa-provider': '0.1.7',
  '@deepseek-ai/dsh-desktop-settings': '0.1.2',
  '@deepseek-ai/dsh-opencode-capabilities': '0.1.2',
  '@deepseek-ai/dsh-session-markdown-export': '0.1.1',
  '@deepseek-ai/dsh-tool-call-guidance': '0.1.0',
  '@nanmicoder/dsh-agent-teams': '0.1.15-desktop.4',
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
  assert.equal(packageJson.version, '0.1.2-rc.4')
  assert.equal(packageLock.version, '0.1.2-rc.4')
  assert.equal(packageLock.packages[''].version, '0.1.2-rc.4')
  assert.equal(modelsPackage.version, '0.1.2-alpha.2-desktop.1')
  assert.equal(
    packageLock.packages['node_modules/@deepseek-ai/dsh-client-ui-settings-models']?.version,
    '0.1.2-alpha.2-desktop.1',
  )
  assert.equal(agentTeamsPackage.version, '0.1.15-desktop.4')
  assert.equal(
    packageLock.packages['node_modules/@nanmicoder/dsh-agent-teams']?.version,
    '0.1.15-desktop.4',
  )

  for (const [dependency, directory] of Object.entries(localDependencies)) {
    const fileReference = `file:${directory}`
    assert.equal(packageJson.dependencies[dependency], fileReference, `${dependency} must use its local owner`)
    assert.equal(
      packageLock.packages['']?.dependencies?.[dependency],
      fileReference,
      `${dependency} root lock dependency must use its local owner`,
    )
    assert.notEqual(
      packageLock.packages[`node_modules/${dependency}`]?.link,
      true,
      `${dependency} must be packed as a real dependency instead of a development link`,
    )

    const manifestPath = join(wrapperRoot, directory, 'package.json')
    assert.equal(existsSync(manifestPath), true, `${directory}/package.json must remain present`)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    assert.equal(manifest.name, dependency, `${directory} must keep its package identity`)
    assert.equal(manifest.version, localVersions[dependency], `${directory} version must match this release`)
    assert.equal(
      packageLock.packages[`node_modules/${dependency}`]?.version,
      localVersions[dependency],
      `${dependency} installed version must match its local owner`,
    )
  }

  for (const directory of sourcePluginDirectories) {
    const manifest = JSON.parse(read(`${directory}/package.json`))
    assert.equal(typeof manifest.scripts?.build, 'string', `${directory} must keep its build gate`)
    assert.equal(typeof manifest.scripts?.test, 'string', `${directory} must keep its test gate`)
  }

  assertFile('desktop-settings-plugin/lib/client.js')
  assertFile('tests/desktop-settings-plugin.test.js')
  assertFile('opencode-capabilities-plugin/lib/client.js')
  assertFile('tests/opencode-capabilities-integration.test.js')
  assertFile('tool-call-guidance-plugin/lib/index.js')
  assertFile('tests/tool-call-guidance.test.js')
  assertFile('agent-teams-plugin/lib/status-render.js')
})

test('behavioral regressions and ownership records cannot be silently deleted', () => {
  const requiredFiles = [
    '../AGENTS.md',
    '../docs/UPSTREAM_MAINTENANCE.md',
    '../docs/UPSTREAM_ALPHA2_SOURCE_MANIFEST.md',
    'release-notes/v0.1.2-rc.4.md',
    'scripts/verify-alpha2-source.mjs',
    'scripts/verify-alpha2-runtime-closure.mjs',
    'scripts/verify-alpha2-zip-closure.mjs',
    'tests/alpha2-source-manifest.test.js',
    'tests/verify-alpha2-runtime-closure.test.js',
    'tests/verify-alpha2-zip-closure.test.js',
    'models-settings-plugin/UPSTREAM.md',
    'models-settings-plugin/src/client/model-input.ts',
    'models-settings-plugin/tests/model-input.test.js',
    'models-settings-plugin/tests/model-input-ui.test.js',
    'models-settings-plugin/tests/models-card-slot.test.js',
    'models-settings-plugin/tests/capability-ui.test.js',
    'models-settings-plugin/tests/models-section-availability.test.js',
    'models-settings-plugin/tests/output-link-safety.test.js',
    'models-settings-plugin/scripts/detach-output-links.mjs',
    'cpa-provider-plugin/tests/capacity.test.js',
    'cpa-provider-plugin/tests/client-registration.test.js',
    'cpa-provider-plugin/tests/migration.test.js',
    'cpa-provider-plugin/tests/profile.test.js',
    'cpa-provider-plugin/tests/reasoning.test.js',
    'agent-teams-plugin/UPSTREAM.md',
    'agent-teams-plugin/release-notes/v0.1.15-desktop.4.md',
    'agent-teams-plugin/src/status-render.ts',
    'agent-teams-plugin/scripts/clean-build.mjs',
    'agent-teams-plugin/scripts/fallback-tdd.mjs',
    'agent-teams-plugin/scripts/member-failure-tdd.mjs',
    'agent-teams-plugin/scripts/web-routes-verify.mjs',
    'agent-teams-plugin/scripts/lifecycle-verify.mjs',
    'agent-teams-plugin/scripts/quality-gates-tdd.mjs',
    'agent-teams-plugin/scripts/selection-policy-verify.mjs',
    'agent-teams-plugin/src/web-routes.ts',
    'agent-teams-plugin/scripts/settings-verify.mjs',
    'agent-teams-plugin/src/client/StagingPlanEditor.tsx',
    'agent-teams-plugin/src/profiles.ts',
    'agent-teams-plugin/src/quality-gates.ts',
    'session-markdown-export-plugin/tests/client-controller.test.js',
    'session-markdown-export-plugin/tests/content.test.js',
    'session-markdown-export-plugin/tests/http.test.js',
    'session-markdown-export-plugin/tests/render-markdown.test.js',
    'session-markdown-export-plugin/tests/session-export.test.js',
    'scripts/sync-local-plugin-artifacts.mjs',
    'tests/agent-teams-integration.test.js',
    'tests/cpa-provider-integration.test.js',
    'tests/desktop-settings.test.js',
    'tests/dsh-web-auth-url.test.js',
    'tests/grep-tool-argument-compatibility.test.js',
    'tests/heal-desktop-plugins.test.js',
    'tests/model-fetcher.test.js',
    'tests/model-capability-probe-integration.test.js',
    'tests/opencode-capabilities-integration.test.js',
    'tests/opencode-stream-rewrite.test.js',
    'tests/session-markdown-export-integration.test.js',
    'tests/subagent-settings-card-visibility.test.js',
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
  assertContains('../AGENTS.md', /AgentTeams `v0\.1\.15-desktop\.4` interaction invariants/)
  assertContains('../AGENTS.md', /Models settings fork `v0\.1\.1-rc\.2-desktop\.6` interaction invariants/)
  assertContains('../AGENTS.md', /Calling it for a running\s+Team returns structured `already_running` guidance with zero plan writes/)
  assertContains('../AGENTS.md', /Completion with `changedPaths: \[\]` requires a non-empty `noChangesReason`/)
  assertContains('../docs/UPSTREAM_MAINTENANCE.md', /AgentTeams incidents that must not recur/)
  assertContains('../docs/UPSTREAM_MAINTENANCE.md', /tdd\.edit-plan\.running-team-returns-guidance-without-tool-error/)
  assertContains('../AGENTS.md', /exact `grep` argument alias/)
  assertContains('../docs/UPSTREAM_MAINTENANCE.md', /provider-neutral `grep` argument alias normalization/i)
  assertContains('../AGENTS.md', /Wrapper tool-call guidance/)
  assertContains('../docs/UPSTREAM_MAINTENANCE.md', /tool-call guidance/i)
  assertContains('../docs/UPSTREAM_MAINTENANCE.md', /blank optional Profile/i)
  assertContains('../AGENTS.md', /Alpha\.2 Web authentication startup invariant/)
  assertContains('../docs/UPSTREAM_MAINTENANCE.md', /authenticated startup URL/i)
  for (const relativePath of ['../README.md', 'README.md', '../docs/UPSTREAM_MAINTENANCE.md']) {
    assert.doesNotMatch(read(relativePath), /@nanmicoder\/dsh-auto-mode|Auto Mode/)
  }
  assert.doesNotMatch(read('../AGENTS.md'), /@nanmicoder\/dsh-auto-mode|必须整合 Auto 和 AgentTeams|id: auto-permission-mode/)

  assertContains('models-settings-plugin/src/client/ModelsSection.tsx', /settings\.models\.provider-card/)
  assertContains('models-settings-plugin/src/client/ModelsSection.tsx', /settings\.models\.footer/)
  assertContains('models-settings-plugin/src/client/model-input.ts', /ImageInputChoice = 'auto' \| 'image' \| 'text-only'/)
  assertContains('models-settings-plugin/src/client/ModelListEditor.tsx', /applyImageInputChoiceToAll\(models, 'image'\)/)
  assertContains('models-settings-plugin/src/client/ModelListEditor.tsx', /applyImageInputChoiceToAll\(models, 'auto'\)/)
  assertContains('models-settings-plugin/src/client/ModelListEditor.tsx', /modelCapabilities\.probe/)
  assertContains('models-settings-plugin/src/client/ModelListEditor.tsx', /applyCapabilityProbeResult/)
  assertContains('models-settings-plugin/src/client/ModelListEditor.tsx', /capabilityOverwrite/)
  assertContains('models-settings-plugin/src/client/models-section-availability.ts', /createLateBoundCapabilityRemote/)
  assertContains('models-settings-plugin/src/client/models-section-availability.ts', /ctx\.get\('remote\.model-capabilities'\)/)
  assertContains('../AGENTS.md', /Missing or delayed Remote state must leave the Models page/)
  assertContains('models-settings-plugin/scripts/detach-output-links.mjs', /ERROR_USER_MAPPED_FILE|os error 1224/)

  assertContains('cpa-provider-plugin/src/client/index.tsx', /normalize-provider-profile/)
  assertContains('cpa-provider-plugin/src/client/index.tsx', /provider !== 'cpa'/)
  assertContains('cpa-provider-plugin/src/client/capacity.ts', /contextWindow/)
  assertContains('cpa-provider-plugin/src/client/capacity.ts', /maxTokens/)
  assertContains('cpa-provider-plugin/src/migration.ts', /hasCurrentCpaDefaultInput/)
  assertContains('cpa-provider-plugin/tests/migration.test.js', /does not reinterpret current automatic CPA models/)
  assertContains('tests/cpa-provider-integration.test.js', /round-trip automatic and invalid model input states/)

  assertContains('agent-teams-plugin/src/host-model-catalog.ts', /buildHostModelCatalog/)
  assertContains('agent-teams-plugin/src/selection-policy.ts', /input\.reasoningMode === 'explicit'/)
  assertContains('agent-teams-plugin/src/selection-policy.ts', /input\.role\.reasoningMode === 'route-aware'/)
  assertContains('agent-teams-plugin/src/scheduler.ts', /omit the assignee property entirely/)
  assertContains('agent-teams-plugin/src/tools.ts', /members cannot set assignee when claiming a task/)
  assertContains('agent-teams-plugin/src/tools.ts', /name: 'agent_teams_edit_plan'/)
  assertContains('agent-teams-plugin/src/tools.ts', /status: 'already_running'/)
  assertContains('agent-teams-plugin/src/tools.ts', /assignee !== CAPTAIN_KEY/)
  assertContains('agent-teams-plugin/src/quality-gates.ts', /every deliverable path must be covered by inScope/)
  assertContains('agent-teams-plugin/src/quality-gates.ts', /actual workspace-relative POSIX path/)
  assertContains('agent-teams-plugin/src/quality-gates.ts', /empty changedPaths requires noChangesReason/)
  assertContains('agent-teams-plugin/src/quality-gates.ts', /Normalize blank optional values on new tool input/)
  assertContains('agent-teams-plugin/src/members.ts', /Record a final turn failure, never an intermediate request retry/)
  assertContains('agent-teams-plugin/src/members.ts', /await child\.whenIdle\(\)/)
  assertContains('agent-teams-plugin/scripts/member-failure-tdd.mjs', /final agent\/error fails only the matching attempt/)
  assertContains('agent-teams-plugin/src/status-render.ts', /Task outputs omitted in summary/)
  assertContains('agent-teams-plugin/src/tools.ts', /wake === 'recover'/)
  assertContains('agent-teams-plugin/src/command.ts', /approval="required"/)
  assertContains('agent-teams-plugin/src/client/ActivityPanel.tsx', /ACTIVITY_HALT_URL/)
  assertContains('agent-teams-plugin/package.json', /@deepseek-ai\/dsh-client-ui-model-selection/)
  assertContains('agent-teams-plugin/README.md', /reasoning_mode: target-default/)
  assertContains('agent-teams-plugin/README.md', /schemaVersion: 2/)
  assertContains('agent-teams-plugin/README.md', /shared Harness catalog/)
  assert.doesNotMatch(read('agent-teams-plugin/README.md'), /`memberModel` is only a model default for all members/)
  assert.doesNotMatch(read('agent-teams-plugin/README.md'), /there is no per-member model or reasoning prompt/)
  assertContains('agent-teams-plugin/UPSTREAM.md', /schemaVersion: 2/)
  assertContains('agent-teams-plugin/UPSTREAM.md', /rejected rather than loaded or\s+migrated/)

  assertContains('desktop-settings-plugin/lib/client.js', /name: 'settings\.section'/)
  assertContains('desktop-settings-plugin/lib/client.js', /id: 'desktop'/)
  assertContains('session-markdown-export-plugin/src/client/index.tsx', /conversation\.session\.header\.utilities/)
  assertContains('session-markdown-export-plugin/src/http.ts', /\/api\/session\.export-markdown/)

  assertContains('src/win-hide-console-rewrite.js', /normalizeRedundantEscalationArgs/)
  assertContains('src/win-hide-console-rewrite.js', /@deepseek-ai\/dsh-tool-fs/)
  assertContains('src/win-hide-console-rewrite.js', /windowsHide/)
  assertContains('src/win-hide-console-rewrite.js', /Stream ended without finish_reason/)
  assertContains('src/win-hide-console-rewrite.js', /normalizeOpenCodeKimiToolSchema/)
  assertContains('src/win-hide-console-rewrite.js', /normalizeKnownToolArgumentAliases/)
  assertContains('src/win-hide-console-rewrite.js', /rewriteKnownToolArgumentAliases/)
  assertContains('src/win-hide-console-rewrite.js', /rewriteDesktopClientBundle/)
  assertContains('src/win-hide-console-rewrite.js', /__windows_hidden_subagent/)
  assertContains('src/win-hide-console-rewrite.js', /x-opencode-session/)
  assertContains('../AGENTS.md', /hide only the native Subagent plugin settings card/i)
  assertContains('../docs/UPSTREAM_MAINTENANCE.md', /native Subagent plugin settings card/i)
  for (const dependency of [
    '@deepseek-ai/dsh-subagent',
    '@deepseek-ai/dsh-subagent-fork-in-process',
    '@deepseek-ai/dsh-subagent-in-process-driver',
    '@deepseek-ai/dsh-subagent-spawn-in-process',
  ]) {
    assert.equal(typeof packageJson.dependencies[dependency], 'string')
    assert.equal(typeof packageLock.packages['']?.dependencies?.[dependency], 'string')
    assert.equal(typeof packageLock.packages[`node_modules/${dependency}`]?.version, 'string')
  }
  assertContains('src/model-fetcher.js', /OPENCODE_GO_PROTOCOL_PROFILES/)
  assertContains('src/model-fetcher.js', /OPENCODE_GO_COMPATIBILITY_INPUTS/)
  assertContains('src/model-fetcher.js', /reconcileOpencodeCatalog/)
  assertContains('opencode-capabilities-plugin/lib/client.js', /settings\.models\.footer/)
  assertContains('src/preload.cjs', /opencode-capabilities:validate/)
  assertContains('src/settings-window.js', /validateOpencodeCatalog/)
  assertContains('scripts/sync-local-plugin-artifacts.mjs', /LOCAL_PLUGIN_ARTIFACTS/)
  assertContains('tool-call-guidance-plugin/lib/index.js', /desktop:tool-call-guidance/)
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
  assert.equal(
    packageJson.scripts?.['verify:runtime-closure'],
    'node scripts/verify-alpha2-runtime-closure.mjs --from node_modules',
    'package.json must retain the source runtime-closure check',
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
  assert.match(runner, /pnpm_config_verify_deps_before_run:\s*'false'/)
  assert.match(runner, /\[upstream-regression\] START/)
  assert.match(runner, /\[upstream-regression\] PASS/)
  assert.match(runner, /\[upstream-regression\] FAIL/)
  assert.match(runner, /sync:local-plugin-artifacts/)
  assert.match(runner, /verify-alpha2-runtime-closure\.mjs/)
  assert.match(runner, /command === 'node' \? process\.execPath/)
  assert.doesNotMatch(runner, /\b(?:install|publish|dist:win|electron-builder)\b/)
})
