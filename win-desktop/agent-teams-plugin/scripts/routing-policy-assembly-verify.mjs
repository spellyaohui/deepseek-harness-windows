/** RC2 integration verification using the real tool registry and prompt assembler. */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import {
  installDelegationPolicy,
  NATIVE_DELEGATION_TOOLS,
  policyMarker,
} from '../lib/routing-policy.js'

const require = createRequire(import.meta.url)
const toolsPackage = require.resolve('@deepseek-ai/dsh-tools/package.json')
const toolsRequire = createRequire(toolsPackage)
const scopeEntry = toolsRequire.resolve('@deepseek-ai/dsh-scope')
const { createScope } = await import(pathToFileURL(scopeEntry).href)

const failures = []
function check(label, condition) {
  const status = condition ? 'PASS' : 'FAIL'
  console.log(`  ${status}  ${label}`)
  if (!condition) failures.push(label)
}

const root = new Context()
await root.plugin(SystemPrompt, {})
await root.plugin(ToolRuntime, { mode: 'native' })
let hostContext
const hostPlugin = Object.assign((ctx) => { hostContext = ctx }, {
  inject: ['systemPrompt', 'tools'],
})
await root.plugin(hostPlugin)

const reportingTools = ['agent_teams_send_message', 'agent_teams_update_task']
for (const name of [...NATIVE_DELEGATION_TOOLS, ...reportingTools]) {
  root.tools.register(defineContentToolFixture({
    name,
    description: `${name} integration fixture`,
    parameters: {},
    execute: async () => [],
  }))
}

function scopedAgent(id, policy, parent) {
  const agent = {
    id,
    options: { provider: 'fake', model: 'fake-model' },
    session: {
      id,
      header: { ...(parent === undefined ? {} : { parentSession: parent.id }) },
      events: [],
    },
  }
  const scope = createScope(hostContext, agent, parent === undefined ? undefined : { parent })
  agent.ctx = scope.ctx.extend({ agent })
  installDelegationPolicy({
    agent,
    policy,
    order: 117,
    text: `${policyMarker(policy)}\n\nreal assembly policy fixture`,
  })
  return { agent, scope }
}

async function assembleFor(agent) {
  return hostContext.systemPrompt.assemble({ scope: agent })
}

console.log('RC2 real tool registry and system-prompt assembly')
const teamCaptain = scopedAgent('assembly-team-captain', 'teams-v1')
const captainAssembly = await assembleFor(teamCaptain.agent)
check('Team captain final assembled schemas contain no native delegation tool',
  NATIVE_DELEGATION_TOOLS.every(name => !captainAssembly.tools.some(tool => tool.name === name)))
check('Team captain marker is model-visible through the real prompt assembler',
  renderPrompt(captainAssembly).includes(policyMarker('teams-v1')))

const teamMember = scopedAgent('assembly-team-member', 'teams-v1', teamCaptain.agent)
const memberAssembly = await assembleFor(teamMember.agent)
check('unpublished Team member final assembled schemas contain no native delegation tool',
  NATIVE_DELEGATION_TOOLS.every(name => !memberAssembly.tools.some(tool => tool.name === name)))
check('unpublished Team member keeps member-local reporting schemas',
  reportingTools.every(name => memberAssembly.tools.some(tool => tool.name === name)))
check('unpublished Team member marker is model-visible through the real prompt assembler',
  renderPrompt(memberAssembly).includes(policyMarker('teams-v1')))

const nativeCaptain = scopedAgent('assembly-native-captain', 'native-v1')
const nativeAssembly = await assembleFor(nativeCaptain.agent)
check('Native final assembled schemas retain every official delegation tool',
  NATIVE_DELEGATION_TOOLS.every(name => nativeAssembly.tools.some(tool => tool.name === name)))
check('Native marker is model-visible through the real prompt assembler',
  renderPrompt(nativeAssembly).includes(policyMarker('native-v1')))

await nativeCaptain.scope.dispose()
await teamMember.scope.dispose()
await teamCaptain.scope.dispose()
await root.fiber.dispose()

if (failures.length > 0) {
  console.error(`\n${failures.length} real assembly check(s) FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nall real assembly checks passed')
