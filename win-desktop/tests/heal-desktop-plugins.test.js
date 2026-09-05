import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import {
  buildDshArgs,
  generateAgentTeamsPatch,
  healDesktopPluginFallback,
  resolveAgentTeamsPatch,
  resolveDesktopInstallAnchor,
} from '../src/dsh-service.js'

const PLUGINS = [
  '@deepseek-ai/dsh-app-boot',
  '@nanmicoder/dsh-agent-teams',
  '@deepseek-ai/dsh-session-markdown-export',
  '@deepseek-ai/dsh-opencode-capabilities',
  '@deepseek-ai/dsh-tool-call-guidance',
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

test('healing the desktop install anchor makes desktop plugins resolvable from the profile', async () => {
  const { home, profileDir } = makeHome()
  try {
    await healDesktopPluginFallback({
      installAnchor: resolveDesktopInstallAnchor(),
      home,
    })
    const require = createRequire(join(profileDir, 'package.json'))
    for (const plugin of PLUGINS) {
      const resolved = require.resolve(`${plugin}/package.json`)
      const expected = fileURLToPath(import.meta.resolve(`${plugin}/package.json`))
      assert.equal(resolved, expected)
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('service launch awaits Alpha.2 module healing before spawning dsh', () => {
  const source = readFileSync(new URL('../src/dsh-service.js', import.meta.url), 'utf8')
  assert.match(source, /export async function startDshService/)
  const heal = source.indexOf('await healDesktopPluginFallback')
  const spawn = source.indexOf('const child = spawn(')
  assert.ok(heal >= 0, 'service launch must await module fallback healing')
  assert.ok(spawn > heal, 'dsh must spawn only after module fallback healing settles')
})

test('dsh web args omit AUTO and retain the Windows and desktop patches', () => {
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
    'desktop.patch.yml',
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
  const alpha2Boot = 'file:../upstream/dsh-v0.1.2-rc.1/tarballs/dsh/deepseek-ai-dsh-app-boot-0.1.2-rc.1.tgz'
  assert.equal(packageJson.dependencies['@deepseek-ai/dsh-app-boot'], alpha2Boot)
  assert.equal(packageLock.packages[''].dependencies['@deepseek-ai/dsh-app-boot'], alpha2Boot)
  assert.equal(packageLock.packages['node_modules/@deepseek-ai/dsh-app-boot']?.version, '0.1.2-rc.1')
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
    assert.match(patch, /memberProvider: spawn/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
