import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import yaml from 'js-yaml'
import { readFileSync as readText } from 'node:fs'

const clientSource = readFileSync(new URL('../desktop-settings-plugin/lib/client.js', import.meta.url), 'utf8')
const patchSource = readFileSync(new URL('../config/agent-teams.patch.yml', import.meta.url), 'utf8')
const serviceSource = readText(new URL('../src/dsh-service.js', import.meta.url), 'utf8')
const settingsWindowSource = readText(new URL('../src/settings-window.js', import.meta.url), 'utf8')
const preloadSource = readFileSync(new URL('../src/preload.cjs', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const npmrcUrl = new URL('../.npmrc', import.meta.url)
const npmrcSource = existsSync(npmrcUrl) ? readFileSync(npmrcUrl, 'utf8') : ''
const packageLock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))

test('desktop settings client registers a native settings section', () => {
  assert.match(clientSource, /id: 'desktop'/)
  assert.match(clientSource, /name: 'settings\.section'/)
  assert.match(clientSource, /ctx\.slots\.inject\('settings\.section'/)
  assert.match(clientSource, /窗口行为/)
  assert.doesNotMatch(clientSource, /保存设置/)
  assert.match(clientSource, /bridge\.setSettings\(\{ closeBehavior \}\)/)
  assert.match(clientSource, /setSaving\(true\)/)
  assert.match(clientSource, /setSettings\(previous\)/)
  assert.match(clientSource, /role: message\.startsWith\('保存失败'\) \? 'alert' : 'status'/)
  assert.doesNotMatch(clientSource, /子智能体模型|agentTeamsMemberModel|agentTeamsMemberReasoningEffort/)
  assert.doesNotMatch(preloadSource, /fetchModels|refreshModels/)
})

test('wrapper installs the local AgentTeams package', () => {
  assert.equal(packageJson.dependencies['@nanmicoder/dsh-agent-teams'], 'file:agent-teams-plugin')
})

test('wrapper packs the local AgentTeams package instead of linking its dev dependencies', () => {
  assert.equal(npmrcSource.trim(), 'install-links=true')
  const installed = packageLock.packages['node_modules/@nanmicoder/dsh-agent-teams']
  assert.notEqual(installed.link, true)
  assert.equal(installed.version, '0.1.14-desktop.2')
})

test('desktop settings plugin is included in the DSH patch graph', () => {
  const entries = yaml.load(patchSource)
    .flatMap((patch) => patch.insert ?? [])
  assert.ok(entries.some((entry) => entry.name === '@deepseek-ai/dsh-desktop-settings'))
  const agentTeams = entries.find((entry) => entry.id === 'agent-teams')
  assert.equal(agentTeams.config.profiles['software-delivery'].taskPlanning, 'captain')
  assert.deepEqual(
    agentTeams.config.profiles['software-delivery'].members.map((member) => member.name),
    ['analyst', 'implementer', 'tester', 'reviewer'],
  )
})

test('runtime-generated patch also includes the desktop settings plugin', () => {
  assert.match(serviceSource, /id: desktop-settings/)
  assert.match(serviceSource, /@deepseek-ai\/dsh-desktop-settings/)
  assert.match(serviceSource, /profiles:/)
  assert.match(serviceSource, /getAgentTeamsProfileSnapshot/)
})

test('profile editor bridge is narrow and lives beside existing settings IPC', () => {
  assert.match(settingsWindowSource, /agent-teams-profiles:get/)
  assert.match(settingsWindowSource, /agent-teams-profiles:set/)
  assert.match(preloadSource, /getAgentTeamsProfiles/)
  assert.match(preloadSource, /setAgentTeamsProfiles/)
})

test('desktop settings are only served through the Harness modal bridge and tab', () => {
  assert.equal(existsSync(new URL('../src/settings.html', import.meta.url)), false)
  assert.equal(existsSync(new URL('../src/settings-preload.cjs', import.meta.url)), false)
  assert.match(settingsWindowSource, /installSettingsIpc/)
  assert.match(clientSource, /label: \(\) => '桌面'/)
})
