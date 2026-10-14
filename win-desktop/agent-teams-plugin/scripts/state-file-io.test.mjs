import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import fs from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createTeamDir, readTeam, writeTeam, withTeamLock, teamLockQueueKeys } from '../lib/state.js'

test('owned asynchronous readers close before an atomic Team replacement', { timeout: 15_000 }, async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'agent-teams-owned-reader-'))
  const team = { schemaVersion: 2, id: 'io', name: 'IO', captainSessionId: 'captain', createdAt: 1,
    members: [], tasks: [], taskSeq: 0, planRevision: 1, phase: 'staged', planReviewState: 'building' }
  const file = join(root, 'io', 'team.json')
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  let reading, writing, armed = true
  await createTeamDir(root, team)
  const original = fs.readFile
  const replacement = mock.method(fs, 'readFile', async (path, ...args) => {
    if (path !== file || !armed) return original(path, ...args)
    armed = false
    const handle = await fs.open(file, 'r')
    entered.resolve()
    try {
      const contents = await handle.readFile(...args)
      await release.promise
      return contents
    } finally { await handle.close() }
  })
  syncBuiltinESMExports()
  try {
    reading = readTeam(root, 'io')
    await entered.promise
    let completed = false, failure
    writing = withTeamLock(`team:${root}:io`, () => writeTeam(root, { ...team, description: 'next' }))
      .then(() => { completed = true }, error => { completed = true; failure = error })
    // Exceed the unchanged four-attempt 750ms budget while holding our own reader.
    await delay(1_500)
    assert.equal(completed, false, `an owned reader must queue replacement instead of causing ${failure?.code ?? 'early commit'}`)
    release.resolve()
    assert.equal((await reading).description, undefined, 'the reader sees the old complete generation')
    await writing
    assert.equal(failure, undefined)
    assert.equal((await readTeam(root, 'io')).description, 'next')
  } finally {
    release.resolve()
    await Promise.allSettled([reading, writing].filter(Boolean))
    replacement.mock.restore()
    syncBuiltinESMExports()
    await fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })
  }
  assert.equal(teamLockQueueKeys().length, 0, 'reader/writer queues release after settlement')
})

test('owned readers wait for an in-flight atomic replacement and see its committed generation', { timeout: 15_000 }, async () => {
  const root = await fs.mkdtemp(join(tmpdir(), 'agent-teams-owned-writer-'))
  const team = { schemaVersion: 2, id: 'io', name: 'IO', captainSessionId: 'captain', createdAt: 1,
    members: [], tasks: [], taskSeq: 0, planRevision: 1, phase: 'staged', planReviewState: 'building' }
  const file = join(root, 'io', 'team.json')
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  let reading, writing
  await createTeamDir(root, team)
  const original = fs.rename
  const replacement = mock.method(fs, 'rename', async (from, to) => {
    if (to === file) { entered.resolve(); await release.promise }
    return original(from, to)
  })
  syncBuiltinESMExports()
  try {
    writing = withTeamLock(`team:${root}:io`, () => writeTeam(root, { ...team, description: 'next' }))
    await entered.promise
    let completed = false
    reading = readTeam(root, 'io').then(value => { completed = true; return value })
    await delay(1_500)
    assert.equal(completed, false, 'an owned read must not open the old target during replacement')
    release.resolve()
    await writing
    assert.equal((await reading).description, 'next')
  } finally {
    release.resolve()
    await Promise.allSettled([reading, writing].filter(Boolean))
    replacement.mock.restore()
    syncBuiltinESMExports()
    await fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 })
  }
  assert.equal(teamLockQueueKeys().length, 0)
})
