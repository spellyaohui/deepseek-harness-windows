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

/** Read historical desktop choices; Profile writes belong to official Settings/CAS. */
export function getAgentTeamsDesktopBridge(): AgentTeamsDesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined
  const bridge = window.dshDesktop
  if (
    bridge === undefined
    || typeof bridge.getAgentTeamsProfiles !== 'function'
  ) {
    return undefined
  }
  return bridge
}
