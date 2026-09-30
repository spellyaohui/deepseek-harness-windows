/** Stable AgentTeams business names; member exposure is derived from this complete list. */
export const TEAM_TOOL_NAMES = [
  'agent_teams_create',
  'agent_teams_approve',
  'agent_teams_edit_plan',
  'agent_teams_add_member',
  'agent_teams_remove_member',
  'agent_teams_create_task',
  'agent_teams_reassign_task',
  'agent_teams_claim_task',
  'agent_teams_update_task',
  'agent_teams_amend_task',
  'agent_teams_send_message',
  'agent_teams_status',
  'agent_teams_resume',
  'agent_teams_delete',
] as const

export const MEMBER_TOOL_NAMES: readonly string[] = [
  'agent_teams_claim_task',
  'agent_teams_update_task',
  'agent_teams_send_message',
  'agent_teams_status',
]

/** Captain-only AgentTeams tools hidden from member children. */
export const CAPTAIN_TOOL_NAMES = TEAM_TOOL_NAMES.filter(name => !MEMBER_TOOL_NAMES.includes(name))
