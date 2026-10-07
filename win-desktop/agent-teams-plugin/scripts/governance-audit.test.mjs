import assert from 'node:assert/strict'
import { test } from 'node:test'
import { replaceFileAtomicOrDirect } from '../lib/state.js'
import * as audit from '../lib/workspace-audit.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { auditChangedPaths, integrationReviewBlockers } from '../lib/quality-gates.js'
import { contractIdentity } from '../lib/audit-contract.js'
import { attributedConcurrentPaths, currentExecutorEvidence, taskContractHash } from '../lib/attempt-evidence.js'
import { latestAttemptTurnEnd } from '../lib/attempt-turn.js'
import { renderStatus, statusFingerprint } from '../lib/status-render.js'

test('status exposes evidence sources and full current bindings without collapsing changes', () => {
  const team = { team_name: 'test', viewer: 'captain', members: [], captain_inbox: [], member_inboxes: {}, mailbox_warnings: [], mailbox_warning_count: 0,
    tasks: [{ id: 't', subject: 'verify', status: 'completed', assignee: 'tester', dependencies: [], attempt: 1, attempt_id: 'a1', reassigning: false,
      evidence_source: 'member-report', audit_status: 'observed', executor_observations: 1,
      reported_commands: [{ command: 'node verify.mjs', status: 'pass' }],
      executor_evidence: [{ source: 'executor', exitCode: 0, attemptId: 'a1', contractHash: 'contract1', codeVersion: 'version1' }],
      report_basis: { attemptId: 'a1', contractHash: 'contract1', codeVersion: 'version1' } }] }
  const summary = renderStatus(team)
  assert.match(summary, /member-report/)
  assert.match(summary, /observed/)
  const full = renderStatus(team, 'full')
  assert.match(full, /executor/)
  assert.match(full, /contract1/)
  assert.match(full, /version1/)
  assert.notEqual(statusFingerprint(team), statusFingerprint({ ...team, tasks: [{ ...team.tasks[0], executor_observations: 2 }] }))
})

test('turn cause survives restart and cannot cross task, attempt or a newer unfinished turn', () => {
  const events = [
    { type: 'turn/start', seq: 0, data: { turn: 1 } },
    { type: 'tool/call', seq: 1, data: { name: 'agent_teams_update_task', arguments: JSON.stringify({ task_id: 't', attempt_id: 'a1' }) } },
    { type: 'turn/end', seq: 2, data: { turn: 1, reason: { kind: 'max-tokens' } } },
  ]
  assert.equal(latestAttemptTurnEnd(JSON.parse(JSON.stringify(events)), 't', 'a1'), 'max-tokens')
  assert.equal(latestAttemptTurnEnd(events, 't', 'a2'), undefined)
  assert.equal(latestAttemptTurnEnd(events, 'other', 'a1'), undefined)
  events.push({ type: 'turn/start', seq: 3, data: { turn: 2 } })
  assert.equal(latestAttemptTurnEnd(events, 't', 'a1'), undefined)
  events.push({ type: 'turn/end', seq: 4, data: { turn: 2, reason: { kind: 'completed' } } })
  assert.equal(latestAttemptTurnEnd(events, 't', 'a1'), 'completed')
})

test('persistent Windows rename failure preserves committed bytes and surfaces failure', async () => {
  let committed = 'old complete record'
  let writes = 0
  let removed = 0
  const locked = Object.assign(new Error('locked target'), { code: 'EPERM' })
  await assert.rejects(replaceFileAtomicOrDirect('next.tmp', 'team.json', 'new record', {
    rename: async () => { throw locked },
    writeFile: async (_target, content) => { writes++; committed = content },
    remove: async () => { removed++ },
  }, { retries: 1, retryDelayMs: 0 }), /locked target/)
  assert.equal(committed, 'old complete record')
  assert.equal(writes, 0)
  assert.equal(removed, 1)
})

test('pending broad scopes cannot excuse hidden changes or override exclusions', () => {
  const task = { kind: 'implementation', inScope: ['feature.ts'], outOfScope: ['private/'] }
  assert.match(auditChangedPaths({ task, reported: ['feature.ts'], actual: ['feature.ts', 'outside.ts'], otherWriteScopes: ['*'] }), /outside inScope/)
  assert.match(auditChangedPaths({ task, reported: ['feature.ts'], actual: ['private/a.ts'], otherWriteScopes: ['private/'], otherObservedPaths: ['private/a.ts'] }), /outside inScope/)
  assert.match(auditChangedPaths({ task, reported: ['feature.ts'], actual: ['.env'], otherWriteScopes: ['*'], otherObservedPaths: ['.env'] }), /outside inScope/)
  assert.equal(auditChangedPaths({ task, reported: ['feature.ts'], actual: ['feature.ts', 'other.ts'], otherObservedPaths: ['other.ts'] }), undefined)
})

test('integration requires independent review and cancellation/repair alone cannot replace it', () => {
  const implementation = { id: 'i', kind: 'implementation', status: 'completed', assignee: 'writer', attemptId: 'i1', dependencies: [] }
  const integration = { id: 'merge', kind: 'integration', status: 'pending', dependencies: ['i'] }
  assert.ok(integrationReviewBlockers([implementation, integration], integration).length > 0)
  const review = { id: 'r', kind: 'review', reviewedTaskId: 'i', status: 'cancelled', dependencies: ['i'], assignee: 'reviewer' }
  assert.ok(integrationReviewBlockers([implementation, integration, review], integration).length > 0)
  const repair = { id: 'fix', kind: 'repair', sourceTaskId: 'i', status: 'completed', dependencies: ['i'] }
  assert.ok(integrationReviewBlockers([implementation, integration, { ...review, status: 'failed', verdict: 'needs_revision' }, repair], integration).length > 0)
})

test('observed concurrency is exact, content-bound and works in either completion order', () => {
  const record = { schemaVersion: 1, workspace: 'w', teamId: 'team', startedAt: 10, status: 'observed', baseline: { head: 'h', files: [] } }
  const target = { id: 'a', kind: 'implementation', attemptId: 'a1', inScope: ['a.ts'], workspaceAudit: { ...record, taskId: 'a', attemptId: 'a1' } }
  const other = { id: 'b', kind: 'implementation', attemptId: 'b1', inScope: ['b.ts'], workspaceAudit: { ...record, taskId: 'b', attemptId: 'b1' } }
  other.workspaceAudit.operations = [{ callId: 'call-b', actor: 'member-b', at: 20, contractHash: taskContractHash(other), paths: [['b.ts', 'hash-b']] }]
  for (const status of ['in_progress', 'completed']) {
    assert.deepEqual(attributedConcurrentPaths(target, [{ ...other, status }], { head: 'h', files: [['b.ts', 'hash-b']] }), ['b.ts'])
  }
  assert.deepEqual(attributedConcurrentPaths(target, [other], { head: 'h', files: [['b.ts', 'changed-after-observation']] }), [])
  assert.deepEqual(attributedConcurrentPaths(target, [{ ...other, attemptId: 'retired' }], { head: 'h', files: [['b.ts', 'hash-b']] }), [])
  assert.deepEqual(attributedConcurrentPaths({ ...target, inScope: ['a.ts', 'b.ts'] }, [other], { head: 'h', files: [['b.ts', 'hash-b']] }), [])
})

test('failed/cancelled review replacement needs current independent pass and complete finding coverage', () => {
  const original = { id: 'i', kind: 'implementation', assignee: 'writer', status: 'completed', attemptId: 'i1', dependencies: [] }
  const failed = { id: 'r1', kind: 'review', assignee: 'reviewer', reviewedTaskId: 'i', status: 'failed', verdict: 'needs_revision', round: 1,
    dependencies: ['i'], findings: [{ id: 'f1', severity: 'high', problem: 'broken', requiredFix: 'repair' }] }
  const repaired = { id: 'fix', kind: 'repair', assignee: 'writer', sourceTaskId: 'i', sourceFindingIds: ['f1'], status: 'completed', attemptId: 'fix1', dependencies: ['i'] }
  const pass = { id: 'r2', kind: 'review', assignee: 'reviewer', reviewedTaskId: 'fix', status: 'completed', verdict: 'pass', round: 2, dependencies: ['fix'],
    reviewBasis: { schemaVersion: 1, reviewedTaskId: 'fix', targetAttemptId: 'fix1', targetContract: contractIdentity(repaired), codeVersion: 'v', reviewer: 'reviewer' } }
  const integration = { id: 'merge', kind: 'integration', status: 'pending', dependencies: ['fix'] }
  assert.deepEqual(integrationReviewBlockers([original, failed, repaired, pass, integration], integration, 'v'), [])
  assert.ok(integrationReviewBlockers([original, failed, { ...repaired, sourceFindingIds: [] }, pass, integration], integration, 'v').includes('r1'))
  assert.ok(integrationReviewBlockers([original, failed, repaired, pass, integration], integration, 'stale').length > 0)
  const cancelled = { ...failed, status: 'cancelled' }
  const directPass = { ...pass, reviewedTaskId: 'i', dependencies: ['i'], reviewBasis: { ...pass.reviewBasis,
    reviewedTaskId: 'i', targetAttemptId: 'i1', targetContract: contractIdentity(original) } }
  assert.deepEqual(integrationReviewBlockers([original, cancelled, directPass, integration], integration, 'v'), [])
})

test('only current attempt/contract/code executor observations remain eligible', () => {
  const task = { id: 't', kind: 'verification', attemptId: 'a1', verify: ['node -e 0'] }
  task.executorEvidence = [{ schemaVersion: 1, source: 'executor', callId: 'c', command: 'node -e 0', exitCode: 0,
    attemptId: 'a1', contractHash: taskContractHash(task), codeVersion: 'version1', at: 1 }]
  assert.equal(currentExecutorEvidence(task, 'version1').length, 1)
  assert.equal(currentExecutorEvidence({ ...task, attemptId: 'a2' }, 'version1').length, 0)
  assert.equal(currentExecutorEvidence({ ...task, verify: ['different command'] }, 'version1').length, 0)
  assert.equal(currentExecutorEvidence(task, 'version2').length, 0)
})

test('attempt baseline survives JSON restart and observes hidden changes; missing baseline fails closed', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-governance-audit-'))
  try {
    const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: workspace, windowsHide: true })
    git('init', '-q')
    await writeFile(join(workspace, 'feature.ts'), 'old')
    git('add', 'feature.ts')
    git('commit', '-qm', 'baseline')
    const task = { id: 't1', attempt: 1, attemptId: 'a1' }
    task.workspaceAudit = await audit.captureAttemptAudit(workspace, 'team1', task)
    const restarted = JSON.parse(JSON.stringify(task))
    await writeFile(join(workspace, 'feature.ts'), 'new')
    const observed = await audit.observeAttemptChanges(workspace, 'team1', restarted)
    assert.deepEqual(observed.actual, ['feature.ts'])
    await assert.rejects(audit.observeAttemptChanges(workspace, 'team1', { ...task, workspaceAudit: undefined }), /baseline.*missing/i)
    await assert.rejects(audit.observeAttemptChanges(workspace, 'another-team', restarted), /identity/i)
    await assert.rejects(audit.observeAttemptChanges(workspace, 'team1', { ...restarted, attemptId: 'a2' }), /identity/i)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})

test('non-Git applicability is explicit; Git command failures are not treated as non-Git', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-governance-nongit-'))
  try {
    const task = { id: 't1', attempt: 1, attemptId: 'a1' }
    task.workspaceAudit = await audit.captureAttemptAudit(workspace, 'team1', task)
    assert.equal(task.workspaceAudit.status, 'not-git')
    assert.equal((await audit.observeAttemptChanges(workspace, 'team1', task)).status, 'not-git')
    const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' })
    const timedOut = Object.assign(new Error('Git timeout'), { killed: true })
    for (const error of [denied, timedOut]) {
      const observed = await audit.observeWorkspace(workspace, async () => { throw error })
      assert.equal(observed.status, 'failed')
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
