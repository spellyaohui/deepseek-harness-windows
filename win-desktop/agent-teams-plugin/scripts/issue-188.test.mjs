// Issue #188 regression: sentinel `line` values must not brick a real team.
//
// This is a real-disk regression: it writes real `team.json` files into a real
// temporary directory and reads them back through the built `readTeam` /
// `readTeamSync`. No mock reader, no fake state root.
//
// The acceptance evidence for this issue is the group's real-host run (official
// dsh CLI + real Loader + real plugin tools); this file keeps the property
// regression-testable forever, in both directions:
//   - malformed V2 and legacy records fail closed without changing bytes;
//   - a genuinely wrong-typed value is still rejected, with the offending task
//     and field named;
//   - contract-valid values survive untouched.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTeam, readTeamSync } from '../lib/state.js'

const TEAM_ID = 'repro'
const healthy = { id: 't1', revision: 1, subject: 'healthy', status: 'completed', dependencies: [], createdAt: 1, updatedAt: 1 }
const governance = { schemaVersion: 2, planRevision: 1, phase: 'staged', planReviewState: 'building' }

const poisoned = (findingExtras, taskExtras = {}) => ({
  ...governance,
  id: TEAM_ID,
  name: TEAM_ID,
  captainSessionId: 'session-x',
  createdAt: 1,
  taskSeq: 2,
  members: [],
  tasks: [
    healthy,
    {
      id: 't2', revision: 1, subject: 'poisoned', status: 'failed', dependencies: [], createdAt: 1, updatedAt: 1,
      kind: 'implementation',
      findings: [{ id: 'f1', severity: 'medium', problem: 'p', requiredFix: 'r', ...findingExtras }],
      ...taskExtras,
    },
  ],
})

/** Run `body(root)` against a freshly written real team.json, then clean up. */
async function withTeam(record, body) {
  const root = mkdtempSync(join(tmpdir(), 'agentteams-188-'))
  try {
    mkdirSync(join(root, TEAM_ID, 'inbox'), { recursive: true })
    writeFileSync(join(root, TEAM_ID, 'team.json'), JSON.stringify(record, null, 2))
    return await body(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

async function rejection(record) {
  return withTeam(record, async (root) => {
    try {
      await readTeam(root, TEAM_ID)
      return undefined
    } catch (error) {
      return error
    }
  })
}

for (const line of [-1, -1.5, -1176]) {
  await test(`a malformed V2 record with findings[0].line ${line} rejects without migration`, async () => {
    await withTeam(poisoned({ line }), async (root) => {
      const before = readFileSync(join(root, TEAM_ID, 'team.json'), 'utf8')
      await assert.rejects(readTeam(root, TEAM_ID), /findings\[0\]\.line/)
      assert.throws(() => readTeamSync(root, TEAM_ID), /findings\[0\]\.line/)
      assert.equal(readFileSync(join(root, TEAM_ID, 'team.json'), 'utf8'), before)
    })
  })
}

await test('round 0, reviewedAttempt -1 and attempt -1 remain invalid durable records', async () => {
  await withTeam(poisoned({}, { round: 0, reviewedAttempt: -1, attempt: -1, inScope: ['src/a.ts', '  ', ''] }), async (root) => {
    await assert.rejects(readTeam(root, TEAM_ID), /AgentTeams V2 状态无效/)
  })
})

await test('contract-valid numeric values survive the read untouched', async () => {
  await withTeam(poisoned({ line: 0 }, { round: 2, reviewedAttempt: 0, attempt: 3 }), async (root) => {
    const task = (await readTeam(root, TEAM_ID)).tasks[1]
    assert.equal(task.findings[0].line, 0)
    assert.equal(task.round, 2)
    assert.equal(task.reviewedAttempt, 0)
    assert.equal(task.attempt, 3)
  })
  await withTeam(poisoned({ line: 1176, file: 'src/x.ts', resolved: false }), async (root) => {
    const finding = (await readTeam(root, TEAM_ID)).tasks[1].findings[0]
    assert.equal(finding.line, 1176)
    assert.equal(finding.file, 'src/x.ts')
    assert.equal(finding.resolved, false)
  })
})

await test('wrong-typed values are still hard failures, named down to the field', async () => {
  for (const bad of [{ line: 'oops' }, { line: null }]) {
    const error = await rejection(poisoned(bad))
    assert.notEqual(error, undefined, `expected rejection for ${JSON.stringify(bad)}`)
    assert.match(error.message, /^AgentTeams V2 状态无效: repro/)
    assert.match(error.message, /task "t2": findings\[0\]\.line/)
  }
  for (const bad of [{ round: 'oops' }, { attempt: {} }]) {
    const error = await rejection(poisoned({}, bad))
    assert.notEqual(error, undefined, `expected rejection for ${JSON.stringify(bad)}`)
    assert.match(error.message, /task "t2": (round|attempt)/)
  }
})

await test('unrelated corruption is still rejected with a task-scoped diagnostic', async () => {
  const error = await rejection({
    ...governance,
    id: TEAM_ID, name: TEAM_ID, captainSessionId: 'session-x', createdAt: 1, taskSeq: 1,
    members: [], tasks: [{ ...healthy, status: 'nonsense' }],
  })
  assert.notEqual(error, undefined)
  assert.match(error.message, /^AgentTeams V2 状态无效: repro/)
  assert.match(error.message, /task "t1": status "nonsense" is invalid/)
})

await test('a current record with an omitted unknown line reads clean, healthy sibling intact', async () => {
  await withTeam(poisoned({}), async (root) => {
    const team = await readTeam(root, TEAM_ID)
    assert.equal(team.tasks[0].subject, 'healthy')
    assert.equal(team.tasks[1].findings[0].id, 'f1')
  })
})

await test('the raw writer preserves malformed bytes and the reader rejects them', async () => {
  // The tool-side guard lives in the tool parser, not in `writeTeam`, so this
  // pins the division of responsibility rather than a guarantee the raw writer
  // does not make. The tool path itself is covered by the real-host case.
  await withTeam(poisoned({ line: -1 }), async (root) => {
    const bytes = JSON.parse(readFileSync(join(root, TEAM_ID, 'team.json'), 'utf8'))
    assert.equal(bytes.tasks[1].findings[0].line, -1)
    await assert.rejects(readTeam(root, TEAM_ID), /findings\[0\]\.line/)
  })
})
