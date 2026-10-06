/**
 * Main-process IPC for the desktop settings section rendered inside the DSH
 * settings modal. There is intentionally no second BrowserWindow here.
 */
import { BrowserWindow, ipcMain, dialog } from 'electron'
import { open } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { validateEncryptedBackup, MAX_BACKUP_BYTES } from '@deepseek-ai/dsh-desktop-settings/backup'
import {
  getAgentTeamsProfiles,
  getDesktopSettings,
  setAgentTeamsProfiles,
  setDesktopSettings,
} from './desktop-settings.js'

/** Whether IPC handlers have been registered (once per process). */
let ipcInstalled = false

function broadcastSettings(next) {
  // Notify every interested window so the main window can react.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && win.webContents !== undefined) {
      win.webContents.send('desktop-settings:changed', next)
    }
  }
}

export function installSettingsIpc(getServiceUrl = () => undefined) {
  if (ipcInstalled) return
  ipcInstalled = true
  ipcMain.handle('desktop-settings:get', () => getDesktopSettings())
  ipcMain.handle('desktop-settings:set', (_event, patch) => {
    const next = setDesktopSettings(patch)
    broadcastSettings(next)
    return next
  })
  ipcMain.handle('agent-teams-profiles:get', () => getAgentTeamsProfiles())
  ipcMain.handle('agent-teams-profiles:set', (_event, profileDocument) => {
    const snapshot = setAgentTeamsProfiles(profileDocument)
    broadcastSettings(getDesktopSettings())
    return snapshot
  })
  const trustedWindow = event => {
    const serviceUrl = getServiceUrl()
    const frame = event.senderFrame
    if (!serviceUrl || !frame || frame !== event.sender.mainFrame || new URL(frame.url).origin !== new URL(serviceUrl).origin) throw new Error('此操作仅可在本地应用主窗口使用')
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) throw new Error('应用窗口不可用')
    return window
  }
  ipcMain.handle('configuration-backup:save', async (event, encrypted) => {
    const window = trustedWindow(event)
    validateEncryptedBackup(encrypted)
    const selected = await dialog.showSaveDialog(window, { title: '导出配置备份', defaultPath: `DSH-配置备份-${new Date().toISOString().slice(0, 10)}.dshbackup`, filters: [{ name: 'DSH 加密配置备份', extensions: ['dshbackup'] }] })
    if (selected.canceled || !selected.filePath) return { canceled: true }
    trustedWindow(event)
    await writeFileAtomic(selected.filePath, encrypted, { mode: 0o600 })
    return { canceled: false }
  })
  ipcMain.handle('configuration-backup:open', async event => {
    const window = trustedWindow(event)
    const selected = await dialog.showOpenDialog(window, { title: '导入配置备份', properties: ['openFile'], filters: [{ name: 'DSH 加密配置备份', extensions: ['dshbackup'] }] })
    if (selected.canceled || !selected.filePaths[0]) return { canceled: true }
    trustedWindow(event)
    const file = await open(selected.filePaths[0], 'r')
    try {
      const stat = await file.stat()
      if (!stat.isFile() || stat.size > MAX_BACKUP_BYTES) throw new Error('备份文件过大或格式无效')
      const buffer = Buffer.alloc(MAX_BACKUP_BYTES + 1)
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0)
      const encrypted = buffer.subarray(0, bytesRead).toString('utf8')
      validateEncryptedBackup(encrypted)
      return { canceled: false, encrypted }
    } finally { await file.close() }
  })
}
