import { register } from 'node:module'
import assert from 'node:assert/strict'

register(new URL('../../src/win-hide-console-loader.mjs', import.meta.url), {
  parentURL: import.meta.url,
})

const { apply } = await import('@deepseek-ai/dsh-tool-fs')

function createRuntime(currentMode, requestApproval = async () => 'allowed-once') {
  const tools = new Map()
  const mutations = []
  let approvalCalls = 0
  const ctx = {
    fs: {
      sandboxMode: currentMode,
      resolve: async (path) => ({ displayPath: path }),
      writeText: async (_target, content, _intent, _signal, policy) => {
        mutations.push({ tool: 'write', mode: policy?.mode })
        return { version: 'write-v1', operation: 'create', before: null, after: content }
      },
      editText: async (_target, input, _intent, _signal, policy) => {
        mutations.push({ tool: 'edit', mode: policy?.mode })
        return { version: 'edit-v1', before: input.oldString, after: input.newString }
      },
    },
    systemPrompt: { section: () => {} },
    tools: { register: (tool) => tools.set(tool.name, tool) },
    inject: () => {},
    waterfall: async (...args) => args.at(-1)(),
    emit: () => {},
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
  apply(ctx, {
    readLimit: 2_000,
    readMaxLineLength: 2_000,
    readMaxBytes: 50 * 1_024,
    readStreamMinSize: 10 * 1_024 * 1_024,
  })
  return {
    execute(toolName, args) {
      const tool = tools.get(toolName)
      assert.ok(tool, `expected ${toolName} tool registration`)
      return tool.execute(args, {
        agent: { session: { header: { cwd: process.cwd() } } },
        callId: `fs-${toolName}-runtime-boundary-test`,
        signal: new AbortController().signal,
      })
    },
    approvalCalls: () => approvalCalls,
    mutationCalls: () => mutations.length,
    mutationModes: () => mutations.map((mutation) => mutation.mode),
  }
}

function toolArgs(toolName, overrides = {}) {
  return toolName === 'write'
    ? { file_path: 'fixture.txt', content: 'after', ...overrides }
    : { file_path: 'fixture.txt', old_string: 'before', new_string: 'after', ...overrides }
}

async function verifyTool(toolName) {
  const sameMode = createRuntime('danger-full-access')
  await sameMode.execute(toolName, toolArgs(toolName, {
    sandbox_permissions: 'danger-full-access',
    justification: 'Already unrestricted.',
  }))
  assert.equal(sameMode.approvalCalls(), 0)

  const narrowerMode = createRuntime('danger-full-access')
  await narrowerMode.execute(toolName, toolArgs(toolName, {
    sandbox_permissions: 'workspace-write',
    justification: '',
  }))
  assert.equal(narrowerMode.approvalCalls(), 0)

  const wideningBlank = createRuntime('workspace-write')
  await assert.rejects(
    wideningBlank.execute(toolName, toolArgs(toolName, {
      sandbox_permissions: 'danger-full-access',
      justification: '',
    })),
    /invalid justification: expected a non-empty sentence/,
  )
  assert.equal(wideningBlank.approvalCalls(), 0)

  const justificationOnly = createRuntime('workspace-write')
  await assert.rejects(
    justificationOnly.execute(toolName, toolArgs(toolName, {
      justification: 'This request has no mode.',
    })),
    /invalid escalation: justification is only valid together with sandbox_permissions/,
  )
  assert.equal(justificationOnly.approvalCalls(), 0)

  let resolveApproval
  const approvalPending = new Promise((resolve) => { resolveApproval = resolve })
  const validWidening = createRuntime('workspace-write', () => approvalPending)
  const wideningExecution = validWidening.execute(toolName, toolArgs(toolName, {
    sandbox_permissions: 'danger-full-access',
    justification: 'Modify this file outside the workspace sandbox.',
  }))
  await new Promise((resolve) => setImmediate(resolve))
  const mutationsBeforeApproval = validWidening.mutationCalls()
  assert.equal(validWidening.approvalCalls(), 1)
  assert.equal(mutationsBeforeApproval, 0)
  resolveApproval('allowed-once')
  await wideningExecution

  return {
    sameModeMutationCalls: sameMode.mutationCalls(),
    narrowerModeMutationCalls: narrowerMode.mutationCalls(),
    wideningBlankMutationCalls: wideningBlank.mutationCalls(),
    justificationOnlyMutationCalls: justificationOnly.mutationCalls(),
    validWideningApprovalCalls: validWidening.approvalCalls(),
    mutationsBeforeApproval,
    validWideningMutationCalls: validWidening.mutationCalls(),
    validWideningMutationModes: validWidening.mutationModes(),
  }
}

process.stdout.write(JSON.stringify({
  write: await verifyTool('write'),
  edit: await verifyTool('edit'),
}))
