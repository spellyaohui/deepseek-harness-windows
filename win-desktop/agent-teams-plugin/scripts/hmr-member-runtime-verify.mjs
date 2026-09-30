import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply } from '../lib/index.js'
import { createTeamDir, readTeam, writeTeam } from '../lib/state.js'

function disposableSet() {
  const listeners = new Map()
  return {
    on(name, listener) {
      const bucket = listeners.get(name) ?? new Set()
      bucket.add(listener)
      listeners.set(name, bucket)
      return () => bucket.delete(listener)
    },
    emit(name, ...args) {
      const next = typeof args.at(-1) === 'function' ? args.pop() : () => undefined
      const handlers = [...(listeners.get(name) ?? [])]
      return handlers.reduceRight((chain, handler) => () => handler(...args, chain), next)()
    },
    count(name) { return (listeners.get(name) ?? new Set()).size },
  }
}

function makeAgent(id, session, tools) {
  const events = disposableSet()
  const sections = []
  const denials = new Set()
  const guards = []
  const effects = []
  const agent = {
    id,
    status: 'idle',
    session,
    whenIdle: async () => undefined,
    ctx: {
      on: events.on,
      systemPrompt: {
        section(section) {
          sections.push(section)
          return () => sections.splice(sections.indexOf(section), 1)
        },
      },
      tools: {
        get(name) { return tools.names.has(name) && !denials.has(name) ? { name } : undefined },
        restrict({ deny }) {
          deny.forEach(name => denials.add(name))
          return () => deny.forEach(name => denials.delete(name))
        },
        guard(guard) {
          guards.push(guard)
          return () => guards.splice(guards.indexOf(guard), 1)
        },
      },
      effect(setup) {
        const dispose = setup()
        effects.push(dispose)
        return dispose
      },
    },
  }
  return { agent, events, denials, guards, effects }
}

const workspace = await mkdtemp(join(tmpdir(), 'dsh-agent-teams-hmr-'))
try {
  const names = new Set(['subagent'])
  const captain = makeAgent('captain', {
    header: { cwd: workspace, seedLength: 0 }, events: [],
  }, { names })
  const member = makeAgent('member', {
    header: { cwd: workspace, parentSession: 'captain', seedLength: 0 },
    events: [{ type: 'subagent/descriptor', data: {
      version: 3, mode: 'continuable', provider: 'spawn', label: 'agent-teams:team:worker',
      agentProvider: 'fixed-provider', agentModel: 'fixed-model',
    } }],
  }, { names })
  const live = new Map([['captain', captain.agent], ['member', member.agent]])
  await createTeamDir(join(workspace, '.agent-teams'), {
    schemaVersion: 2, id: 'team', name: 'Team', captainSessionId: 'captain', createdAt: 1,
    taskSeq: 0, planRevision: 1, phase: 'running', approvedAt: 1, approvedPlanRevision: 1,
    approvalSource: 'automatic', approvalEvidenceId: 'automatic:create:team', tasks: [],
    members: [{ id: 'member', name: 'worker', status: 'idle', joinedAt: 1,
      provider: 'fixed-provider', model: 'fixed-model', reasoningMode: 'explicit', reasoningEffort: 'high' }],
  })

  const rootEvents = disposableSet()
  const rootEffects = []
  const ctx = {
    logger: { warn() {}, debug() {} },
    fiber: {},
    agents: { get: id => live.get(id), list: () => [...live.values()] },
    llm: {},
    subagents: {
      async followup() { return 'message' },
      async start() { throw new Error('not used') },
      async startContinuable() { throw new Error('not used') },
      async sendMessage() { return 'message' },
    },
    tools: {
      register(definition) { names.add(definition.name); return () => names.delete(definition.name) },
    },
    on: rootEvents.on,
    get() { return undefined },
    inject() {},
    effect(setup) {
      const dispose = setup()
      rootEffects.push(dispose)
      return dispose
    },
  }
  const disposeRoot = () => { for (const dispose of [...rootEffects].reverse()) dispose() }

  // This is the actual plugin entry point. The Team tools begin absent: applying
  // the plugin must register them before hydrating this already-live child.
  apply(ctx, { stateDir: '.agent-teams', slashCommand: false, delegationMode: { get: () => 'teams' } })

  const allowed = new Set(['agent_teams_claim_task', 'agent_teams_update_task', 'agent_teams_send_message', 'agent_teams_status'])
  const teamTools = [...names].filter(name => name.startsWith('agent_teams_'))
  assert.deepEqual(teamTools.filter(name => member.agent.ctx.tools.get(name) !== undefined).sort(), [...allowed].sort(),
    'HMR hydration limits a durable member to claim/update/send/status after real apply ordering')
  assert.match(member.guards.map(guard => guard({ name: 'subagent' })).find(Boolean), /forbids native delegation/,
    'Team-mode durable member rejects the scope-local native subagent tool')
  assert.equal(member.events.count('agent/pre-step'), 1, 'HMR hydration installs exactly one durable admission guard')
  assert.equal(member.events.count('agent/request'), 1, 'HMR hydration freezes the saved model request route')
  assert.equal(member.events.count('agent/request-error'), 1, 'HMR hydration installs exactly one fallback hook')
  rootEvents.emit('agent/created', { agent: member.agent, source: 'resume' })
  rootEvents.emit('agent/session-start', { agent: member.agent, source: 'resume' })
  for (const event of ['agent/request', 'agent/request-error', 'agent/error', 'agent/pre-step']) {
    assert.equal(member.events.count(event), 1, `replayed lifecycle notifications keep exactly one ${event} hook`)
  }
  const assembled = await member.events.emit('system-prompt/assemble', {}, {}, () => ({ variables: {} }))
  const routed = await member.events.emit('agent/request', {}, () => ({ provider: 'default', model: 'default' }))
  assert.deepEqual(assembled.variables, { provider: 'fixed-provider', model: 'fixed-model' })
  assert.deepEqual(routed, { provider: 'fixed-provider', model: 'fixed-model', reasoningEffort: 'high' })
  const durable = await readTeam(join(workspace, '.agent-teams'), 'team')
  durable.halted = true
  await writeTeam(join(workspace, '.agent-teams'), durable)
  assert.equal((await member.events.emit('agent/pre-step', { agent: member.agent }, () => ({ kind: 'enter' }))).kind, 'reject',
    'the hydrated durable admission guard rejects a halted Team')
  durable.halted = false
  await writeTeam(join(workspace, '.agent-teams'), durable)

  disposeRoot()
  assert.equal(member.events.count('agent/request'), 0, 'root unload removes the old fixed-route request hook')
  assert.equal(member.events.count('agent/request-error'), 0, 'root unload removes the old fallback hook')
  assert.equal(member.events.count('agent/error'), 0, 'root unload removes the old failure hook')
  assert.equal(member.events.count('agent/pre-step'), 0, 'root unload removes the old admission guard')

  const teamPath = join(workspace, '.agent-teams', 'team', 'team.json')
  const validTeamJson = await readFile(teamPath, 'utf8')
  const malformedTeam = JSON.parse(validTeamJson)
  delete malformedTeam.members[0].reasoningMode
  await writeFile(teamPath, JSON.stringify(malformedTeam), 'utf8')
  apply(ctx, { stateDir: '.agent-teams', slashCommand: false, delegationMode: { get: () => 'teams' } })
  await assert.rejects(
    async () => member.events.emit('agent/request', {}, () => ({ provider: 'default', model: 'default' })),
    /member initialization failed/,
    'a non-vetoable HMR hydration with an invalid durable role must reject rather than use a default model',
  )
  disposeRoot()
  await writeFile(teamPath, validTeamJson, 'utf8')

  apply(ctx, { stateDir: '.agent-teams', slashCommand: false, delegationMode: { get: () => 'native' } })
  assert.equal(member.events.count('agent/request'), 1, 'HMR remount installs one fresh fixed-route hook')
  assert.equal(member.events.count('agent/request-error'), 1, 'HMR remount installs one fresh fallback hook')
  assert.equal(member.events.count('agent/error'), 1, 'HMR remount installs one fresh failure hook')
  assert.equal(member.events.count('agent/pre-step'), 1, 'HMR remount installs one fresh admission guard')
  assert.notEqual(member.agent.ctx.tools.get('subagent'), undefined, 'Native mode remains available after remount')
  console.log('PASS hmr member runtime apply-order, hydration, cleanup, and Native routing')
} finally {
  await rm(workspace, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })
}
