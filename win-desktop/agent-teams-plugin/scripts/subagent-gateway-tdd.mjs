#!/usr/bin/env node
/**
 * Focused regression coverage for the AgentTeams subagent gateway.
 *
 * The fixture deliberately exposes the RC.1 sendMessage/drain surface and an
 * exact AgentRegistry projection. It proves that replacement continuation
 * handles resolve to the durable live parent, stale/same-id handles fail
 * closed, every child operation uses the gateway, and retirement serializes
 * with delivery before a removed child can be resumed.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { durableSessionId } from '../lib/agent-identity.js'
import { createAgentTeamsSubagentGateway } from '../lib/subagent-gateway.js'
import { deliverToMember } from '../lib/members.js'
import { recordRetiredMemberIds, readRetiredMemberIds } from '../lib/state.js'

const failures = []

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`)
  } else {
    failures.push(label)
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function agent(id, sessionId = id, cwd = process.cwd()) {
  return {
    id,
    session: { id: sessionId, header: { cwd } },
    options: { provider: 'fake', model: 'fake-model' },
  }
}

function signal() {
  return new AbortController().signal
}

console.log('AgentTeams subagent gateway TDD')

const canonicalParent = agent('parent-session')
const replacementParent = agent('runtime-replacement', canonicalParent.id)
const staleSameIdParent = agent(canonicalParent.id)
const liveAgents = new Map([[canonicalParent.id, canonicalParent]])
const starts = []
const sends = []
const interrupts = []
const drains = []

const runtime = {
  async startContinuable(spec) {
    starts.push(spec)
    return { childId: 'child-session', messageId: 'welcome-message' }
  },
  async sendMessage(parent, childId, content) {
    sends.push({ parent, childId, content })
    return 'accepted-message'
  },
  interrupt(childId, authority) {
    interrupts.push({ childId, authority })
  },
  async drainContinuableChildren(parent, childIds) {
    drains.push({ parent, childIds: [...childIds] })
  },
}

const ctx = {
  agents: { get: id => liveAgents.get(id) },
  subagents: runtime,
  logger: { warn() {} },
}
const gateway = createAgentTeamsSubagentGateway(ctx)

check('durable identity trims continuation session ids', durableSessionId({
  id: 'fallback',
  session: { id: '  durable-session  ' },
}) === 'durable-session')

await gateway.startContinuable({
  provider: 'spawn',
  label: 'team:member',
  request: { parent: replacementParent, prompt: [{ type: 'text', text: 'welcome' }] },
  signal: signal(),
})
check(
  'replacement parent resolves to the exact durable live Agent',
  starts.length === 1 && starts[0].request.parent === canonicalParent,
)

let sameIdError
try {
  await gateway.startContinuable({
    provider: 'spawn',
    label: 'team:stale',
    request: { parent: staleSameIdParent, prompt: [{ type: 'text', text: 'stale' }] },
    signal: signal(),
  })
} catch (error) {
  sameIdError = error
}
check(
  'same-id stale parent is rejected before start',
  starts.length === 1 && /not attached/i.test(String(sameIdError?.message ?? sameIdError)),
)

await gateway.sendMessage(
  replacementParent,
  'child-session',
  [{ type: 'text', text: 'hello' }],
  { signal: signal() },
)
check(
  'sendMessage uses the canonical live parent',
  sends.length === 1 && sends[0].parent === canonicalParent && sends[0].childId === 'child-session',
)

let staleSendError
try {
  await gateway.sendMessage(
    staleSameIdParent,
    'child-session',
    [{ type: 'text', text: 'must reject' }],
    { signal: signal() },
  )
} catch (error) {
  staleSendError = error
}
check(
  'sendMessage rejects a stale same-id parent',
  sends.length === 1 && /not attached/i.test(String(staleSendError?.message ?? staleSendError)),
)

gateway.interrupt(replacementParent, 'child-session')
check(
  'interrupt uses the canonical live ancestor',
  interrupts.length === 1
    && interrupts[0].childId === 'child-session'
    && interrupts[0].authority.agent === canonicalParent,
)

let staleInterruptError
try {
  gateway.interrupt(staleSameIdParent, 'child-session')
} catch (error) {
  staleInterruptError = error
}
check(
  'interrupt rejects a stale same-id parent',
  interrupts.length === 1 && /not attached/i.test(String(staleInterruptError?.message ?? staleInterruptError)),
)

await gateway.drainContinuableChildren?.(replacementParent, ['child-b', 'child-a', 'child-a'])
check(
  'drain uses the canonical live parent and deduplicates child locks',
  drains.length === 1
    && drains[0].parent === canonicalParent
    && JSON.stringify(drains[0].childIds) === JSON.stringify(['child-b', 'child-a', 'child-a']),
  JSON.stringify(drains),
)

let staleDrainError
try {
  await gateway.drainContinuableChildren?.(staleSameIdParent, ['child-session'])
} catch (error) {
  staleDrainError = error
}
check(
  'drain rejects a stale same-id parent',
  drains.length === 1 && /not attached/i.test(String(staleDrainError?.message ?? staleDrainError)),
)

const stopRuntimeEvents = []
let releaseStopDrain
let stopDrainStarted
const stopDrainReady = new Promise(resolve => { stopDrainStarted = resolve })
const stopRuntime = {
  interrupt(childId) {
    stopRuntimeEvents.push(`interrupt:${childId}`)
  },
  async drainContinuableChildren(_parent, childIds) {
    stopRuntimeEvents.push(`drain:${childIds.join(',')}`)
    stopDrainStarted()
    await new Promise(resolve => { releaseStopDrain = resolve })
  },
  async sendMessage() {
    stopRuntimeEvents.push('send')
    return 'accepted-after-stop'
  },
}
const stopCtx = {
  agents: { get: id => liveAgents.get(id) },
  subagents: stopRuntime,
  logger: { warn() {} },
}
const stopGateway = createAgentTeamsSubagentGateway(stopCtx)
if (typeof stopGateway.interruptAndDrain !== 'function') {
  check('interrupt and drain share one child lock', false, 'gateway method is missing')
} else {
  const stopPromise = stopGateway.interruptAndDrain(canonicalParent, ['child-session'])
  await stopDrainReady
  let sendSettled = false
  const sendPromise = stopGateway.sendMessage(
    canonicalParent,
    'child-session',
    [{ type: 'text', text: 'must wait for stop boundary' }],
    { signal: signal() },
  ).finally(() => { sendSettled = true })
  await Promise.resolve()
  check(
    'interrupt and drain share one child lock',
    sendSettled === false && JSON.stringify(stopRuntimeEvents) === JSON.stringify(['interrupt:child-session', 'drain:child-session']),
    JSON.stringify(stopRuntimeEvents),
  )
  releaseStopDrain()
  await stopPromise
  await sendPromise
  check(
    'queued delivery starts only after the stop drain completes',
    JSON.stringify(stopRuntimeEvents) === JSON.stringify(['interrupt:child-session', 'drain:child-session', 'send']),
    JSON.stringify(stopRuntimeEvents),
  )
}

const [builtMembers, builtTools] = await Promise.all([
  readFile(new URL('../lib/members.js', import.meta.url), 'utf8'),
  readFile(new URL('../lib/tools.js', import.meta.url), 'utf8'),
])
check(
  'member delivery performs retirement admission inside the gateway',
  builtMembers.includes('await gateway.sendMessage(')
    && builtMembers.includes('async () => {')
    && builtMembers.includes("'NOT_RESUMABLE'"),
)
check(
  'member removal serializes retirement with the gateway child lock',
  builtTools.includes('await gateway.withChildLock(')
    && builtTools.includes('await recordRetiredMemberIds(stateRoot, [revoked.member.id])'),
)
const deleteStart = builtTools.indexOf("name: 'agent_teams_delete'")
const deleteEnd = deleteStart >= 0 ? builtTools.indexOf('return runtime;', deleteStart) : -1
const deleteBlock = deleteStart >= 0 && deleteEnd > deleteStart
  ? builtTools.slice(deleteStart, deleteEnd)
  : ''
check(
  'team deletion serializes every member retirement with the gateway child lock',
  deleteBlock.includes('gateway.withChildLock(')
    && deleteBlock.includes('await recordRetiredMemberIds(stateRoot, [member.id])'),
  deleteBlock.slice(0, 800),
)
check(
  'team halt keeps interrupt and drain inside one gateway boundary',
  builtTools.includes('await gateway.interruptAndDrain(')
    && builtTools.includes('await gateway.withChildLock('),
)

const workspace = await mkdtemp(join(tmpdir(), 'dsh-agent-teams-gateway-'))
const stateRoot = join(workspace, '.agent-teams')
const retiredChildId = 'retired-child'
const retirementParent = agent(canonicalParent.id, canonicalParent.id, workspace)
let releaseDelivery
let deliveryStarted
const deliveryReady = new Promise(resolve => { deliveryStarted = resolve })
let retired = false
let sendCount = 0
const retirementRuntime = {
  async sendMessage() {
    sendCount += 1
    deliveryStarted()
    await new Promise(resolve => { releaseDelivery = resolve })
    return 'accepted-before-retirement'
  },
  interrupt() {},
}
const retirementCtx = {
  agents: { get: id => id === retirementParent.id ? retirementParent : undefined },
  subagents: retirementRuntime,
  logger: { warn() {} },
}
const retirementGateway = createAgentTeamsSubagentGateway(retirementCtx)
try {
  const firstDelivery = deliverToMember(
    retirementCtx,
    retirementParent,
    retiredChildId,
    'first message',
    '.agent-teams',
    signal(),
  )
  await deliveryReady
  const retireOperation = retirementGateway.withChildLock(retiredChildId, async () => {
    await recordRetiredMemberIds(stateRoot, [retiredChildId])
    retired = true
  })
  await Promise.resolve()
  check('retirement waits behind an in-flight delivery', retired === false)
  releaseDelivery()
  check('first delivery completes before retirement', await firstDelivery === true)
  await retireOperation
  const retiredIndex = await readRetiredMemberIds(stateRoot)
  const secondDelivery = await deliverToMember(
    retirementCtx,
    retirementParent,
    retiredChildId,
    'must not resume',
    '.agent-teams',
    signal(),
  )
  check(
    'retirement blocks every later delivery and cold resume',
    retired
      && retiredIndex.has(retiredChildId)
      && secondDelivery === false
      && sendCount === 1,
  )
} finally {
  await rm(workspace, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error(`\n${failures.length} gateway check(s) FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('\nall subagent gateway checks passed')
