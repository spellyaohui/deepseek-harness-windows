/**
 * Main-process IPC for the desktop settings section rendered inside the DSH
 * settings modal. There is intentionally no second BrowserWindow here.
 */
import { BrowserWindow, ipcMain } from 'electron'
import { getDesktopSettings, setDesktopSettings } from './desktop-settings.js'
import { validateOpencodeCatalog } from './model-fetcher.js'

/** Whether IPC handlers have been registered (once per process). */
let ipcInstalled = false

export function installSettingsIpc() {
  if (ipcInstalled) return
  ipcInstalled = true
  ipcMain.handle('desktop-settings:get', () => getDesktopSettings())
  ipcMain.handle('desktop-settings:set', (_event, patch) => {
    const next = setDesktopSettings(patch)
    // Notify every interested window so the main window can react.
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents !== undefined) {
        win.webContents.send('desktop-settings:changed', next)
      }
    }
    return next
  })
  ipcMain.handle('opencode-capabilities:validate', () => validateOpencodeCatalog())
}
