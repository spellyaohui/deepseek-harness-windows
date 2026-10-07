/** Focused lifecycle contract for policy attachment on current and legacy Agents. */
import assert from 'node:assert/strict'
import {
  NATIVE_DELEGATION_TOOLS,
  policyMarker,
  registerDelegationPolicyLifecycle,
} from '../lib/routing-policy.js'

const TEAM_MEMBER_TOOLS = [
  'agent_teams_claim_task',
  'agent_teams_update_task',
  'agent_teams_send_message',
  'agent_teams_status',
]
const TEAM_CAPTAIN_TOOLS = [
  'agent_teams_create',
  'agent_teams_approve',
  'agent_teams_edit_plan',
  'agent_teams_add_member',
  'agent_teams_remove_member',
  'agent_teams_create_task',
  'agent_teams_reassign_task',
  'agent_teams_amend_task',
  'agent_teams_resume',
  'agent_teams_delete',
]
const allTools = new Set([...NATIVE_DELEGATION_TOOLS, ...TEAM_MEMBER_TOOLS, ...TEAM_CAPTAIN_TOOLS])

function createAgent(id, member = false) {
  const sections = []
  const denials = new Set()
  const guards = []
  const effects = []
  const agent = {
    id,
    session: {
      header: { seedLength: 0 },
      events: member ? [{
        type: 'subagent/descriptor',
        data: { label: `agent-teams:team:${id}` },
      }] : [],
    },
    ctx: {
      systemPrompt: {
        section(section) {
          sections.push(section)
          return () => {
            const index = sections.indexOf(section)
            if (index >= 0) sections.splice(index, 1)
          }
        },
      },
      tools: {
        get(name, scope) {
          return (scope === agent && name === 'subagent') || (allTools.has(name) && !denials.has(name))
            ? { name }
            : undefined
        },
        restrict({ deny }) {
          for (const name of deny) denials.add(name)
          return () => { for (const name of deny) denials.delete(name) }
        },
        guard(guard) {
          guards.push(guard)
          return () => {
            const index = guards.indexOf(guard)
            if (index >= 0) guards.splice(index, 1)
          }
        },
      },
      effect(setup) {
        const dispose = setup()
        effects.push(dispose)
        return dispose
      },
    },
  }
  return { agent, sections, denials, guards, effects }
}

const created = []
const legacy = []
const rootEffects = []
const existingCaptain = createAgent('existing-captain')
const existingMember = createAgent('existing-member', true)
const registry = new Map([
  [existingCaptain.agent.id, existingCaptain.agent],
  [existingMember.agent.id, existingMember.agent],
])
const ctx = {
  tools: { get(name, scope) { return allTools.has(name) ? { name, scope } : undefined } },
  agents: {
    get: id => registry.get(id),
    list: () => [...registry.values()],
  },
  on(name, listener) {
    const target = name === 'agent/created' ? created : legacy
    target.push(listener)
    return () => {
      const index = target.indexOf(listener)
      if (index >= 0) target.splice(index, 1)
    }
  },
  effect(setup) {
    const dispose = setup()
    rootEffects.push(dispose)
    return dispose
  },
}

const dispose = registerDelegationPolicyLifecycle(ctx, {
  defaultMode: () => 'teams',
  order: 117,
  text: policy => `${policyMarker(policy)}\n\ncaptain policy`,
  memberText: policy => `${policyMarker(policy)}\n\nmember policy`,
})
const ownedLookup = ctx.tools.get
let outerCalls = 0
ctx.tools.get = function(name, scope) { outerCalls++; return ownedLookup.call(this, name, scope) }
const outerLookup = ctx.tools.get
assert.equal(ctx.tools.get('subagent', existingCaptain.agent), undefined, 'scope-local get agrees with Team admission')
assert.ok(ctx.tools.get('subagent'), 'global lookup remains available')
assert.ok(ctx.tools.get('agent_teams_update_task', existingMember.agent), 'member report lookup stays visible')

assert.equal(existingCaptain.sections.length, 1, 'an already-live captain must receive one policy section')
assert.equal(existingMember.sections.length, 1, 'an already-live member must receive one member policy section')
assert.match(existingMember.sections[0].text, /member policy/)
assert.ok(TEAM_CAPTAIN_TOOLS.every(name => existingMember.denials.has(name)), 'a member schema must deny every non-member AgentTeams tool')
assert.ok(TEAM_MEMBER_TOOLS.every(name => !existingMember.denials.has(name)), 'a member schema must retain every member reporting tool')
assert.ok(existingMember.guards.some(guard => /forbids native delegation tool "subagent"/.test(guard({ name: 'subagent' }) ?? '')), 'Team members retain the scoped native guard')

for (const listener of [...created]) listener({ agent: existingCaptain.agent, source: { kind: 'resume' } })
for (const listener of [...legacy]) listener({ agent: existingMember.agent })
assert.equal(existingCaptain.sections.length, 1, 'created replay must not duplicate an existing captain policy')
assert.equal(existingMember.sections.length, 1, 'legacy replay must not duplicate an existing member policy')

const legacyCaptain = createAgent('legacy-captain')
registry.set(legacyCaptain.agent.id, legacyCaptain.agent)
for (const listener of [...legacy]) listener({ agent: legacyCaptain.agent })
assert.equal(legacyCaptain.sections.length, 1, 'legacy session-start must attach the captain policy')
assert.equal(legacyCaptain.denials.has('subagent_fork'), true, 'legacy Team captain must restrict global native delegation')

dispose()
assert.equal(ctx.tools.get, outerLookup, 'disposal cannot overwrite a later independent wrapper')
assert.ok(ctx.tools.get('subagent', existingCaptain.agent), 'disposed lookup releases policy through an outer wrapper')
assert.ok(outerCalls > 0)
for (const rootDispose of rootEffects.splice(0).reverse()) rootDispose()
for (const subject of [existingCaptain, existingMember, legacyCaptain]) {
  assert.equal(subject.sections.length, 0, 'policy disposal must remove prompt sections')
  assert.equal(subject.denials.size, 0, 'policy disposal must remove tool restrictions')
  assert.equal(subject.guards.length, 0, 'policy disposal must remove scope guards')
}

console.log('PASS routing policy lifecycle: current agents, legacy attach, complete member tool surface, and disposal')
