import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

// Installation tests run on a disposable Windows runner, never against a
// developer's installed app or user profile.
assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Run this acceptance check on a disposable GitHub Windows runner')
assert.equal(process.platform, 'win32')
const executable = resolve(process.argv[2])
const home = resolve(process.argv[3])
const report = resolve(process.argv[4] ?? join(home, 'acceptance.json'))
const wrapperVersion = process.argv[5] ?? JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const app = join(dirname(executable), 'resources/app')
assert.equal(JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).version, wrapperVersion)
assert.equal(JSON.parse(readFileSync(join(app, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version, '0.2.0-rc.2')
mkdirSync(home, { recursive: true })
const delay = ms => new Promise(resolveWait => setTimeout(resolveWait, ms))
let child, socket, output = '', errors = []

async function stop() {
  socket?.close()
  if (child?.exitCode === null) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  await delay(500)
}

async function launch() {
  output = ''
  const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  for (const key of Object.keys(env)) if (/(API_KEY|TOKEN|SECRET|PASSWORD)$/i.test(key)) delete env[key]
  child = spawn(executable, ['--remote-debugging-port=0'], { cwd: home, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', chunk => output += chunk.toString())
  child.stderr.on('data', chunk => output += chunk.toString())
  let target
  const start = Date.now()
  while (Date.now() - start < 90000 && child.exitCode === null) {
    const endpoint = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(output)
    if (endpoint) {
      const response = await fetch(`http://127.0.0.1:${endpoint[1]}/json/list`)
      target = (await response.json()).find(row => row.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+/.test(row.url))
      if (target) break
    }
    await delay(200)
  }
  assert.ok(target, 'Installed desktop must reach its real loopback Web UI')
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((done, reject) => { socket.onopen = done; socket.onerror = reject })
  let id = 0
  const pending = new Map()
  socket.onmessage = event => {
    const message = JSON.parse(String(event.data))
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
    const callback = pending.get(message.id)
    if (callback) { pending.delete(message.id); message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result) }
  }
  const send = (method, params = {}) => new Promise((resolveCall, reject) => {
    const callId = ++id
    pending.set(callId, { resolve: resolveCall, reject })
    socket.send(JSON.stringify({ id: callId, method, params }))
  })
  await send('Runtime.enable')
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 20000 })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text)
    return result.result.value
  }
  const rpc = async (method, args = {}) => {
    const payload = { type: 'client-request', rpcId: randomUUID(), method, payload: { args } }
    const reply = await evaluate(`(async()=>{ const response=await fetch('/api/'+${JSON.stringify(method)},{method:'POST',headers:{'content-type':'application/json'},body:${JSON.stringify(JSON.stringify(payload))}}); if(!response.ok)throw Error('Host HTTP '+response.status);return response.json();})()`)
    assert.equal(reply.result.ok, true, JSON.stringify(reply.result))
    return reply.result.value
  }
  let pageReady = false
  for (let attempt = 0; attempt < 80; attempt++) {
    pageReady = await evaluate(`Boolean(document.readyState !== 'loading' && document.body?.innerText.trim() && window.dshDesktop)`)
    if (pageReady) break
    await delay(250)
  }
  assert.equal(pageReady, true, 'The installed Web UI must finish loading and render visible content')
  assert.equal(await evaluate('Boolean(window.dshDesktop)'), true, 'Production preload bridge must mount')
  return { evaluate, rpc }
}

async function healthyPresets(rpc) {
  const roster = await rpc('agentPresets/list')
  assert.deepEqual(roster.presets.map(row => row.id).sort(), ['cordis', 'minimal', 'ptc', 'standard'])
  for (const row of roster.presets) assert.equal(row.broken, undefined, `${row.id}: ${row.broken}`)
}

try {
  let { evaluate, rpc } = await launch()
  assert.equal((await evaluate('window.dshDesktop.getSettings()')).builtinWebToolsEnabled, true)
  await healthyPresets(rpc)
  assert.ok((await rpc('llm/listProviders')).length > 0, 'Models catalogue must be usable on first run')
  const descriptor = (await rpc('settings/describe')).namespaces.find(row => row.ns === 'agent-teams')
  assert.ok(descriptor, 'AgentTeams settings must mount')
  const saved = await rpc('settings/replace', { ns: 'agent-teams', section: { delegationMode: 'native' }, expectedRevision: descriptor.revision })
  assert.equal(saved.value.delegationMode, 'native')
  assert.equal((await evaluate('window.dshDesktop.setSettings({builtinWebToolsEnabled:false})')).builtinWebToolsEnabled, false)
  await stop()
  ;({ evaluate, rpc } = await launch())
  assert.equal((await evaluate('window.dshDesktop.getSettings()')).builtinWebToolsEnabled, false)
  await healthyPresets(rpc)
  const reopened = (await rpc('settings/describe')).namespaces.find(row => row.ns === 'agent-teams')
  assert.equal(reopened.value.delegationMode, 'native')
  await stop()
  // Reproduce the reported legacy manual Web-service disable in this disposable
  // profile. No real-user YAML is read or changed.
  const patch = join(home, 'profiles/web/cordis.patch.yml')
  const legacy = readFileSync(patch, 'utf8') + '\n- id: web\n  disabled: true\n'
  writeFileSync(patch, legacy)
  ;({ evaluate, rpc } = await launch())
  await healthyPresets(rpc)
  assert.equal(readFileSync(patch, 'utf8'), legacy, 'Startup must preserve the user patch')
  const summary = { wrapper: wrapperVersion, harness: '0.2.0-rc.2', installedDesktopFirstRun: true, productionPreload: true, authenticatedModelsCatalogue: true, agentTeamsSaveAndRestart: true, webOptOutRestart: true, legacyDisabledWebPresets: true, userPatchPreserved: true, liveModelRequest: false, rendererExceptions: errors }
  assert.deepEqual(errors, [])
  mkdirSync(dirname(report), { recursive: true })
  writeFileSync(report, JSON.stringify(summary, null, 2) + '\n')
  console.log(JSON.stringify(summary))
} finally {
  await stop()
  // Keep failed-run evidence without exporting the Host's one-shot login token.
  mkdirSync(dirname(report), { recursive: true })
  writeFileSync(report + '.startup.log', output.replace(/\?token=[^\s"'<>]+/g, '?token=<redacted>'))
}
