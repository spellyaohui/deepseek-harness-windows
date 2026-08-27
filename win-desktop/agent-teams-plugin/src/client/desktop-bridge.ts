import type {
  AgentTeamsProfilesSnapshot,
  TeamProfileConfig,
} from './profile-editor.ts'

export interface AgentTeamsProfileDocument {
  schemaVersion: 2
  profiles: Record<string, TeamProfileConfig>
}

export interface AgentTeamsDesktopBridge {
  getAgentTeamsProfiles?: () => Promise<AgentTeamsProfilesSnapshot | unknown>
  setAgentTeamsProfiles?: (
    profileDocument: AgentTeamsProfileDocument,
  ) => Promise<AgentTeamsProfilesSnapshot | unknown>
}

declare global {
  interface Window {
    dshDesktop?: AgentTeamsDesktopBridge
  }
}

/** Return the narrow host bridge used only by the embedded profile editor. */
export function getAgentTeamsDesktopBridge(): AgentTeamsDesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = window.dshDesktop
  if (
    bridge === undefined
    || typeof bridge.getAgentTeamsProfiles !== 'function'
    || typeof bridge.setAgentTeamsProfiles !== 'function'
  ) {
    return undefined
  }
  return bridge
}
