import {
  delegationPolicyUsagePreamble,
  NATIVE_DELEGATION_TOOLS,
  POLICY_PREFIX,
  persistedPolicy,
  policyMarker,
  resolveDelegationPolicy,
} from '../lib/routing-policy.js'

const failures = []

function check(label, condition) {
  const status = condition ? 'PASS' : 'FAIL'
  console.log(`  ${status}  ${label}`)
  if (!condition) failures.push(label)
}

function event(type, data = {}) {
  return { type, data, seq: 0, time: 0 }
}

function header(system) {
  return event('request/header', {
    header: {
      config: { provider: 'fake', model: 'fake-model' },
      ...(system === undefined ? {} : { system }),
    },
    reason: 'initial',
  })
}

console.log('routing policy fold')
check('fresh Team defaults to teams-v1', resolveDelegationPolicy({
  events: [], defaultMode: 'teams',
}) === 'teams-v1')
check('fresh Native defaults to native-v1', resolveDelegationPolicy({
  events: [], defaultMode: 'native',
}) === 'native-v1')
check('latest valid request-header marker wins', persistedPolicy([
  header(policyMarker('native-v1')),
  header(`other prompt\n${policyMarker('teams-v1')}\ntrailer`),
]) === 'teams-v1')
check('last standalone marker line wins within one request header', persistedPolicy([
  header(`${policyMarker('native-v1')}\nusage\n${policyMarker('teams-v1')}`),
]) === 'teams-v1')
check('incidental prose mentioning the policy prefix is ignored', persistedPolicy([
  header(`Diagnostic prose mentions ${POLICY_PREFIX} without declaring a policy.`),
]) === undefined)

let unknownMarkerRejected = false
try {
  persistedPolicy([header('AgentTeams delegation policy: teams-v2')])
} catch (error) {
  unknownMarkerRejected = /unknown delegation policy marker/.test(String(error))
}
check('unknown request-header marker throws', unknownMarkerRejected)
check('unmarked established session uses current Team setting', resolveDelegationPolicy({
  events: [event('user/message')], defaultMode: 'teams',
}) === 'teams-v1')
check('unmarked request history uses current Team setting', resolveDelegationPolicy({
  events: [header('legacy prompt')], defaultMode: 'teams',
}) === 'teams-v1')
check('unmarked request history uses current Native setting', resolveDelegationPolicy({
  events: [header('legacy prompt')], defaultMode: 'native',
}) === 'native-v1')
check('explicit child parent policy wins for an empty child', resolveDelegationPolicy({
  events: [], defaultMode: 'native', parentPolicy: 'teams-v1',
}) === 'teams-v1')
check('child durable marker wins over a supplied parent policy', resolveDelegationPolicy({
  events: [header(policyMarker('native-v1'))],
  defaultMode: 'teams',
  parentPolicy: 'teams-v1',
}) === 'native-v1')

console.log('native delegation deny list')
check('deny-list contract matches the locked native delegation surface',
  JSON.stringify(NATIVE_DELEGATION_TOOLS) === JSON.stringify([
    'subagent', 'subagent_fork', 'subagent_codex', 'subagent_claude_code',
    'list_agents', 'send_message', 'interrupt_agent', 'workflow', 'ralph',
  ]))
const presentTools = new Set(['subagent', 'send_message', 'agent_teams_send_message'])
const deny = NATIVE_DELEGATION_TOOLS.filter(name => presentTools.has(name))
check('absent optional native tools are excluded before restriction',
  JSON.stringify(deny) === JSON.stringify(['subagent', 'send_message']))
check('Team prompt makes AgentTeams the only genuine delegation path without requiring teams for ordinary work',
  delegationPolicyUsagePreamble('teams-v1').includes('only genuine delegation path')
    && delegationPolicyUsagePreamble('teams-v1').includes('only agent_teams_*')
    && delegationPolicyUsagePreamble('teams-v1').includes('ordinary single-agent work does not require'))
check('Native prompt preserves explicit AgentTeams activation',
  delegationPolicyUsagePreamble('native-v1').includes('When the user asks to run something with AgentTeams')
    && delegationPolicyUsagePreamble('native-v1').includes('/agent-teams slash command'))

if (failures.length > 0) {
  console.error(`\n${failures.length} routing policy check(s) FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nall routing policy checks passed')
