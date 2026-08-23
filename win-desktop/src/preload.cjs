const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  platform: process.platform,
  /** Read the current desktop settings. */
  getSettings: () => ipcRenderer.invoke('desktop-settings:get'),
  /** Apply a partial settings update and persist. */
  setSettings: (patch) => ipcRenderer.invoke('desktop-settings:set', patch),
  /** Fetch the model list (live API with bounded local fallback). */
  fetchModels: () => ipcRenderer.invoke('desktop-settings:fetchModels'),
  /** Refresh the model catalog and return the resulting list. */
  refreshModels: () => ipcRenderer.invoke('desktop-settings:refreshModels'),
  /** Subscribe to settings changes from other windows. Returns an unsubscribe fn. */
  onSettingsChanged: (callback) => {
    const handler = (_event, settings) => callback(settings)
    ipcRenderer.on('desktop-settings:changed', handler)
    return () => ipcRenderer.removeListener('desktop-settings:changed', handler)
  },
})
