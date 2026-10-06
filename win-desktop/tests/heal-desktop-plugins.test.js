import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRuntimeResolution } from '@deepseek-ai/dsh-app-boot'
import {
  buildDshArgs,
  generateAgentTeamsPatch,
  resolveAgentTeamsPatch,
  resolveWinHideConsoleImport,
} from '../src/dsh-service.js'
import { rewriteDesktopConsoleSource } from '../src/win-hide-console-rewrite.js'

const PLUGINS = [
  '@deepseek-ai/dsh-app-boot',
  '@nanmicoder/dsh-agent-teams',
  '@deepseek-ai/dsh-tool-call-guidance',
  'dsh-output-limit-finish',
]

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))

function makeHome() {
  const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-heal-'))
  const profileDir = join(home, 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({ name: 'dsh-profile-web', private: true }))
  return { home, profileDir }
}

test('profile directory cannot resolve desktop plugins before healing', () => {
  const { home, profileDir } = makeHome()
  try {
    const require = createRequire(join(profileDir, 'package.json'))
    for (const plugin of PLUGINS) {
      assert.throws(() => require.resolve(plugin), { code: 'MODULE_NOT_FOUND' })
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('official runtime resolution includes desktop plugins without writing profile links', async () => {
  const { home, profileDir } = makeHome()
  try {
    const resolution = await createRuntimeResolution({
      installAnchor: fileURLToPath(new URL('../package.json', import.meta.url)),
      home,
    })
    const require = createRequire(join(profileDir, 'package.json'))
    for (const plugin of PLUGINS) {
      const entry = resolution.entries.find(entry => entry.name === plugin)
      assert.equal(entry?.scope, 'installation')
      const resolved = join(entry.packageDir, 'package.json')
      const expected = fileURLToPath(import.meta.resolve(`${plugin}/package.json`))
      assert.equal(resolved, expected)
      assert.throws(() => require.resolve(plugin), { code: 'MODULE_NOT_FOUND' })
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('desktop preload supplies the wrapper anchor to the real official profile launcher', () => {
  const profileBootUrl = import.meta.resolve('@deepseek-ai/dsh/lib/profile-boot.js')
  const result = spawnSync(process.execPath, [
    '--expose-internals', '--import', resolveWinHideConsoleImport(), '--input-type=module', '-e',
    `import { INSTALL_ANCHOR } from ${JSON.stringify(profileBootUrl)}; console.log(INSTALL_ANCHOR)`,
  ], { encoding: 'utf8', windowsHide: true })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), fileURLToPath(new URL('../package.json', import.meta.url)))
})

test('the pinned Electron runtime loads the real host native loader and desktop installation anchor offline', () => {
  const require = createRequire(import.meta.url)
  const electronRoot = dirname(require.resolve('electron/package.json'))
  const executable = join(electronRoot, 'dist', readFileSync(join(electronRoot, 'path.txt'), 'utf8').trim())
  assert.ok(existsSync(executable), 'prepare the pinned Electron binary outside the offline gate')
  const profileBootUrl = import.meta.resolve('@deepseek-ai/dsh/lib/profile-boot.js')
  const builtinPath = require.resolve('node-addon-require-builtin')
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'ComSpec', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))
  const result = spawnSync(executable, [
    '--import', resolveWinHideConsoleImport(), '--input-type=module', '-e',
    `import { createRequire } from 'node:module';
     import { INSTALL_ANCHOR } from ${JSON.stringify(profileBootUrl)};
     const require = createRequire(import.meta.url);
     const loader = require(${JSON.stringify(builtinPath)}).requireBuiltin('internal/modules/esm/loader');
     if (typeof loader.getOrInitializeCascadedLoader !== 'function') throw new Error('host internal loader unavailable');
     console.log(JSON.stringify({ version: process.versions.electron, anchor: INSTALL_ANCHOR }));`,
  ], { cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', windowsHide: true, timeout: 30000 })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  const runtime = JSON.parse(result.stdout.trim())
  assert.equal(runtime.version, packageJson.devDependencies.electron)
  assert.equal(packageLock.packages['node_modules/electron'].version, runtime.version)
  assert.equal(runtime.anchor, fileURLToPath(new URL('../package.json', import.meta.url)))
})

test('the profile-anchor rewrite is scoped, idempotent, and refuses anchor drift', () => {
  const source = 'const INSTALL_ANCHOR = fileURLToPath(new URL("../package.json", import.meta.url));'
  const url = 'file:///fixture/node_modules/@deepseek-ai/dsh/lib/profile-boot-fixture.js'
  const rewritten = rewriteDesktopConsoleSource(source, url)
  assert.equal(rewritten, `const INSTALL_ANCHOR = ${JSON.stringify(fileURLToPath(new URL('../package.json', import.meta.url)))};`)
  assert.equal(rewriteDesktopConsoleSource(rewritten, url), rewritten)
  assert.equal(rewriteDesktopConsoleSource(source, pathToFileURL('C:/fixture/other/index.js').href), source)
  assert.throws(() => rewriteDesktopConsoleSource('', url), /installation anchor drift/)
  assert.throws(() => rewriteDesktopConsoleSource(`${source}\n${source}`, url), /installation anchor drift/)
})

test('dsh web args retain the Windows picker overlay and keep desktop defaults out of CLI overlays', () => {
  const args = buildDshArgs('entry.js', {
    platform: 'win32',
    windowsPickerPatch: 'picker.patch.yml',
    agentTeamsPatch: 'desktop.patch.yml',
    winHideConsoleImport: 'hide-console.mjs',
  })
  assert.equal(args[0], '--import')
  assert.equal(args[1], 'hide-console.mjs')
  assert.deepEqual(args.filter(value => value.endsWith('.patch.yml')), [
    'picker.patch.yml',
  ])
  assert.doesNotMatch(JSON.stringify(args), /auto-mode/i)
  assert.match(resolveAgentTeamsPatch(), /config[\\/]agent-teams\.patch\.yml$/)
  assert.ok(args.includes('--no-open'))
})

test('wrapper dependency graph contains no AUTO plugin', () => {
  assert.equal(packageJson.dependencies['@nanmicoder/dsh-auto-mode'], undefined)
  assert.equal(packageLock.packages['node_modules/@nanmicoder/dsh-auto-mode'], undefined)
})

test('desktop shell declares dsh-app-boot as a direct runtime dependency', () => {
  const hostBoot = 'file:../upstream/dsh-v0.2.0-rc.2/tarballs/dsh/deepseek-ai-dsh-app-boot-0.2.0-rc.2.tgz'
  assert.equal(packageJson.dependencies['@deepseek-ai/dsh-app-boot'], hostBoot)
  assert.equal(packageLock.packages[''].dependencies['@deepseek-ai/dsh-app-boot'], hostBoot)
  assert.equal(packageLock.packages['node_modules/@deepseek-ai/dsh-app-boot']?.version, '0.2.0-rc.2')
})

test('desktop shell declares the boot loader runtime closure directly', () => {
  for (const [name, version] of [['js-yaml', '4.3.1'], ['argparse', '2.0.1']]) {
    assert.equal(packageJson.dependencies[name], version)
    assert.equal(packageLock.packages[''].dependencies[name], version)
    assert.equal(packageLock.packages[`node_modules/${name}`]?.version, version)
  }
})

test('wrapper contains no AgentTeams migration handshake or legacy patch surface', () => {
  const dshServiceSource = readFileSync(new URL('../src/dsh-service.js', import.meta.url), 'utf8')
  const mainSource = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
  assert.doesNotMatch(dshServiceSource, /legacyDesktopSettings|migration-status|confirmAgentTeamsMigration|applyConfirmedAgentTeamsMigration|removeLegacyAgentTeamsSettings/)
  assert.doesNotMatch(mainSource, /confirmAgentTeamsMigration|applyConfirmedAgentTeamsMigration|removeLegacyAgentTeamsSettings|migration-status/)
})

test('generated AgentTeams patch ignores removed legacy model settings', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-agent-teams-yaml-'))
  const legacy = {
    agentTeamsMemberProvider: 'provider #1: "quoted"',
    agentTeamsMemberModel: 'model\\path\nnext: value',
    agentTeamsMemberReasoningEffort: 'effort: #"quoted"',
  }
  try {
    const patchPath = generateAgentTeamsPatch({
      getSettings: () => legacy,
      getUserDataPath: () => home,
    })
    const patch = readFileSync(patchPath, 'utf8')
    assert.doesNotMatch(patch, /legacyDesktopSettings|provider #1|model\\path|reasoningEffort/)
    assert.doesNotMatch(patch, /session-markdown-export/)
    assert.match(patch, /memberProvider: spawn/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
