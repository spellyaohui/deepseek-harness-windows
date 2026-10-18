const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')
const { spawnSync } = require('node:child_process')

const root = resolve(__dirname, '../..')
const home = process.env.DSH_TRAY_TEST_HOME
assert.ok(home)
app.setPath('userData', home)
app.commandLine.appendSwitch('disable-gpu')
let service, win
const delay = ms => new Promise(done => setTimeout(done, ms))
async function waitFor(check, label) {
  for (let i = 0; i < 80; i++) {
    if (await check()) return
    await delay(100)
  }
  throw new Error(label)
}
async function run() {
  await app.whenReady()
  const { startDshService } = await import(pathToFileURL(join(root, 'src/dsh-service.js')))
  const { installSettingsIpc } = await import(pathToFileURL(join(root, 'src/settings-window.js')))
  const environment = { ...process.env, DSH_HOME: home, HOME: home, USERPROFILE: home, DSH_TELEMETRY_DISABLED: '1' }
  for (const key of Object.keys(environment)) if (/(API_KEY|TOKEN|SECRET|PASSWORD)$/i.test(key)) delete environment[key]
  service = await startDshService({ electronExecutable: process.execPath, environment })
  const url = await service.ready
  installSettingsIpc(() => url)
  win = new BrowserWindow({ show: false, webPreferences: {
    offscreen: true, backgroundThrottling: false, contextIsolation: true,
    nodeIntegration: false, preload: join(root, 'src/preload.cjs'),
  } })
  await win.loadURL(url)
  const js = source => win.webContents.executeJavaScript(source)
  await waitFor(() => js(`Boolean(document.querySelector('button[aria-haspopup="menu"]'))`), 'native account launcher did not mount')
  await js(`for(const b of document.querySelectorAll('button'))if(['继续','Continue','稍后配置','Set up later','Later'].includes(b.innerText.trim()))b.click()`)
  await delay(300)
  await js(`for(const b of document.querySelectorAll('button'))if(['稍后配置','Set up later','Later'].includes(b.innerText.trim()))b.click()`)
  const isSettingsOpen = () => js(`Array.from(document.querySelectorAll('[role="dialog"] button')).some(b=>['通用设置','General','General settings'].includes(b.innerText.trim()))`)
  assert.equal(await isSettingsOpen(), false)
  // Execute the actual tray callback, without importing main.js and launching a second app.
  const source = readFileSync(join(root, 'src/main.js'), 'utf8')
  const body = source.match(/function openMainSettings\(\) \{([\s\S]*?)\n\}/)?.[1]
  assert.ok(body)
  const open = new Function('showMainWindow', 'mainWindow', body)
  open(() => {}, win)
  await waitFor(isSettingsOpen, 'tray action did not open the native settings shell')
  open(() => {}, win)
  await delay(200)
  assert.equal(await isSettingsOpen(), true, 'repeated tray actions must keep settings open')
  console.log('tray settings native shell PASS')
}
run().then(() => { process.exitCode = 0 }).catch(error => { console.error(error.stack); process.exitCode = 1 }).finally(() => {
  win?.destroy()
  if (service?.child?.exitCode === null) spawnSync('taskkill', ['/PID', String(service.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  app.exit(process.exitCode || 0)
})
