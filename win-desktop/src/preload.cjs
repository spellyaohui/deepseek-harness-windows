const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  platform: process.platform,
  /** Read the current desktop settings. */
  getSettings: () => ipcRenderer.invoke('desktop-settings:get'),
  /** Apply a partial settings update and persist. */
  setSettings: (patch) => ipcRenderer.invoke('desktop-settings:set', patch),
  /** Read the persisted AgentTeams V2 profile snapshot and built-in names. */
  getAgentTeamsProfiles: () => ipcRenderer.invoke('agent-teams-profiles:get'),
  /** Validate, persist, and return the AgentTeams V2 profile snapshot. */
  setAgentTeamsProfiles: (profileDocument) => ipcRenderer.invoke('agent-teams-profiles:set', profileDocument),
  /** Reconcile verified OpenCode model capabilities; restart activates changes. */
  validateOpencodeCapabilities: () => ipcRenderer.invoke('opencode-capabilities:validate'),
  /** Subscribe to settings changes from other windows. Returns an unsubscribe fn. */
  onSettingsChanged: (callback) => {
    const handler = (_event, settings) => callback(settings)
    ipcRenderer.on('desktop-settings:changed', handler)
    return () => ipcRenderer.removeListener('desktop-settings:changed', handler)
  },
})
