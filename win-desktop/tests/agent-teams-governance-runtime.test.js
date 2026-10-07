import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createTeamDir, readTeam } from '../agent-teams-plugin/lib/state.js'
import { captureAttemptAudit } from '../agent-teams-plugin/lib/workspace-audit.js'
import { installAttemptEvidence, currentExecutorEvidence } from '../agent-teams-plugin/lib/attempt-evidence.js'

test('official Tools dispatch persists real executor observations once, and fences new contracts/attempts', async t => {
  const workspace = await mkdtemp(join(tmpdir(), 'dsh-governance-runtime-'))
  const ctx = new Context()
  t.after(async () => { await ctx.fiber.dispose(); await rm(workspace, { recursive: true, force: true }) })
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: workspace, windowsHide: true })
  git('init', '-q'); await writeFile(join(workspace, 'feature.ts'), 'old'); git('add', '.'); git('commit', '-qm', 'base')
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(AgentLoop, { agents: [] })
  const handle = await ctx.agents.create({ sessionId: SessionId('audit-captain'), meta: { cwd: workspace }, agentOptions: { provider: 'controlled', model: 'offline' } })
  const task = { id: 't', subject: 'observed edit', kind: 'implementation', objective: 'edit feature',
    inScope: ['feature.ts'], acceptance: ['file changes'], verify: ['edit'], status: 'in_progress', assignee: 'captain',
    dependencies: [], attempt: 1, attemptId: 'a1', createdAt: Date.now(), updatedAt: Date.now() }
  task.workspaceAudit = await captureAttemptAudit(workspace, 'audit', task, '.agent-teams')
  const root = join(workspace, '.agent-teams')
  await createTeamDir(root, { schemaVersion: 2, id: 'audit', name: 'audit', captainSessionId: 'audit-captain', createdAt: Date.now(),
    members: [], tasks: [task], taskSeq: 1, phase: 'running', planRevision: 1, approvedAt: Date.now(),
    approvedPlanRevision: 1, approvalSource: 'automatic', approvalEvidenceId: 'automatic:test' })
  ctx.tools.register(defineTool({ name: 'bash', description: 'controlled executor, no gateway',
    parameters: { command: { type: 'string', required: true } },
    async execute(args) {
      execFileSync(process.execPath, ['-e', 'require("fs").writeFileSync("feature.ts", "new")'], { cwd: workspace, windowsHide: true })
      return { kind: 'foreground', exitCode: 0, timedOut: false, aborted: false }
    }, output: { schema: { type: 'object', additionalProperties: false, properties: {
      kind: { type: 'string', required: true }, exitCode: { type: 'integer', required: true },
      timedOut: { type: 'boolean', required: true }, aborted: { type: 'boolean', required: true },
    } }, render(_args, value) { return JSON.stringify(value) } },
  }))
  installAttemptEvidence(ctx, '.agent-teams')
  installAttemptEvidence(ctx, '.agent-teams') // HMR reinstallation must dispose the old observer.
  const result = await ctx.tools.execute({ callId: 'observed-call', name: 'bash', arguments: { command: 'edit' }, agent: handle.agent, signal: new AbortController().signal })
  assert.equal(result.isError, false, JSON.stringify(result))
  const saved = await readTeam(root, 'audit')
  const observed = saved.tasks[0]
  assert.equal(observed.workspaceAudit.operations.length, 1)
  assert.deepEqual(observed.workspaceAudit.operations[0].paths.map(([path]) => path), ['feature.ts'])
  assert.equal(observed.executorEvidence.length, 1)
  assert.equal(observed.executorEvidence[0].exitCode, 0)
  // Exclude the Team state exactly as production observation does.
  assert.equal(currentExecutorEvidence(observed, observed.executorEvidence[0].codeVersion).length, 1)
  assert.equal(currentExecutorEvidence({ ...observed, attemptId: 'a2' }, observed.executorEvidence[0].codeVersion).length, 0)
  assert.equal(currentExecutorEvidence({ ...observed, verify: ['new contract'] }, observed.executorEvidence[0].codeVersion).length, 0)
  await writeFile(join(root, 'audit', 'team.json.crash.tmp'), '{partial')
  assert.equal((await readTeam(root, 'audit')).tasks[0].attemptId, 'a1')
  assert.equal(await readFile(join(workspace, 'feature.ts'), 'utf8'), 'new')
})
