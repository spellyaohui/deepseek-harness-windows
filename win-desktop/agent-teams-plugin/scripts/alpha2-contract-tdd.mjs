#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { TeamActivity } from '../lib/activity.js'
import {
  assertExpectedTaskRevision,
  createTeamDir,
  readTeam,
  writeTeam,
} from '../lib/state.js'

function team(id = 'alpha2-contract') {
  const now = Date.now()
  return {
    schemaVersion: 2,
    id,
    name: 'Alpha2 contract',
    captainSessionId: 'captain-session',
    createdAt: now,
    members: [],
    tasks: [{
      id: 't1',
      subject: 'revision task',
      status: 'pending',
      dependencies: [],
      attempt: 0,
      kind: 'work',
      createdAt: now,
      updatedAt: now,
    }],
    taskSeq: 1,
    phase: 'running',
  }
}

const workspace = await mkdtemp(join(tmpdir(), 'dsh-agent-teams-alpha2-'))
try {
  const stateRoot = join(workspace, '.agent-teams')
  const initial = team()
  await createTeamDir(stateRoot, initial)
  const created = await readTeam(stateRoot, initial.id)
  assert.equal(created?.tasks[0]?.revision, 1, 'new durable tasks begin at revision 1')

  if (created === undefined) throw new Error('created team is unavailable')
  await writeTeam(stateRoot, created)
  assert.equal((await readTeam(stateRoot, created.id))?.tasks[0]?.revision, 1, 'unchanged writes retain revision')

  created.tasks[0].subject = 'changed subject'
  await writeTeam(stateRoot, created)
  const changed = await readTeam(stateRoot, created.id)
  assert.equal(changed?.tasks[0]?.revision, 2, 'every durable task mutation increments revision')
  assert.doesNotThrow(() => assertExpectedTaskRevision(changed.tasks[0], 2))
  assert.throws(
    () => assertExpectedTaskRevision(changed.tasks[0], 1),
    /stale task t1 revision 1; current revision is 2/,
  )

  const legacy = team('legacy-no-revision')
  const legacyDir = join(stateRoot, legacy.id)
  await mkdir(join(legacyDir, 'inbox'), { recursive: true })
  await writeFile(join(legacyDir, 'team.json'), JSON.stringify(legacy, null, 2), 'utf8')
  await assert.rejects(
    () => readTeam(stateRoot, legacy.id),
    /AgentTeams V2 状态无效/,
    'old Team documents without task revisions are rejected instead of migrated',
  )

  const activity = new TeamActivity()
  const signal = new AbortController().signal
  activity.notify('team-a')
  assert.deepEqual(
    await activity.wait('team-a', 5, signal),
    { timedOut: true },
    'activity before waiter registration is not replayed',
  )
  const changedWait = activity.wait('team-a', 100, signal)
  activity.notify('team-a')
  assert.deepEqual(await changedWait, { timedOut: false }, 'a later activity edge wakes the waiter')

  const controller = new AbortController()
  const cancelled = activity.wait('team-a', 100, controller.signal)
  controller.abort(new Error('cancelled by caller'))
  await assert.rejects(cancelled, /cancelled by caller/)
} finally {
  await rm(workspace, { recursive: true, force: true })
}

console.log('Alpha.2 AgentTeams contract TDD passed: task revision/CAS and post-call activity waits')
