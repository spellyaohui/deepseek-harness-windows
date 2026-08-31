import { app, BrowserWindow, Tray, Menu, dialog, nativeImage, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { startDshService } from './dsh-service.js'
import { createWindowOptions, resolveAppIcon } from './window-options.js'
import { loadDesktopSettings, getDesktopSettings } from './desktop-settings.js'
import { installSettingsIpc } from './settings-window.js'
import { prepareOpencodeCatalog } from './model-fetcher.js'

const APP_NAME = 'DeepSeek Harness'
const connectingPage = fileURLToPath(new URL('./connecting.html', import.meta.url))

let mainWindow
let service
let serviceUrl
let tray
/** Whether the user explicitly requested quit (tray menu or Cmd+Q). */
let quitting = false

/**
 * The desktop settings surface is registered as a native DSH settings section
 * by the bundled client plugin. Keep all desktop preferences inside the main
 * settings modal instead of injecting a second floating control.
 */
app.setName(APP_NAME)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.deepseek.harness.windows')
}

// Load settings early so close-to-tray behavior is available from the first
// window close event.
loadDesktopSettings()
installSettingsIpc()

function pinInstallerIcon(win) {
  const iconPath = resolveAppIcon()
  if (!iconPath) return
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return
  const apply = () => {
    if (!win.isDestroyed()) win.setIcon(image)
  }
  apply()
  // Web UI 的 favicon 会覆盖窗口图标，这里强制改回安装包 ICO。
  win.webContents.on('page-favicon-updated', apply)
  win.webContents.on('did-finish-load', apply)
}

/**
 * Create the system-tray icon with a context menu. The tray is created once
 * and recreated only if the icon image changes. The menu offers Show/Hide,
 * Settings, and Quit — the same affordances as the taskbar entry.
 */
function createTray() {
  const iconPath = resolveAppIcon()
  if (iconPath === undefined) return
  const image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) return

  tray = new Tray(image)
  tray.setToolTip(APP_NAME)

  const rebuildMenu = () => {
    const settings = getDesktopSettings()
    const closeToTray = settings.closeBehavior === 'tray'
    const menu = Menu.buildFromTemplate([
      {
        label: '显示主窗口',
        click: () => showMainWindow(),
      },
      {
        label: '隐藏到托盘',
        enabled: mainWindow !== undefined && !mainWindow?.isDestroyed(),
        click: () => hideMainWindow(),
      },
      { type: 'separator' },
      {
        label: '打开设置',
        click: () => openMainSettings(),
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ])
    tray.setContextMenu(menu)
  }

  tray.on('click', () => {
    // Single-click toggles visibility (Windows convention).
    if (mainWindow === undefined || mainWindow.isDestroyed()) return
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      const settings = getDesktopSettings()
      if (settings.closeBehavior === 'tray') hideMainWindow()
      else showMainWindow()
    } else {
      showMainWindow()
    }
  })

  rebuildMenu()

}

function showMainWindow() {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function hideMainWindow() {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  mainWindow.hide()
}

function openMainSettings() {
  showMainWindow()
  if (mainWindow === undefined || mainWindow.isDestroyed()) return
  void mainWindow.webContents.executeJavaScript(`
    (() => {
      const trigger = document.querySelector('button[aria-haspopup="dialog"]');
      if (!trigger) return false;
      trigger.click();
      return true;
    })()
  `)
}

function createWindow() {
  if (process.platform === 'win32') Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow(createWindowOptions())
  pinInstallerIcon(mainWindow)

  if (process.platform === 'win32') {
    mainWindow.setMenu(null)
    mainWindow.setMenuBarVisibility(false)
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL()
    if (!currentUrl) return
    try {
      if (new URL(url).origin !== new URL(currentUrl).origin && !url.startsWith('file:')) {
        event.preventDefault()
        void shell.openExternal(url)
      }
    } catch {
      event.preventDefault()
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Close-to-tray: when closeBehavior is "tray", intercept the close event
  // and hide the window instead of letting it destroy. The app stays alive
  // in the tray. A user-initiated quit (tray menu or before-quit) bypasses
  // this by setting `quitting = true` first.
  mainWindow.on('close', (event) => {
    if (quitting) return
    const settings = getDesktopSettings()
    if (settings.closeBehavior === 'tray') {
      event.preventDefault()
      hideMainWindow()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = undefined
  })

  void mainWindow.loadFile(connectingPage)
}

async function launch() {
  createWindow()

  const catalog = await prepareOpencodeCatalog()
  if (catalog.hydrationError !== undefined) {
    console.warn(`[main] persisted OpenCode catalog hydration skipped: ${catalog.hydrationError}`)
  }
  if (catalog.error !== undefined) {
    console.warn(`[main] OpenCode model sync skipped: ${catalog.error}`)
  } else if (catalog.added > 0) {
    console.log(`[main] OpenCode catalog prepared: +${catalog.added} model(s)`)
  }
  if (quitting) return

  service = await startDshService({
    electronExecutable: process.execPath,
    environment: {
      ...process.env,
      NODE_OPTIONS: '',
      DSH_DESKTOP: '1',
    },
  })

  try {
    serviceUrl = await service.ready
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(serviceUrl)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await dialog.showMessageBox({
      type: 'error',
      title: `${APP_NAME} 启动失败`,
      message: '无法启动 DeepSeek Harness 本地服务。',
      detail: message,
    })
    app.quit()
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(() => {
    createTray()
    return launch()
  })
}

// With close-to-tray, the main window hides instead of closing, so
// window-all-closed would fire only on an explicit quit. Keep the standard
// behavior for non-darwin: quit when no windows remain.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  quitting = true
  service?.stop()
})
