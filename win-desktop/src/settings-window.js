/**
 * Main-process IPC for the desktop settings section rendered inside the DSH
 * settings modal. There is intentionally no second BrowserWindow here.
 */
import { BrowserWindow, ipcMain } from 'electron'
import { getDesktopSettings, setDesktopSettings } from './desktop-settings.js'
import { getOpencodeModelList, syncOpencodeCatalog } from './model-fetcher.js'

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
  // Fetch the live model list for the settings dropdown. Tries the OpenCode
  // API first, falls back to the static catalog.
  ipcMain.handle('desktop-settings:fetchModels', async () => {
    try {
      return await getOpencodeModelList()
    } catch (error) {
      return { models: [], source: 'error', error: String(error) }
    }
  })
  // Refresh the catalog from the API and persist new models, then return the
  // full list. Used by the "刷新" button in the settings window.
  ipcMain.handle('desktop-settings:refreshModels', async () => {
    try {
      const result = await syncOpencodeCatalog()
      return {
        models: result.models,
        added: result.added,
        error: result.error,
      }
    } catch (error) {
      return { models: [], added: 0, error: String(error) }
    }
  })
}
