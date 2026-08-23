const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopSettings', {
  get: () => ipcRenderer.invoke('desktop-settings:get'),
  set: (patch) => ipcRenderer.invoke('desktop-settings:set', patch),
  /** Fetch the model list for the dropdown (live API → catalog fallback). */
  fetchModels: () => ipcRenderer.invoke('desktop-settings:fetchModels'),
  /** Sync the catalog from the API and return the updated model list. */
  refreshModels: () => ipcRenderer.invoke('desktop-settings:refreshModels'),
})
