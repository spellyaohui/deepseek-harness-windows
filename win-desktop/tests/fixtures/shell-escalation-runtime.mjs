import { register } from 'node:module'
import assert from 'node:assert/strict'

register(new URL('../../src/win-hide-console-loader.mjs', import.meta.url), {
  parentURL: import.meta.url,
})

const shell = process.argv[2]
assert.ok(shell === 'pwsh' || shell === 'bash', `unsupported shell fixture: ${shell}`)

const packageName = shell === 'pwsh'
  ? '@deepseek-ai/dsh-tool-pwsh'
  : '@deepseek-ai/dsh-tool-bash'
const { apply } = await import(packageName)

function successfulResult() {
  return {
    exitCode: 0,
    signal: null,
    timedOut: false,
    aborted: false,
    timeoutMs: 1_000,
    stdout: { text: 'ok', truncated: false },
    stderr: { text: '', truncated: false },
  }
}

function createRuntime(currentMode, requestApproval = async () => 'allowed-once') {
  let tool
  let approvalCalls = 0
  let runnerCalls = 0
  const ctx = {
    shell: {
      sandboxMode: currentMode,
      resolve: (request) => request,
      run: async () => {
        runnerCalls += 1
        return successfulResult()
      },
    },
    shellEnv: { collect: () => ({}) },
    systemPrompt: { section: () => {} },
    tools: { register: (registered) => { tool = registered } },
    get(name) {
      if (name === 'sandboxPolicy') {
        return { resolve: () => ({ mode: currentMode, workspaceRoot: process.cwd() }) }
      }
      if (name === 'approval') {
        return {
          request: async (request) => {
            approvalCalls += 1
            return requestApproval(request)
          },
        }
      }
      return undefined
    },
  }
  apply(ctx, { enableRunInBackground: false })
  assert.ok(tool, `expected ${shell} tool registration`)
  return {
    execute: (args) => tool.execute(args, {
      agent: { session: { header: { cwd: process.cwd() } } },
      callId: 'runtime-boundary-test',
      signal: new AbortController().signal,
    }),
    approvalCalls: () => approvalCalls,
    runnerCalls: () => runnerCalls,
  }
}

function args(overrides = {}) {
  return {
    command: shell === 'pwsh' ? 'Get-Location' : 'pwd',
    description: `Run ${shell} boundary fixture`,
    ...overrides,
  }
}

const sameMode = createRuntime('danger-full-access')
await sameMode.execute(args({
  sandbox_permissions: 'danger-full-access',
  justification: '',
}))
assert.equal(sameMode.approvalCalls(), 0)

const narrowerMode = createRuntime('danger-full-access')
await narrowerMode.execute(args({
  sandbox_permissions: 'workspace-write',
  justification: '',
}))
assert.equal(narrowerMode.approvalCalls(), 0)

const wideningBlank = createRuntime('workspace-write')
await assert.rejects(
  wideningBlank.execute(args({
    sandbox_permissions: 'danger-full-access',
    justification: '',
  })),
  /invalid justification: expected a non-empty sentence/,
)
assert.equal(wideningBlank.approvalCalls(), 0)

const justificationOnly = createRuntime('workspace-write')
await assert.rejects(
  justificationOnly.execute(args({ justification: 'This request has no mode.' })),
  /invalid escalation: justification is only valid together with sandbox_permissions/,
)
assert.equal(justificationOnly.approvalCalls(), 0)

let resolveApproval
const approvalPending = new Promise((resolve) => { resolveApproval = resolve })
const validWidening = createRuntime('workspace-write', () => approvalPending)
const wideningExecution = validWidening.execute(args({
  sandbox_permissions: 'danger-full-access',
  justification: 'Run this command outside the workspace sandbox.',
}))
await new Promise((resolve) => setImmediate(resolve))
const runnerCallsBeforeApproval = validWidening.runnerCalls()
assert.equal(validWidening.approvalCalls(), 1)
assert.equal(runnerCallsBeforeApproval, 0)
resolveApproval('allowed-once')
await wideningExecution

process.stdout.write(JSON.stringify({
  shell,
  sameModeRunnerCalls: sameMode.runnerCalls(),
  narrowerModeRunnerCalls: narrowerMode.runnerCalls(),
  wideningBlankRunnerCalls: wideningBlank.runnerCalls(),
  justificationOnlyRunnerCalls: justificationOnly.runnerCalls(),
  validWideningApprovalCalls: validWidening.approvalCalls(),
  runnerCallsBeforeApproval,
  validWideningRunnerCalls: validWidening.runnerCalls(),
}))
