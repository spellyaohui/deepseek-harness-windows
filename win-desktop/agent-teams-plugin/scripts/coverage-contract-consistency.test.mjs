import test from 'node:test'
import assert from 'node:assert/strict'
import {
  amendTaskContract,
  buildCoverageMatrix,
  canDeclareDelivery,
  evaluateQualityCompletion,
  validateCreateTask,
} from '../lib/quality-gates.js'

const goal = '确认剩余风险和用户决策'

function task(extra = {}) {
  return {
    id: 't1', subject: '审计任务', kind: 'work', status: 'completed',
    dependencies: [], revision: 0, createdAt: 0, updatedAt: 0,
    ...extra,
  }
}

function team(tasks) {
  return {
    schemaVersion: 2, name: 'consistency', id: 'consistency',
    description: '覆盖与正式验收合同回归', captainSessionId: 'captain-session',
    createdAt: 0, members: [], tasks, taskSeq: tasks.length,
    phase: 'running', planRevision: 1,
  }
}

function review(extra = {}) {
  return task({
    id: 't9', kind: 'review', status: 'in_progress', assignee: 'reviewer',
    attempt: 1, attemptId: 'review-attempt',
    objective: '独立核查分报告',
    acceptance: ['独立复核全部分报告并记录证据'],
    verify: ['检查 audit/07-verification.md'],
    ...extra,
  })
}

function completion(acceptance, verify) {
  return {
    status: 'completed', verdict: 'pass', findings: [],
    acceptanceResults: acceptance.map(criterion => ({
      criterion, status: 'passed', evidence: 'audit/07-verification.md',
    })),
    commandsRun: verify.map(command => ({
      command, status: 'passed', evidence: '已检查本次报告',
    })),
  }
}

test('a cancelled coverage task does not block its completed replacement', () => {
  const tasks = [
    task({ id: 't10', kind: 'requirements', status: 'cancelled', coverageOf: [goal] }),
    task({ id: 't11', kind: 'requirements', verdict: 'pass', coverageOf: [goal] }),
  ]
  const delivery = canDeclareDelivery(team(tasks))
  assert.equal(delivery.ok, true, delivery.blockers.join('; '))
  const [row] = buildCoverageMatrix([goal], tasks)
  assert.equal(row.status, 'passed', 'obsolete cancelled work must not contradict successful replacement coverage')
  assert.deepEqual(row.task_ids, ['t10', 't11'], 'retain cancelled task provenance')
})

test('cancellation without replacement cannot silently declare a goal delivered', () => {
  const tasks = [
    task({ id: 't10', kind: 'requirements', status: 'cancelled', coverageOf: [goal] }),
    task({ id: 't8', kind: 'integration', coverageOf: ['汇总报告'] }),
  ]
  const [row] = buildCoverageMatrix([goal], tasks)
  assert.equal(row.status, 'missing', 'cancelled work alone no longer satisfies an active goal')
  const delivery = canDeclareDelivery(team(tasks))
  assert.equal(delivery.ok, false, 'a cancelled sole coverage task leaves the required goal unresolved')
  assert.ok(delivery.blockers.some(blocker => blocker.includes(goal)))
})

test('a pending replacement remains in progress rather than inheriting cancellation blockage', () => {
  const tasks = [
    task({ id: 't10', kind: 'requirements', status: 'cancelled', coverageOf: [goal] }),
    task({ id: 't11', kind: 'requirements', status: 'pending', coverageOf: [goal] }),
  ]
  assert.equal(buildCoverageMatrix([goal], tasks)[0].status, 'in_progress')
  assert.equal(canDeclareDelivery(team(tasks)).ok, false)
})

test('an unresolved failed coverage task remains blocked despite other completed work', () => {
  const tasks = [
    task({ id: 't10', kind: 'requirements', status: 'failed', verdict: 'reject', coverageOf: [goal] }),
    task({ id: 't8', coverageOf: [goal] }),
  ]
  assert.equal(buildCoverageMatrix([goal], tasks)[0].status, 'blocked')
  assert.equal(canDeclareDelivery(team(tasks)).ok, false)
})

test('mail-only scope reduction cannot replace the formal review acceptance contract', () => {
  const original = review()
  const reduced = completion(['仅复核 SEC-04、DC-02、OPS-15 三项'], original.verify)
  const before = evaluateQualityCompletion(original, reduced)
  assert.equal(before.ok, false, 'three scoped checks cannot attest the unchanged all-report criterion')

  const amended = amendTaskContract(team([original]), original, {
    objective: '按用户授权仅复核剩余三项风险',
    acceptance: ['仅复核 SEC-04、DC-02、OPS-15 三项'],
  }, 'captain', '用户明确要求加快速度并缩减规模')
  assert.equal(amended.ok, true, amended.error)
  assert.deepEqual(amended.revision.previous.acceptance, original.acceptance)
  assert.equal(evaluateQualityCompletion(amended.task, reduced).ok, true)
  assert.deepEqual(original.acceptance, ['独立复核全部分报告并记录证据'], 'amendment does not mutate the prior contract')
})

test('a passing review verdict alone does not discharge declared acceptance and verification', () => {
  const result = evaluateQualityCompletion(review(), {
    status: 'completed', verdict: 'pass', findings: [],
  })
  assert.equal(result.ok, false, 'formal review acceptance cannot be skipped by setting verdict=pass')
})

test('amended review does not reuse prior unrelated acceptance results of the same length', () => {
  const original = review()
  const stored = { ...original, ...completion(original.acceptance, original.verify), status: 'in_progress' }
  const amended = amendTaskContract(team([stored]), stored, {
    acceptance: ['分别核查 SEC-04 与 OPS-15 并记录本次独立证据'],
  }, 'captain', '用户授权正式缩减范围')
  assert.equal(amended.ok, true, amended.error)
  const stale = evaluateQualityCompletion(amended.task, {
    status: 'completed', verdict: 'pass', findings: [],
  })
  assert.equal(stale.ok, false, 'previous-contract evidence cannot automatically pass a revised criterion')
  assert.equal(evaluateQualityCompletion(amended.task, completion(amended.task.acceptance, amended.task.verify)).ok, true)
})

test('review completion refuses failed verification even when acceptance and verdict pass', () => {
  const current = review()
  const update = completion(current.acceptance, current.verify)
  update.commandsRun[0].status = 'failed'
  assert.equal(evaluateQualityCompletion(current, update).ok, false)
})

test('review completion accepts evidence for its current formal contract', () => {
  const current = review()
  assert.equal(evaluateQualityCompletion(current, completion(current.acceptance, current.verify)).ok, true)
})

test('requirements completion also requires declared acceptance rather than a verdict alone', () => {
  const current = review({ kind: 'requirements', verify: undefined })
  assert.equal(evaluateQualityCompletion(current, { status: 'completed', verdict: 'pass', findings: [] }).ok, false)
  assert.equal(evaluateQualityCompletion(current, completion(current.acceptance, [])).ok, true)
})

test('amending review verification cannot reuse a different old command of equal array length', () => {
  const original = review()
  const amended = amendTaskContract(team([original]), original, {
    verify: ['检查 audit/07-verification-reduced.md'],
  }, 'captain', '用户授权缩减后改用新的复核报告')
  assert.equal(amended.ok, true, amended.error)
  assert.equal(evaluateQualityCompletion(amended.task, completion(amended.task.acceptance, original.verify)).ok, false)
  assert.equal(evaluateQualityCompletion(amended.task, completion(amended.task.acceptance, amended.task.verify)).ok, true)
})

function repair(extra = {}) {
  return task({
    kind: 'repair', objective: '修复同一风险', inScope: ['src/'],
    acceptance: ['修复目标风险'], verify: ['检查 src/component.ts'],
    sourceFindingIds: ['RISK-1'], changedPaths: ['src/component.ts'],
    ...extra,
  })
}

test('coverage follows a failed repair chain to its completed repair rather than stopping after one hop', () => {
  const initial = task({ id: 'base' })
  const first = repair({ id: 'r1', status: 'failed', sourceTaskId: 'base', coverageOf: [goal] })
  const second = repair({ id: 'r2', status: 'failed', sourceTaskId: 'r1' })
  const last = repair({ id: 'r3', sourceTaskId: 'r2' })
  // Repair may reference a failed source without depending on that failed task.
  assert.equal(validateCreateTask(team([initial, first]), second).ok, true)
  assert.equal(validateCreateTask(team([initial, first, second]), last).ok, true)
  const tasks = [initial, first, second, last, review({
    id: 'review-r3', status: 'completed', verdict: 'pass', reviewedTaskId: 'r3',
  })]
  assert.equal(buildCoverageMatrix([goal], tasks)[0].status, 'passed')
  const delivery = canDeclareDelivery(team(tasks))
  assert.equal(delivery.ok, true, delivery.blockers.join('; '))
})

test('a pending final repair keeps multi-hop coverage in progress and delivery blocked', () => {
  const tasks = [
    task({ id: 'base' }),
    repair({ id: 'r1', status: 'failed', sourceTaskId: 'base', coverageOf: [goal] }),
    repair({ id: 'r2', status: 'failed', sourceTaskId: 'r1' }),
    repair({ id: 'r3', status: 'pending', sourceTaskId: 'r2' }),
  ]
  assert.equal(buildCoverageMatrix([goal], tasks)[0].status, 'in_progress')
  assert.equal(canDeclareDelivery(team(tasks)).ok, false)
})

test('cyclic failed repair links cannot masquerade as successful recovery without explicit coverage goals', () => {
  const tasks = [
    repair({ id: 'r1', status: 'failed', sourceTaskId: 'r2' }),
    repair({ id: 'r2', status: 'failed', sourceTaskId: 'r1' }),
    review({ id: 'unrelated-review', status: 'completed', verdict: 'pass', reviewedTaskId: 'unrelated-work' }),
    task({ id: 'unrelated-work' }),
  ]
  assert.equal(canDeclareDelivery(team(tasks)).ok, false, 'a cyclic recovery graph has no successful terminal repair')
})

test('a third passing requirements round resolves coverage from earlier failed rounds', () => {
  const tasks = [
    task({ id: 'req1', kind: 'requirements', round: 1, status: 'failed', verdict: 'needs_revision', coverageOf: [goal] }),
    task({ id: 'req2', kind: 'requirements', round: 2, status: 'failed', verdict: 'needs_revision' }),
    task({ id: 'req3', kind: 'requirements', round: 3, verdict: 'pass' }),
  ]
  assert.equal(buildCoverageMatrix([goal], tasks)[0].status, 'passed')
  const delivery = canDeclareDelivery(team(tasks))
  assert.equal(delivery.ok, true, delivery.blockers.join('; '))
})
