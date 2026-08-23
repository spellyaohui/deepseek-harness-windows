const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  platform: process.platform,
  /** Read the current desktop settings. */
  getSettings: () => ipcRenderer.invoke('desktop-settings:get'),
  /** Apply a partial settings update and persist. */
  setSettings: (patch) => ipcRenderer.invoke('desktop-settings:set', patch),
  /** Subscribe to settings changes from other windows. Returns an unsubscribe fn. */
  onSettingsChanged: (callback) => {
    const handler = (_event, settings) => callback(settings)
    ipcRenderer.on('desktop-settings:changed', handler)
    return () => ipcRenderer.removeListener('desktop-settings:changed', handler)
  },
})
